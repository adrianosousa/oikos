/** @typedef {import('pear-interface')} */ /* global Pear */
/**
 * Oikos Companion — Pear Runtime P2P Client
 *
 * Lightweight companion app that connects to a running oikos-wallet
 * over Hyperswarm. No sidecar, no Node.js, no Express.
 *
 * The Bare main process:
 * 1. Loads/creates Ed25519 companion keypair
 * 2. Derives companion topic (BLAKE2b, matches CompanionCoordinator)
 * 3. Connects to agent's oikos-app via Hyperswarm Noise
 * 4. Opens protomux oikos/companion channel
 * 5. Caches incoming state, serves internal HTTP API for renderer
 *
 * Architecture:
 *   Agent (oikos-wallet) <== Hyperswarm Noise E2E ==> This (Bare main)
 *                                                      |
 *                                                  bare-http1 :13421
 *                                                      |
 *                                                  Electron Renderer
 */
import Runtime from 'pear-electron'
import Bridge from 'pear-bridge'
import http from 'bare-http1'
import fs from 'bare-fs'
import path from 'bare-path'
import os from 'bare-os'
import env from 'bare-env'
import b4a from 'b4a'
import sodium from 'sodium-universal'
import Hyperswarm from 'hyperswarm'
import Protomux from 'protomux'
import c from 'compact-encoding'

const INTERNAL_PORT = 13421

// ── State cache (updated by companion channel messages) ──

const state = {
  connected: false,
  balances: [],
  reasoning: { status: 'idle', reasoning: '', decision: '' },
  policies: [],
  swarm: { enabled: false, peersConnected: 0, activeRooms: 0, announcements: 0, economics: {} },
  executions: [],
  approvalRequests: [],
  instructions: [],
  chatMessages: [],
  identity: {},
  lastUpdate: 0,
}

// Pending chat reply resolvers (instruction → wait for chat_reply)
let chatReplyResolve = null

let companionMessage = null
let swarm = null

// ── 1. Keypair management ──

function loadOrCreateKeypair (filepath) {
  try {
    const dir = path.dirname(filepath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    if (fs.existsSync(filepath)) {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
      return {
        publicKey: b4a.from(data.publicKey, 'hex'),
        secretKey: b4a.from(data.secretKey, 'hex')
      }
    }
  } catch { /* create new */ }

  const publicKey = b4a.alloc(sodium.crypto_sign_PUBLICKEYBYTES)
  const secretKey = b4a.alloc(sodium.crypto_sign_SECRETKEYBYTES)
  sodium.crypto_sign_keypair(publicKey, secretKey)

  const dir = path.dirname(filepath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filepath, JSON.stringify({
    publicKey: b4a.toString(publicKey, 'hex'),
    secretKey: b4a.toString(secretKey, 'hex')
  }))

  return { publicKey, secretKey }
}

// ── 2. Configuration ──

const home = os.homedir()
const keypairPath = path.join(home, '.oikos', 'companion-keypair.json')
const keypair = loadOrCreateKeypair(keypairPath)
const companionPubkey = b4a.toString(keypair.publicKey, 'hex')

// Try env first, then auto-detect from ~/.oikos/agent-pubkey.txt (local pairing)
let agentPubkey = env.OIKOS_AGENT_PUBKEY || null
if (!agentPubkey) {
  try {
    const autoPath = path.join(home, '.oikos', 'agent-pubkey.txt')
    if (fs.existsSync(autoPath)) {
      agentPubkey = fs.readFileSync(autoPath, 'utf-8').trim()
      console.log('[companion] Auto-detected agent pubkey from ~/.oikos/')
    }
  } catch { /* no auto-connect */ }
}

const topicSeed = env.OIKOS_TOPIC_SEED || 'oikos-companion-default'

console.log('[companion] Pubkey:', companionPubkey.slice(0, 16) + '...')
console.log('[companion] Set this as COMPANION_OWNER_PUBKEY on your agent.')

if (!agentPubkey) {
  console.log('[companion] No OIKOS_AGENT_PUBKEY set. Running in offline mode.')
  console.log('[companion] Set OIKOS_AGENT_PUBKEY=<agent swarm pubkey> to connect.')
}

// ── 3. Hyperswarm companion client ──

function sendToAgent (msg) {
  if (!state.connected || !companionMessage) return false
  try {
    const m = companionMessage
    m.send(b4a.from(JSON.stringify(msg)))
    return true
  } catch {
    return false
  }
}

function handleAgentMessage (buf) {
  try {
    const text = b4a.toString(buf, 'utf-8')
    const msg = JSON.parse(text)
    state.lastUpdate = Date.now()

    switch (msg.type) {
      case 'balance_update':
        state.balances = msg.balances || []
        break
      case 'agent_reasoning':
        state.reasoning = {
          status: msg.status || 'idle',
          reasoning: msg.reasoning || '',
          decision: msg.decision || ''
        }
        break
      case 'policy_update':
        state.policies = msg.policies || []
        break
      case 'swarm_status':
        state.swarm = {
          enabled: true,
          peersConnected: msg.peersConnected || 0,
          activeRooms: msg.activeRooms || 0,
          announcements: msg.announcements || 0,
          boardPeers: msg.boardPeers || [],
          announcementList: msg.announcementList || [],
          roomList: msg.roomList || [],
          identity: msg.identity || null,
          economics: msg.economics || {}
        }
        break
      case 'execution_notify':
        state.executions.push(msg.result)
        if (state.executions.length > 50) state.executions.shift()
        break
      case 'approval_request':
        state.approvalRequests.push(msg)
        break
      case 'address_update':
        state.addresses = msg.addresses || []
        break
      case 'identity_update':
        state.identity = msg.identity || {}
        break
      case 'chat_reply': {
        // Agent brain replied to our instruction via protomux
        const agentMsg = {
          id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
          text: msg.text || '',
          from: 'agent',
          brainName: msg.brainName || 'unknown',
          timestamp: msg.timestamp || Date.now()
        }
        state.chatMessages.push(agentMsg)
        if (state.chatMessages.length > 100) state.chatMessages.shift()
        console.log('[companion] Chat reply from ' + agentMsg.brainName + ': ' + agentMsg.text.slice(0, 60) + '...')
        // Resolve any pending chat request
        if (chatReplyResolve) {
          chatReplyResolve(agentMsg)
          chatReplyResolve = null
        }
        break
      }
      default:
        console.log('[companion] Unknown message:', msg.type)
    }
  } catch {
    console.log('[companion] Failed to parse agent message')
  }
}

async function connectToAgent () {
  if (!agentPubkey) return

  const ownerPubkeyBuf = keypair.publicKey
  const companionTopic = b4a.alloc(32)
  sodium.crypto_generichash(
    companionTopic,
    b4a.from('oikos-companion-v0:' + topicSeed),
    ownerPubkeyBuf
  )

  console.log('[companion] Topic:', b4a.toString(companionTopic, 'hex').slice(0, 16) + '...')
  console.log('[companion] Looking for agent:', agentPubkey.slice(0, 16) + '...')

  swarm = new Hyperswarm({ keyPair: keypair })

  swarm.on('connection', (socket) => {
    const remotePubkey = socket.remotePublicKey
    if (!remotePubkey) return

    console.log('[companion] Connected to:', b4a.toString(remotePubkey, 'hex').slice(0, 16) + '...')

    const mux = Protomux.from(socket)
    const channel = mux.createChannel({
      protocol: 'oikos/companion',
      id: null,
      unique: true,
      messages: [{
        encoding: c.raw,
        onmessage: (buf) => handleAgentMessage(buf)
      }],
      onclose: () => {
        console.log('[companion] Channel closed.')
        state.connected = false
        companionMessage = null
      }
    })

    companionMessage = channel.messages[0]
    channel.open()
    state.connected = true

    socket.on('close', () => {
      state.connected = false
      companionMessage = null
      console.log('[companion] Disconnected. Reconnecting...')
    })

    // Ping to trigger immediate state push from agent
    sendToAgent({ type: 'ping', timestamp: Date.now() })
    console.log('[companion] Channel open. Receiving state updates.')
  })

  const discovery = swarm.join(companionTopic, { server: false, client: true })
  await discovery.flushed()
  console.log('[companion] Joined topic. Searching for agent...')
}

// ── 4. Internal HTTP API (bare-http1) ──

function readBody (req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()))
      } catch {
        resolve({})
      }
    })
  })
}

function json (res, data, status) {
  res.statusCode = status || 200
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.end(JSON.stringify(data))
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.statusCode = 204
    res.end()
    return
  }

  const url = req.url || '/'

  // ── GET endpoints ──

  if (url === '/api/health') {
    return json(res, {
      status: 'ok',
      walletConnected: state.connected,
      swarmEnabled: state.swarm.enabled,
      companionConnected: state.connected,
      eventsBuffered: state.executions.length
    })
  }

  if (url === '/api/state') {
    return json(res, {
      status: state.connected ? 'running' : 'disconnected',
      balances: state.balances,
      recentResults: state.executions.slice(-10),
      swarmEvents: [],
      eventsSeen: state.executions.length,
      proposalsSent: state.executions.length,
      proposalsApproved: state.executions.filter(e => e && e.status === 'executed').length,
      proposalsRejected: state.executions.filter(e => e && e.status === 'rejected').length,
      defiOps: 0,
      lastReasoning: state.reasoning.reasoning || (state.connected ? 'Connected to agent.' : 'Not connected.'),
      lastDecision: state.reasoning.decision || '--'
    })
  }

  if (url === '/api/balances') {
    return json(res, { balances: state.balances })
  }

  if (url === '/api/addresses') {
    return json(res, { addresses: state.addresses || [] })
  }

  if (url === '/api/policies') {
    return json(res, { policies: state.policies })
  }

  if (url.startsWith('/api/audit')) {
    return json(res, { entries: state.executions })
  }

  if (url === '/api/swarm') {
    return json(res, {
      enabled: state.swarm.enabled,
      peersConnected: state.swarm.peersConnected,
      boardPeers: state.swarm.boardPeers || [],
      announcements: state.swarm.announcementList || [],
      activeRooms: state.swarm.roomList || [],
      identity: state.swarm.identity || null,
      economics: state.swarm.economics || {},
      recentEvents: []
    })
  }

  if (url === '/api/economics') {
    return json(res, { enabled: state.swarm.enabled, economics: state.swarm.economics })
  }

  if (url === '/api/valuation') {
    // Simple client-side valuation from cached balances
    const prices = { USDT: 1, USAT: 1, XAUT: 2400, BTC: 60000, ETH: 3000 }
    const decimals = { USDT: 6, USAT: 6, XAUT: 6, BTC: 8, ETH: 18 }
    let totalUsd = 0
    const assets = (state.balances || []).map(b => {
      const sym = (b.symbol || '').toUpperCase()
      const price = prices[sym] || 0
      const dec = decimals[sym] || 18
      const human = Number(b.balance || 0) / Math.pow(10, dec)
      const usd = human * price
      totalUsd += usd
      return { symbol: sym, chain: b.chain, balance: b.balance, humanBalance: human, usdValue: usd, price }
    })
    return json(res, { totalUsd, assets, updatedAt: state.lastUpdate })
  }

  if (url === '/api/prices') {
    return json(res, {
      source: 'companion-cache',
      prices: [
        { symbol: 'USDT', usd: 1 },
        { symbol: 'USAT', usd: 1 },
        { symbol: 'XAUT', usd: 2400 },
        { symbol: 'BTC', usd: 60000 },
        { symbol: 'ETH', usd: 3000 }
      ]
    })
  }

  if (url === '/api/identity') {
    return json(res, state.identity || {})
  }

  if (url === '/api/companion/state') {
    return json(res, {
      balances: state.balances,
      policies: state.policies,
      swarm: state.swarm,
      events: [],
      instructions: state.instructions.slice(-20),
      companionConnected: state.connected,
      identity: state.identity,
      walletConnected: state.connected
    })
  }

  if (url === '/api/events') {
    return json(res, { events: [] })
  }

  if (url === '/api/companion/instructions') {
    return json(res, { instructions: state.instructions.slice(-50) })
  }

  // ── Chat endpoints (agent-agnostic bridge) ──

  if (url.startsWith('/api/agent/chat/history')) {
    return json(res, { messages: state.chatMessages })
  }

  // ── POST endpoints ──

  if (req.method === 'POST' && url === '/api/agent/chat') {
    const body = await readBody(req)
    const message = String(body.message || '').trim()
    if (!message) return json(res, { error: 'message required' }, 400)
    const from = body.from || 'companion'

    // Store human message
    const humanMsg = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      text: message,
      from: 'human',
      timestamp: Date.now()
    }
    state.chatMessages.push(humanMsg)
    if (state.chatMessages.length > 100) state.chatMessages.shift()

    // Send instruction via protomux and wait for chat_reply
    const sent = sendToAgent({ type: 'instruction', text: message, timestamp: Date.now() })
    if (!sent) {
      const errMsg = {
        id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        text: 'Agent not connected. Message queued as instruction.',
        from: 'agent',
        timestamp: Date.now()
      }
      state.chatMessages.push(errMsg)
      state.instructions.push({ text: message, timestamp: Date.now() })
      return json(res, { reply: errMsg.text, from: 'agent', brainName: 'offline' })
    }

    // Wait for chat_reply (timeout 120s — Ollama 8B can take 30-60s for complex queries)
    try {
      const reply = await new Promise((resolve, reject) => {
        chatReplyResolve = resolve
        setTimeout(() => {
          if (chatReplyResolve === resolve) {
            chatReplyResolve = null
            reject(new Error('timeout'))
          }
        }, 120000)
      })
      return json(res, {
        reply: reply.text,
        from: 'agent',
        brainName: reply.brainName || 'unknown',
        messageId: reply.id
      })
    } catch {
      return json(res, {
        reply: 'Agent did not respond in time. The instruction was sent.',
        from: 'agent',
        brainName: 'timeout'
      })
    }
  }

  if (req.method === 'POST' && url === '/api/companion/instruct') {
    const body = await readBody(req)
    const text = String(body.text || '').trim()
    if (!text) return json(res, { error: 'text required' }, 400)

    const instruction = { text, timestamp: Date.now() }
    state.instructions.push(instruction)
    if (state.instructions.length > 50) state.instructions.shift()

    const sent = sendToAgent({ type: 'instruction', text, timestamp: Date.now() })
    return json(res, { ok: true, sent, queued: state.instructions.length })
  }

  if (req.method === 'POST' && url === '/api/companion/propose') {
    const body = await readBody(req)
    // Translate proposal into an instruction for the agent
    const type = body.type || 'payment'
    let text = ''
    if (type === 'swap') {
      text = `Swap ${body.amount} ${body.symbol} to ${body.toSymbol}. Reason: ${body.reason || 'companion'}`
    } else {
      text = `Send ${body.amount} ${body.symbol} to ${body.to}. Reason: ${body.reason || 'companion'}`
    }
    const sent = sendToAgent({ type: 'instruction', text, timestamp: Date.now() })
    return json(res, { ok: true, sent, instruction: text })
  }

  if (req.method === 'POST' && url === '/api/simulate') {
    // Simulate not available over companion channel
    return json(res, { error: 'Simulate not available in companion mode. Use Chat to instruct the agent.' }, 501)
  }

  // ── Logo ──
  if (url === '/logo.png') {
    try {
      // Try multiple paths — Bare CWD and import.meta may differ
      const dir = typeof import.meta.dirname === 'string' ? import.meta.dirname : '.'
      const candidates = [
        path.join(dir, 'assets', 'logo.png'),
        path.resolve('assets', 'logo.png'),
        path.join(home, 'sovclaw', 'assets', 'logo.png')
      ]
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          const data = fs.readFileSync(candidate)
          res.setHeader('Content-Type', 'image/png')
          res.end(data)
          return
        }
      }
      res.statusCode = 404
      res.end()
      return
    } catch {
      res.statusCode = 404
      res.end()
      return
    }
  }

  // 404
  json(res, { error: 'not found' }, 404)
})

server.listen(INTERNAL_PORT, '127.0.0.1', () => {
  console.log('[companion] Internal API: http://127.0.0.1:' + INTERNAL_PORT)
})

// ── 5. Start Electron renderer (must happen before any slow async work) ──

const bridge = new Bridge()
await bridge.ready()

const runtime = new Runtime()
const pipe = await runtime.start({ bridge })

pipe.on('close', () => {
  if (swarm) swarm.destroy()
  Pear.exit()
})

// ── 6. Connect to agent (non-blocking — after Runtime is up) ──

connectToAgent().catch((err) => {
  console.log('[companion] Swarm connect error:', err.message)
})

console.log('[companion] Oikos Companion ready.')
if (agentPubkey) {
  console.log('[companion] Connecting to agent over Hyperswarm...')
} else {
  console.log('[companion] Offline mode. Set OIKOS_AGENT_PUBKEY to connect.')
}

Pear.teardown(async () => {
  console.log('[companion] Shutting down.')
  if (swarm) await swarm.destroy()
})
