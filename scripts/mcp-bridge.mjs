#!/usr/bin/env node
/**
 * MCP stdio bridge — connects Claude Code to the Oikos wallet MCP server.
 *
 * Translates stdio JSON-RPC (what Claude Code speaks) to HTTP POST
 * (what the oikos-wallet MCP server speaks at localhost:3420/mcp).
 *
 * Usage:
 *   node scripts/mcp-bridge.mjs              # default port 3420
 *   OIKOS_PORT=3421 node scripts/mcp-bridge.mjs  # custom port
 *
 * Add to .claude/settings.json:
 *   "mcpServers": {
 *     "oikos": { "command": "node", "args": ["scripts/mcp-bridge.mjs"] }
 *   }
 */

const PORT = process.env.OIKOS_PORT || '3420'
const MCP_URL = `http://127.0.0.1:${PORT}/mcp`

let buffer = ''

process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  // Process complete JSON-RPC messages (newline-delimited)
  let newlineIdx
  while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIdx).trim()
    buffer = buffer.slice(newlineIdx + 1)
    if (line) handleLine(line)
  }
})

process.stdin.on('end', () => {
  process.exit(0)
})

async function handleLine(line) {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    writeError(null, -32700, 'Parse error')
    return
  }

  const { id, method, params } = request

  // Handle MCP protocol lifecycle locally (no need to proxy these)
  if (method === 'initialize') {
    writeResult(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'oikos-wallet', version: '1.0.0' },
    })
    return
  }

  if (method === 'notifications/initialized') {
    // Client ack — no response needed
    return
  }

  // Proxy everything else to the oikos MCP server
  try {
    const res = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: id ?? 1,
        method,
        params: params || {},
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      writeError(id, -32000, `Oikos MCP server error: ${res.status} ${text.slice(0, 200)}`)
      return
    }

    const data = await res.json()

    // Forward the response as-is (it's already JSON-RPC 2.0)
    if (data.error) {
      writeError(id, data.error.code || -32000, data.error.message, data.error.data)
    } else {
      writeResult(id, data.result)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    writeError(id, -32000, `Cannot reach oikos-wallet at ${MCP_URL}: ${msg}`)
  }
}

function writeResult(id, result) {
  const response = { jsonrpc: '2.0', id, result }
  process.stdout.write(JSON.stringify(response) + '\n')
}

function writeError(id, code, message, data) {
  const response = { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } }
  process.stdout.write(JSON.stringify(response) + '\n')
}

// Quiet stderr log
process.stderr.write(`[mcp-bridge] Proxying to ${MCP_URL}\n`)
