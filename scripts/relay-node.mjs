#!/usr/bin/env node
/**
 * Oikos DHT Relay Node — persistent daemon
 *
 * Provides relay service for Hyperswarm peers that can't holepunch directly
 * (Docker containers, restrictive NATs, double-randomized NATs).
 *
 * Persists keypair to disk so the pubkey survives restarts.
 * Run as systemd service for always-on relay.
 *
 * Usage:
 *   node scripts/relay-node.mjs [--keypair /path/to/keypair.json]
 *
 * Systemd:
 *   sudo cp scripts/oikos-relay.service /etc/systemd/system/
 *   sudo systemctl enable --now oikos-relay
 */

import DHT from 'hyperdht'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'

// ── Config ──

const KEYPAIR_DIR = join(homedir(), '.oikos')
const DEFAULT_KEYPAIR_PATH = join(KEYPAIR_DIR, 'relay-keypair.json')

// Parse --keypair flag
const keypairIdx = process.argv.indexOf('--keypair')
const keypairPath = keypairIdx !== -1 && process.argv[keypairIdx + 1]
  ? process.argv[keypairIdx + 1]
  : DEFAULT_KEYPAIR_PATH

// ── Keypair persistence ──

function loadOrCreateKeypair(path) {
  if (existsSync(path)) {
    const data = JSON.parse(readFileSync(path, 'utf8'))
    return {
      publicKey: Buffer.from(data.publicKey, 'hex'),
      secretKey: Buffer.from(data.secretKey, 'hex'),
    }
  }

  // Generate new keypair
  const kp = DHT.keyPair()

  // Ensure directory exists
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  writeFileSync(path, JSON.stringify({
    publicKey: kp.publicKey.toString('hex'),
    secretKey: kp.secretKey.toString('hex'),
  }, null, 2), { mode: 0o600 })

  console.log(`[relay] Generated new keypair → ${path}`)
  return kp
}

// ── Start ──

const keyPair = loadOrCreateKeypair(keypairPath)

const node = new DHT({
  ephemeral: false,
  keyPair,
})

await node.ready()

// CRITICAL: To be findable by pubkey on the DHT, we need a SERVER listening
// on the keypair. Just node.ready() or node.listen() only binds the UDP socket
// but doesn't announce the keypair to the DHT. createServer() + server.listen()
// registers the pubkey so peers can do dht.connect(pubkey) and find us.
const server = node.createServer()
await server.listen(keyPair)

const pubkey = keyPair.publicKey.toString('hex')
const addr = node.address()

console.log(`[oikos-relay] DHT relay node ready`)
console.log(`[oikos-relay] Pubkey: ${pubkey}`)
console.log(`[oikos-relay] Listening: ${addr.host}:${addr.port}`)
console.log(`[oikos-relay] Keypair: ${keypairPath}`)
console.log(``)
console.log(`Set this on each agent:`)
console.log(`  SWARM_RELAY_PUBKEY=${pubkey}`)

// Graceful shutdown
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    console.log(`\n[oikos-relay] ${sig} received, shutting down...`)
    await server.close()
    await node.destroy()
    process.exit(0)
  })
}
