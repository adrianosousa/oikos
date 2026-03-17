#!/usr/bin/env node
/**
 * Claude Brain Bridge — connects the Oikos Pear app to Claude API.
 *
 * A tiny HTTP server that receives chat from oikos-wallet's HttpBrainAdapter
 * and proxies to the Anthropic Claude API. Same wallet, bigger brain.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node scripts/claude-brain.mjs
 *   # Then set in .env:
 *   #   BRAIN_TYPE=http
 *   #   BRAIN_CHAT_URL=http://127.0.0.1:3421/chat
 *
 * The wallet context (balances, policies, swarm state) is injected
 * into Claude's system prompt automatically.
 */

import { createServer } from 'node:http'

const PORT = parseInt(process.env.CLAUDE_BRAIN_PORT || '3421', 10)
const API_KEY = process.env.ANTHROPIC_API_KEY || ''
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514'
const MAX_TOKENS = 1024

if (!API_KEY) {
  console.error('[claude-brain] ERROR: ANTHROPIC_API_KEY not set')
  console.error('[claude-brain] Usage: ANTHROPIC_API_KEY=sk-ant-... node scripts/claude-brain.mjs')
  process.exit(1)
}

const SYSTEM_PROMPT = `You are the Oikos Agent — an autonomous AI managing a self-custodial multi-chain cryptocurrency wallet via the Oikos Protocol.

You operate through MCP tools. All operations go through the PolicyEngine in the Wallet Isolate (a separate process). You NEVER have access to private keys or seed phrases.

TO EXECUTE A TOOL, output an ACTION line with valid JSON. The system will parse and execute it automatically.

FORMAT (one action per line, must be valid JSON):
ACTION: {"tool": "TOOL_NAME", "args": {ARGS}}

AVAILABLE TOOLS:
Wallet: propose_payment(amount,symbol,chain,to,reason,confidence), propose_swap(amount,symbol,toSymbol,chain,reason,confidence), propose_bridge(amount,symbol,fromChain,toChain,reason,confidence), propose_yield(amount,symbol,chain,protocol,action,reason,confidence), wallet_balance_all, wallet_address, policy_status
Swarm: swarm_announce(category,title,description,minPrice,maxPrice,symbol,tags), swarm_remove_announcement(announcementId), swarm_bid(announcementId,price,symbol,reason), swarm_accept_bid(announcementId), swarm_submit_payment(announcementId), swarm_cancel_room(announcementId), swarm_room_state(announcementId), swarm_state
Read-only: audit_log, agent_state

RULES:
- When the user gives a COMMAND (send, swap, sell, buy, bridge, deposit, announce, remove), output an ACTION line.
- When the user asks a QUESTION (what strategy, should I, how, why, explain), give thoughtful advice using your knowledge of DeFi, portfolio theory, and market dynamics. Do NOT execute unless told "do it".
- You can include explanation before or after ACTION lines.
- All writes go through PolicyEngine. If rejected, explain the violation.
- Be concise but informative. You manage real value.
- You NEVER have access to seed phrases or private keys.`

/** Conversation history (in-memory, per-session) */
const history = []

function buildWalletContext(context) {
  if (!context) return ''
  const lines = []

  if (context.balances?.length > 0) {
    lines.push('Balances: ' + context.balances.map(b => `${b.symbol}/${b.chain}=${b.formatted}`).join(', '))
  }
  if (context.policies?.length > 0) {
    lines.push('Policies: ' + context.policies.map(p => `${p.rule}:${p.remaining ?? p.status ?? 'ok'}`).join(', '))
  }
  if (context.swarmPeers > 0 || context.swarmAnnouncements?.length > 0) {
    lines.push(`Swarm: ${context.swarmPeers} peers`)
    for (const a of (context.swarmAnnouncements || []).slice(0, 8)) {
      const price = a.priceRange ? `${a.priceRange.min}-${a.priceRange.max}${a.priceRange.symbol}` : '?'
      lines.push(` [${a.id.slice(0, 8)}] ${a.category} "${a.title}" by ${a.agentName} (${price})`)
    }
  }
  if (context.swarmRooms?.length > 0) {
    lines.push('Rooms:')
    for (const r of context.swarmRooms.slice(0, 5)) {
      lines.push(` [${r.announcementId.slice(0, 8)}] ${r.status} ${r.bids}bids`)
    }
  }
  return lines.join('\n')
}

async function callClaude(message, context) {
  const walletState = buildWalletContext(context)
  const system = walletState
    ? `${SYSTEM_PROMPT}\n\nCURRENT WALLET STATE:\n${walletState}`
    : SYSTEM_PROMPT

  // Add user message to history
  history.push({ role: 'user', content: message })

  // Keep last 16 messages (8 turns)
  while (history.length > 16) history.shift()

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [...history],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Claude API ${res.status}: ${text.slice(0, 300)}`)
  }

  const data = await res.json()
  const reply = data.content?.[0]?.text ?? ''

  // Add assistant reply to history
  history.push({ role: 'assistant', content: reply })

  return reply
}

const server = createServer(async (req, res) => {
  // CORS + health
  if (req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', model: MODEL, historyLength: history.length }))
    return
  }

  if (req.method !== 'POST' || req.url !== '/chat') {
    res.writeHead(404)
    res.end('Not found')
    return
  }

  // Read body
  let body = ''
  for await (const chunk of req) body += chunk

  try {
    const { message, context } = JSON.parse(body)
    if (!message) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'message required' }))
      return
    }

    console.error(`[claude-brain] <- "${message.slice(0, 80)}"`)
    const reply = await callClaude(message, context)
    console.error(`[claude-brain] -> "${reply.slice(0, 80)}"`)

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ reply }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[claude-brain] ERROR: ${msg}`)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: msg }))
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.error(`[claude-brain] Claude brain bridge ready`)
  console.error(`[claude-brain] Model: ${MODEL}`)
  console.error(`[claude-brain] Listening: http://127.0.0.1:${PORT}/chat`)
  console.error(`[claude-brain] Set in .env:`)
  console.error(`[claude-brain]   BRAIN_TYPE=http`)
  console.error(`[claude-brain]   BRAIN_CHAT_URL=http://127.0.0.1:${PORT}/chat`)
})
