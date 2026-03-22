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

// Prevent uncaught Hyperswarm errors (ETIMEDOUT, etc.) from crashing the Pear app
if (typeof Bare !== 'undefined') {
  Bare.on('uncaughtException', (err) => {
    console.log('[companion] Uncaught error (recovered):', err.message || err)
    console.log('[companion] Stack:', err.stack || 'no stack')
  })
}

// Also catch on server errors
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('error', (e) => {
    console.log('[companion] Global error:', e.message || e)
  })
}

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
  prices: [],
  addresses: [],
  strategies: [],
  auditEntries: [],
  lastUpdate: 0,
}

// Pending chat reply resolvers (instruction → wait for chat_reply)
let chatReplyResolve = null

// Pending protomux request/response correlators (requestId → resolve callback)
const pendingRequests = new Map()

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

// Wallet dashboard URL for direct API access (prices, etc.)
const walletUrl = env.OIKOS_WALLET_URL || 'http://127.0.0.1:3420'

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
      case 'audit_update':
        state.auditEntries = msg.entries || []
        break
      case 'approval_request':
        state.approvalRequests.push(msg)
        break
      case 'address_update':
        state.addresses = msg.addresses || []
        break
      case 'price_update':
        state.prices = msg.prices || []
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
      case 'strategy_update':
        state.strategies = (msg.strategies || []).map(s => ({
          id: (s.filename || '').replace('.md', ''),
          name: ((s.content || '').match(/^#\s+(.+)$/m) || [])[1] || (s.filename || '').replace('.md', ''),
          filename: s.filename,
          source: s.source || 'human',
          enabled: s.enabled,
          content: s.content,
          createdAt: '',
        }))
        break
      case 'strategy_result': {
        const cb = pendingRequests.get(msg.requestId)
        if (cb) { pendingRequests.delete(msg.requestId); cb(msg) }
        break
      }
      case 'policy_result': {
        const cb = pendingRequests.get(msg.requestId)
        if (cb) { pendingRequests.delete(msg.requestId); cb(msg) }
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

  // Use the BOARD topic — same as the swarm. This piggybacks the companion
  // channel on the existing swarm connection (already NAT-traversed, relay-bridged).
  // protomux multiplexes: swarm uses oikos/board, we use oikos/companion, same socket.
  const swarmId = env.SWARM_ID || 'oikos-hackathon-v1'
  const boardKey = b4a.from('oikos-board-v0--')  // 16 bytes, matches topic.ts
  const boardTopic = b4a.alloc(32)
  sodium.crypto_generichash(boardTopic, b4a.from(swarmId), boardKey)

  console.log('[companion] Board topic:', b4a.toString(boardTopic, 'hex').slice(0, 16) + '...')
  console.log('[companion] Looking for agent:', agentPubkey.slice(0, 16) + '...')

  const swarmOpts = { keyPair: keypair }
  const relayHex = env.SWARM_RELAY_PUBKEY || 'e7ab6adb1a18e7d22649691dc65f5789f6fdd25422b0770ab068ee9bbe0a3003'
  if (relayHex) {
    try {
      const relayBuf = b4a.from(relayHex, 'hex')
      swarmOpts.relayThrough = () => relayBuf
    } catch { /* skip */ }
  }

  swarm = new Hyperswarm(swarmOpts)

  // Maintain persistent connection to relay for NAT traversal
  if (relayHex) {
    try {
      swarm.joinPeer(b4a.from(relayHex, 'hex'))
      console.log('[companion] Joined relay peer:', relayHex.slice(0, 16) + '...')
    } catch { /* non-fatal */ }
  }

  // Catch uncaught errors on swarm to prevent crashes
  swarm.on('error', (err) => {
    console.log('[companion] Swarm error (non-fatal):', err.message || err)
  })

  // Rate-limit noisy peer logs (relay connects/disconnects/timeouts loop)
  const seenPeers = new Map()
  const PEER_LOG_INTERVAL = 60000 // log each non-agent peer at most once per minute

  swarm.on('connection', (socket) => {
    const remotePubkey = socket.remotePublicKey
    if (!remotePubkey) return

    const remoteHex = b4a.toString(remotePubkey, 'hex')

    // Catch socket errors to prevent uncaught ETIMEDOUT crashes
    socket.on('error', () => { /* non-fatal, suppressed */ })

    // Only open companion channel with the expected agent, not relay or other peers
    if (remoteHex !== agentPubkey) {
      const now = Date.now()
      const lastLog = seenPeers.get(remoteHex) || 0
      if (now - lastLog > PEER_LOG_INTERVAL) {
        console.log('[companion] Ignoring non-agent peer:', remoteHex.slice(0, 16) + '...')
        seenPeers.set(remoteHex, now)
      }
      return
    }

    console.log('[companion] Agent connected:', remoteHex.slice(0, 16) + '...')

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
      console.log('[companion] Disconnected. Will reconnect via DHT...')
    })

    // Ping to trigger immediate state push from agent
    sendToAgent({ type: 'ping', timestamp: Date.now() })
    console.log('[companion] Channel open. Receiving state updates.')
  })

  const discovery = swarm.join(boardTopic, { server: false, client: true })
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

/** HTTP GET helper for bare-http1 (no fetch in Bare Runtime) */
function httpGet (url) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url)
      const opts = { hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: 'GET', timeout: 3000 }
      const req = http.request(opts, (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString()))
          } catch { resolve(null) }
        })
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
      req.end()
    } catch { resolve(null) }
  })
}

function httpPost (url, body) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url)
      const payload = JSON.stringify(body)
      const opts = {
        hostname: u.hostname, port: u.port || 80,
        path: u.pathname + u.search, method: 'POST', timeout: 10000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      }
      const req = http.request(opts, (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())) }
          catch { resolve(null) }
        })
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
      req.write(payload)
      req.end()
    } catch { resolve(null) }
  })
}

// Send a message over protomux and wait for a correlated response by requestId
function sendProtomuxRequest (msg, timeoutMs) {
  timeoutMs = timeoutMs || 10000
  return new Promise((resolve) => {
    if (!companionMessage) {
      resolve({ error: 'Companion channel not connected' })
      return
    }
    const timer = setTimeout(() => {
      pendingRequests.delete(msg.requestId)
      resolve({ error: 'Timeout waiting for wallet response' })
    }, timeoutMs)
    pendingRequests.set(msg.requestId, (result) => {
      clearTimeout(timer)
      resolve(result)
    })
    try {
      companionMessage.send(Buffer.from(JSON.stringify(msg)))
    } catch (err) {
      clearTimeout(timer)
      pendingRequests.delete(msg.requestId)
      resolve({ error: 'Failed to send: ' + (err.message || String(err)) })
    }
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

  // ── Companion pairing endpoints ──

  if (url === '/api/companion/pubkey') {
    return json(res, { pubkey: companionPubkey })
  }

  if (url === '/api/companion/status') {
    return json(res, {
      connected: state.connected,
      companionPubkey: companionPubkey,
      agentPubkey: agentPubkey ? agentPubkey : null,
      agentPubkeyShort: agentPubkey ? agentPubkey.slice(0, 16) + '...' : null
    })
  }

  if (url === '/api/companion/pair' && req.method === 'POST') {
    try {
      const body = await readBody(req)
      const pk = (body.agentPubkey || '').trim()
      if (!pk || !/^[0-9a-fA-F]{64}$/.test(pk)) {
        return json(res, { error: 'Invalid pubkey. Must be 64 hex chars.' }, 400)
      }
      // Write to persistent file
      const agentPubkeyPath = path.join(home, '.oikos', 'agent-pubkey.txt')
      const dir = path.dirname(agentPubkeyPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(agentPubkeyPath, pk)
      agentPubkey = pk
      console.log('[companion] Paired with agent:', pk.slice(0, 16) + '...')
      // Trigger connection (non-blocking)
      connectToAgent().catch((err) => console.log('[companion] Connect error:', err.message || err))
      return json(res, { success: true, agentPubkey: pk })
    } catch (e) {
      return json(res, { error: 'Failed to pair: ' + (e.message || String(e)) }, 500)
    }
  }

  if (url === '/api/companion/unpair' && req.method === 'POST') {
    try {
      const agentPubkeyPath = path.join(home, '.oikos', 'agent-pubkey.txt')
      if (fs.existsSync(agentPubkeyPath)) fs.unlinkSync(agentPubkeyPath)
      agentPubkey = null
      if (swarm) { swarm.destroy(); swarm = null }
      state.connected = false
      companionMessage = null
      console.log('[companion] Unpaired. Running in offline mode.')
      return json(res, { success: true })
    } catch (e) {
      return json(res, { error: 'Failed to unpair: ' + (e.message || String(e)) }, 500)
    }
  }

  if (url === '/api/health') {
    // Check wallet reachability via HTTP even if companion channel is down
    let walletReachable = state.connected
    if (!walletReachable && walletUrl) {
      try {
        const ping = await httpGet(walletUrl + '/api/swarm')
        walletReachable = !!(ping && ping.enabled !== undefined)
      } catch (e) { /* not reachable */ }
    }
    return json(res, {
      status: 'ok',
      walletConnected: walletReachable,
      swarmEnabled: state.swarm.enabled || walletReachable,
      companionConnected: state.connected,
      eventsBuffered: state.executions.length
    })
  }

  if (url === '/api/state') {
    // Fall back to wallet HTTP when companion not connected
    if (!state.connected && walletUrl) {
      try {
        const data = await httpGet(walletUrl + '/api/state')
        if (data) return json(res, data)
      } catch (e) { /* fall through */ }
    }
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
    // Fall back to wallet HTTP when companion not connected
    if ((!state.balances || state.balances.length === 0) && walletUrl) {
      try {
        const data = await httpGet(walletUrl + '/api/balances')
        if (data) return json(res, data)
      } catch (e) { /* fall through */ }
    }
    return json(res, { balances: state.balances })
  }

  if (url === '/api/addresses') {
    if ((!state.addresses || state.addresses.length === 0) && walletUrl) {
      try {
        const data = await httpGet(walletUrl + '/api/addresses')
        if (data && Array.isArray(data.addresses)) return json(res, data)
      } catch (e) { /* fall through */ }
    }
    return json(res, { addresses: state.addresses || [] })
  }

  if (url === '/api/policies' && req.method === 'GET') {
    // Protomux first when connected to remote agent
    if (state.connected && state.policies.length > 0) {
      return json(res, { policies: state.policies })
    }
    // Fall back to local wallet HTTP
    if (walletUrl) {
      try {
        const data = await httpGet(walletUrl + '/api/policies')
        if (data && data.policies) return json(res, data)
      } catch (e) { /* fall through */ }
    }
    return json(res, { policies: state.policies })
  }

  if (url === '/api/policies' && req.method === 'POST') {
    const body = await readBody(req)
    // Protomux first when connected — modify remote agent's policies
    if (companionMessage) {
      const requestId = 'pr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
      const result = await sendProtomuxRequest({
        type: 'policy_save', rules: body.rules, name: body.name,
        requestId, timestamp: Date.now()
      }, 15000) // longer timeout — includes wallet restart
      return json(res, result)
    }
    // Fall back to local wallet HTTP
    if (walletUrl) {
      try {
        const data = await httpPost(walletUrl + '/api/policies', body)
        return json(res, data || { error: 'No response from wallet' })
      } catch (e) {
        return json(res, { error: 'Failed to update policy' }, 500)
      }
    }
    return json(res, { error: 'Wallet not connected' }, 503)
  }

  if (url === '/api/strategies' && req.method === 'GET') {
    // Protomux first when connected to remote agent
    if (state.connected && state.strategies.length > 0) {
      return json(res, { strategies: state.strategies, modules: [] })
    }
    // Fall back to local wallet HTTP
    if (walletUrl) {
      try {
        const data = await httpGet(walletUrl + '/api/strategies')
        if (data && data.strategies) return json(res, data)
      } catch (e) { /* fall through */ }
    }
    return json(res, { strategies: state.strategies.length > 0 ? state.strategies : [], modules: [] })
  }

  if (url === '/api/strategies' && req.method === 'POST') {
    const body = await readBody(req)
    // Protomux first when connected — modify remote agent's strategies
    if (companionMessage) {
      const requestId = 'sr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
      const result = await sendProtomuxRequest({
        type: 'strategy_save', filename: body.filename, content: body.content,
        requestId, timestamp: Date.now()
      })
      return json(res, result)
    }
    return json(res, { error: 'Wallet not connected' }, 503)
  }

  if (url === '/api/strategies/toggle' && req.method === 'POST') {
    const body = await readBody(req)
    // Protomux first when connected — toggle remote agent's strategies
    if (companionMessage) {
      const requestId = 'st-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
      const result = await sendProtomuxRequest({
        type: 'strategy_toggle', filename: body.filename, enabled: body.enabled,
        requestId, timestamp: Date.now()
      })
      return json(res, result)
    }
    return json(res, { error: 'Wallet not connected' }, 503)
  }

  if (url === '/api/strategies/delete' && req.method === 'POST') {
    // Protomux first when connected
    if (companionMessage) {
      const body = await readBody(req)
      const requestId = 'sd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
      const result = await sendProtomuxRequest({
        type: 'strategy_delete', filename: body.filename,
        requestId, timestamp: Date.now()
      })
      return json(res, result)
    }
    // Fall back to local wallet HTTP
    if (walletUrl) {
      try {
        const body = await readBody(req)
        const data = await httpPost(walletUrl + '/api/strategies/delete', body)
        return json(res, data || { error: 'No response from wallet' })
      } catch (e) {
        return json(res, { error: 'Failed to delete strategy' }, 500)
      }
    }
    return json(res, { error: 'Wallet not connected' }, 503)
  }

  if (url.startsWith('/api/audit')) {
    // When connected to remote agent, ONLY show protomux data (never local wallet)
    if (state.connected) {
      // Prefer full audit trail from audit_update; fall back to execution notifications
      const entries = state.auditEntries.length > 0 ? state.auditEntries : state.executions
      return json(res, { entries })
    }
    // Only fall back to local wallet HTTP when NOT connected
    if (walletUrl) {
      try {
        const data = await httpGet(walletUrl + url)
        if (data && data.entries && data.entries.length > 0) return json(res, data)
      } catch (e) { /* fall through */ }
    }
    return json(res, { entries: [] })
  }

  // ── Auth API — proxy to wallet dashboard ──
  if (url.startsWith('/api/auth/') && walletUrl) {
    try {
      if (req.method === 'GET') {
        const data = await httpGet(walletUrl + url)
        return json(res, data)
      } else if (req.method === 'POST') {
        const body = await readBody(req)
        const data = await httpPost(walletUrl + url, body)
        return json(res, data)
      }
    } catch (e) {
      return json(res, { error: 'Auth proxy failed: ' + e.message }, 500)
    }
  }

  if (url === '/api/swarm') {
    // If companion connected, use live state; otherwise fall back to wallet HTTP
    if (state.connected && state.swarm.enabled) {
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
    if (walletUrl) {
      try {
        const data = await httpGet(walletUrl + '/api/swarm')
        if (data && data.enabled !== undefined) return json(res, data)
      } catch (e) { /* fall through */ }
    }
    return json(res, {
      enabled: state.swarm.enabled,
      peersConnected: 0, boardPeers: [], announcements: [],
      activeRooms: [], identity: null, economics: {}, recentEvents: []
    })
  }

  if (url === '/api/economics') {
    if (walletUrl && !state.connected) {
      try {
        const data = await httpGet(walletUrl + '/api/economics')
        if (data) return json(res, data)
      } catch (e) { /* fall through */ }
    }
    return json(res, { enabled: state.swarm.enabled, economics: state.swarm.economics })
  }

  if (url === '/api/valuation') {
    // Use live prices from state cache (populated by companion or wallet-direct)
    const fallback = { USDT: 1, USAT: 1, XAUT: 4975, BTC: 73900, ETH: 2300 }
    const livePrices = {}
    if (state.prices && state.prices.length > 0) {
      state.prices.forEach(p => { livePrices[p.symbol] = p.priceUsd })
    }
    const prices = Object.assign({}, fallback, livePrices)
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
    // 1. Try companion channel cache (P2P live)
    if (state.prices && state.prices.length > 0) {
      return json(res, { source: 'agent-live', prices: state.prices })
    }
    // 2. Try fetching directly from wallet dashboard (localhost)
    try {
      const data = await httpGet(walletUrl + '/api/prices')
      if (data && data.prices && data.prices.length > 0) {
        state.prices = data.prices // cache for next request
        return json(res, { source: 'wallet-direct', prices: data.prices })
      }
    } catch { /* wallet not reachable */ }
    // 3. Fallback
    return json(res, {
      source: 'fallback',
      prices: [
        { symbol: 'USDT', priceUsd: 1, source: 'fallback', updatedAt: Date.now() },
        { symbol: 'USAT', priceUsd: 1, source: 'fallback', updatedAt: Date.now() },
        { symbol: 'XAUT', priceUsd: 4975, source: 'fallback', updatedAt: Date.now() },
        { symbol: 'BTC', priceUsd: 73900, source: 'fallback', updatedAt: Date.now() },
        { symbol: 'ETH', priceUsd: 2300, source: 'fallback', updatedAt: Date.now() }
      ]
    })
  }

  // Historical prices — proxy to wallet dashboard
  if (url.startsWith('/api/prices/history/')) {
    try {
      const data = await httpGet(walletUrl + url)
      if (data) return json(res, data)
    } catch { /* wallet not reachable */ }
    return json(res, { symbol: url.split('/').pop(), history: [] })
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
    // Fall back to local wallet HTTP only when not connected
    if (!state.connected && walletUrl) {
      try {
        const limit = new URL(url, 'http://x').searchParams.get('limit') || '50'
        const data = await httpGet(walletUrl + '/api/events?limit=' + limit)
        if (data && data.events) return json(res, data)
      } catch (e) { /* fall through */ }
    }
    return json(res, { events: [] })
  }

  if (url === '/api/companion/instructions') {
    return json(res, { instructions: state.instructions.slice(-50) })
  }

  // ── Chat endpoints (agent-agnostic bridge) ──

  if (url.startsWith('/api/agent/chat/history')) {
    // Fall back to wallet HTTP when companion not connected
    if (state.chatMessages.length === 0 && walletUrl) {
      try {
        const data = await httpGet(walletUrl + url)
        if (data) return json(res, data)
      } catch (e) { /* fall through */ }
    }
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
      // Companion not connected — fall back to HTTP proxy to wallet brain
      if (walletUrl) {
        try {
          const data = await httpPost(walletUrl + '/api/agent/chat', { message, from })
          if (data && data.reply) {
            const agentMsg = {
              id: data.messageId || ('msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
              text: data.reply,
              from: 'agent',
              brainName: data.brainName || 'ollama',
              timestamp: Date.now()
            }
            state.chatMessages.push(agentMsg)
            if (state.chatMessages.length > 100) state.chatMessages.shift()
            return json(res, data)
          }
        } catch (e) { /* wallet not reachable, fall through to offline */ }
      }
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

server.on('error', (err) => {
  console.log('[companion] HTTP server error:', err.message || err)
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
