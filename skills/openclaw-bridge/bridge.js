#!/usr/bin/env node
/**
 * Oikos ↔ OpenClaw Bridge
 *
 * Listens on http://127.0.0.1:3421/oikos/chat
 * Receives: { message, context, from }
 * Returns:  { reply }
 *
 * Routes companion chat messages through an OpenClaw agent,
 * injecting live wallet context as a system message (invisible to UI).
 *
 * Usage:
 *   OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789 \
 *   OPENCLAW_GATEWAY_TOKEN= \
 *   OPENCLAW_SESSION_KEY=agent:main:main \
 *   node bridge.js
 *
 * Oikos env:
 *   BRAIN_TYPE=http
 *   BRAIN_CHAT_URL=http://127.0.0.1:3421/oikos/chat
 */

import http from 'http';

const GATEWAY_URL   = process.env.OPENCLAW_GATEWAY_URL   || 'http://127.0.0.1:18789';
const GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const BRIDGE_PORT   = parseInt(process.env.OIKOS_BRIDGE_PORT || '3421', 10);
const AGENT_ID      = process.env.OPENCLAW_AGENT_ID      || 'main';
const SESSION_KEY   = process.env.OPENCLAW_SESSION_KEY   || 'agent:main:main';

// ── Format wallet context as system message (invisible to UI) ──
function buildSystemContext(ctx) {
  if (!ctx) return null;
  const lines = ['[Oikos Wallet — Live Context]'];

  if (ctx.balances?.length) {
    lines.push('Balances:');
    for (const b of ctx.balances) lines.push(`  ${b.symbol} (${b.chain}): ${b.formatted}`);
  }
  if (ctx.policies?.length) {
    lines.push('Policy status:');
    for (const p of ctx.policies) {
      const label  = p.rule ?? p.name ?? p.id ?? 'policy';
      const detail = p.remaining ?? p.status ?? 'active';
      lines.push(`  ${label}: ${detail}`);
    }
  }
  if (ctx.identity?.registered) {
    lines.push(`Identity: ERC-8004 registered, agentId: ${ctx.identity.agentId}`);
  }
  if (ctx.swarmPeers > 0) lines.push(`Swarm: ${ctx.swarmPeers} peers connected`);
  if (ctx.recentAudit?.length) {
    lines.push(`Last operation: ${ctx.recentAudit[0].type} — ${ctx.recentAudit[0].status}`);
  }
  lines.push('[Message is from the Oikos Companion app via P2P]');
  return lines.join('\n');
}

// ── Forward to OpenClaw ──
async function askAgent(message, context) {
  const systemCtx = buildSystemContext(context);
  const messages  = [];
  if (systemCtx) messages.push({ role: 'system', content: systemCtx });
  messages.push({ role: 'user', content: message }); // clean — no context dump visible

  const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GATEWAY_TOKEN}`,
      'x-openclaw-session-key': SESSION_KEY, // share main session = full memory + context
    },
    body: JSON.stringify({
      model: `openclaw:${AGENT_ID}`,
      messages,
      user: 'oikos-companion',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gateway ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// ── HTTP server ──
const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, agent: AGENT_ID, gateway: GATEWAY_URL }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/oikos/chat') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { message, context } = JSON.parse(body);
      if (!message) { res.writeHead(400); res.end('{"error":"missing message"}'); return; }

      console.log(`[bridge] ← "${message.slice(0, 80)}${message.length > 80 ? '...' : ''}"`);
      const reply = await askAgent(message, context);
      console.log(`[bridge] → "${reply.slice(0, 80)}${reply.length > 80 ? '...' : ''}"`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reply }));
    } catch (err) {
      console.error(`[bridge] Error: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
});

server.listen(BRIDGE_PORT, '127.0.0.1', () => {
  console.log(`[oikos-bridge] Listening on http://127.0.0.1:${BRIDGE_PORT}/oikos/chat`);
  console.log(`[oikos-bridge] Routing to OpenClaw agent "${AGENT_ID}" at ${GATEWAY_URL}`);
});
