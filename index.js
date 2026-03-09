/** @typedef {import('pear-interface')} */ /* global Pear */
/**
 * Oikos — Pear Runtime Main Process
 *
 * Spawns two child processes:
 * 1. Wallet Isolate (Bare Runtime) — keys, policy, signing
 * 2. Agent Brain (Node.js) — LLM reasoning, swarm, dashboard
 *
 * The Brain spawns the Wallet Isolate internally via IPC,
 * so we only need to spawn the Brain here.
 *
 * Auth: 32-byte random token passed via CLI for session security.
 */
import Runtime from 'pear-electron'
import Bridge from 'pear-bridge'
import { spawn } from 'bare-subprocess'
import b4a from 'b4a'
import { randomBytes } from 'hypercore-crypto'

const DASHBOARD_PORT = 3420
const token = b4a.toString(randomBytes(32), 'hex')

console.log('[oikos] Starting Agent Brain...')

// Spawn the Agent Brain as a Node.js sidecar
// Brain boots the Wallet Isolate internally via child_process
const brain = spawn('node', [
  'agent-brain/dist/src/main.js',
], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    DASHBOARD_PORT: String(DASHBOARD_PORT),
    SESSION_TOKEN: token,
    MOCK_LLM: 'true',
    MOCK_EVENTS: 'true',
    MOCK_SWARM: 'true',
  },
})

brain.stdout.on('data', (data) => {
  console.log('[brain]', b4a.toString(data).trim())
})

brain.stderr.on('data', (data) => {
  console.error('[brain]', b4a.toString(data).trim())
})

brain.on('exit', (code) => {
  console.log('[oikos] Brain exited with code', code)
})

// Give Brain a moment to boot before starting the UI
await new Promise(resolve => setTimeout(resolve, 2000))

// Start Electron renderer (loads dashboard)
const bridge = new Bridge()
await bridge.ready()

const runtime = new Runtime()
const pipe = await runtime.start({ bridge })
pipe.on('close', () => {
  brain.kill()
  Pear.exit()
})

console.log(`[oikos] Dashboard at http://127.0.0.1:${DASHBOARD_PORT}`)

Pear.teardown(async () => {
  console.log('[oikos] Shutting down.')
  brain.kill()
})
