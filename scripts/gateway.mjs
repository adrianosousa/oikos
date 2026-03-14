#!/usr/bin/env node
/**
 * Oikos Board Gateway — Public HTTP view of the swarm announcement board.
 *
 * A READ-ONLY observer that joins the Hyperswarm board topic, receives
 * public announcements and heartbeats from agents, and serves a web UI.
 *
 * No wallet. No keys. No private data. Just public DHT discovery.
 *
 * Usage:
 *   node scripts/gateway.mjs [--port 8080] [--swarm-id oikos-hackathon-v1]
 *
 * Like gateway.tzimtzum.io — but for the Oikos agent swarm.
 */

import Hyperswarm from 'hyperswarm';
import Protomux from 'protomux';
import c from 'compact-encoding';
import sodium from 'sodium-universal';
import b4a from 'b4a';
import http from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const PORT = parseInt(getArg('--port', process.env.GATEWAY_PORT || '8080'), 10);
const SWARM_ID = getArg('--swarm-id', process.env.SWARM_ID || 'oikos-hackathon-v1');
const RELAY_PUBKEY = getArg('--relay', process.env.SWARM_RELAY_PUBKEY || 'e7ab6adb1a18e7d22649691dc65f5789f6fdd25422b0770ab068ee9bbe0a3003');

// ── Topic Derivation (mirrors oikos-app/src/swarm/topic.ts) ──

function deriveBoardTopic(swarmId) {
  const key = b4a.from('oikos-board-v0--'); // 16 bytes, same as agents
  const msg = b4a.from(swarmId);
  const out = b4a.alloc(32);
  sodium.crypto_generichash(out, msg, key);
  return out;
}

// ── State ──

const peers = new Map();       // pubkey -> { name, reputation, capabilities, lastSeen }
const announcements = new Map(); // id -> announcement object
const events = [];             // recent events log (last 100)
let totalConnections = 0;

function addEvent(type, detail) {
  events.unshift({ type, detail, timestamp: Date.now() });
  if (events.length > 100) events.length = 100;
}

// ── Protomux Board Channel ──

function setupPeerChannels(socket, remotePubkey) {
  const pubkeyHex = b4a.toString(remotePubkey, 'hex');
  const mux = Protomux.from(socket);

  const channel = mux.createChannel({
    protocol: 'oikos/board',
    id: null,
    unique: true,
    messages: [
      {
        encoding: c.raw,
        onmessage: (buf) => {
          try {
            const text = b4a.toString(buf, 'utf-8');
            const msg = JSON.parse(text);
            handleBoardMessage(msg, pubkeyHex);
          } catch {
            // Invalid JSON — drop silently
          }
        },
      },
    ],
    onclose: () => {
      // Channel closed
    },
  });

  channel.open();
  return channel;
}

function handleBoardMessage(msg, fromPubkey) {
  if (!msg || !msg.type) return;

  if (msg.type === 'heartbeat') {
    peers.set(fromPubkey, {
      name: msg.agentName || 'Unknown',
      reputation: msg.reputation ?? 0,
      capabilities: msg.capabilities || [],
      lastSeen: Date.now(),
      pubkey: fromPubkey,
    });
    // Don't log every heartbeat — just update state
  }

  if (msg.type === 'announcement') {
    announcements.set(msg.id, {
      id: msg.id,
      agentPubkey: msg.agentPubkey || fromPubkey,
      agentName: msg.agentName || 'Unknown',
      reputation: msg.reputation ?? 0,
      category: msg.category || 'service',
      title: msg.title || '',
      description: msg.description || '',
      priceRange: msg.priceRange || null,
      capabilities: msg.capabilities || [],
      expiresAt: msg.expiresAt || 0,
      timestamp: msg.timestamp || Date.now(),
    });
    addEvent('announcement', `${msg.agentName}: ${msg.title}`);
    console.error(`[gateway] Announcement from ${msg.agentName}: ${msg.title}`);
  }
}

// ── Expire old data ──

setInterval(() => {
  const now = Date.now();
  // Remove peers not seen in 5 minutes
  for (const [key, peer] of peers) {
    if (now - peer.lastSeen > 5 * 60 * 1000) {
      peers.delete(key);
      addEvent('peer_expired', `${peer.name} (${key.slice(0, 8)}...)`);
    }
  }
  // Remove expired announcements
  for (const [key, ann] of announcements) {
    if (ann.expiresAt && now > ann.expiresAt) {
      announcements.delete(key);
      addEvent('announcement_expired', ann.title);
    }
  }
}, 30000);

// ── Hyperswarm ──

const boardTopic = deriveBoardTopic(SWARM_ID);
console.error(`[gateway] Swarm ID: ${SWARM_ID}`);
console.error(`[gateway] Board topic: ${b4a.toString(boardTopic, 'hex')}`);

const swarmOpts = {};
if (RELAY_PUBKEY) {
  const relayBuf = b4a.from(RELAY_PUBKEY, 'hex');
  swarmOpts.relayThrough = () => relayBuf;
  console.error(`[gateway] Relay: ${RELAY_PUBKEY.slice(0, 12)}...`);
}

const swarm = new Hyperswarm(swarmOpts);

swarm.on('connection', (socket, info) => {
  const remotePubkey = info.publicKey;
  const pubkeyHex = b4a.toString(remotePubkey, 'hex');
  totalConnections++;

  console.error(`[gateway] Peer connected: ${pubkeyHex.slice(0, 12)}... (total: ${totalConnections})`);
  addEvent('peer_connected', pubkeyHex.slice(0, 12) + '...');

  // Set up protomux board channel
  setupPeerChannels(socket, remotePubkey);

  // Track peer immediately (heartbeat will update name/reputation)
  if (!peers.has(pubkeyHex)) {
    peers.set(pubkeyHex, {
      name: 'Connecting...',
      reputation: 0,
      capabilities: [],
      lastSeen: Date.now(),
      pubkey: pubkeyHex,
    });
  }

  socket.on('close', () => {
    addEvent('peer_disconnected', pubkeyHex.slice(0, 12) + '...');
    console.error(`[gateway] Peer disconnected: ${pubkeyHex.slice(0, 12)}...`);
    // Don't remove immediately — keep for a few heartbeat cycles
    const peer = peers.get(pubkeyHex);
    if (peer) peer.lastSeen = Date.now(); // mark last seen
  });

  socket.on('error', () => {});
});

// Join the board topic as a read-only observer
const discovery = swarm.join(boardTopic, { server: true, client: true });
await discovery.flushed();
console.error(`[gateway] Joined board topic. Waiting for agents...`);

// Also joinPeer the relay for persistent connection
if (RELAY_PUBKEY) {
  swarm.joinPeer(b4a.from(RELAY_PUBKEY, 'hex'));
  console.error(`[gateway] joinPeer relay: ${RELAY_PUBKEY.slice(0, 12)}...`);
}

// ── HTTP Server ──

const boardHtmlPath = join(__dirname, '..', 'oikos-app', 'src', 'dashboard', 'public', 'board.html');

const server = http.createServer((req, res) => {
  // CORS headers for API
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/api/board' || req.url?.startsWith('/api/board?')) {
    const peerList = Array.from(peers.values());
    const annList = Array.from(announcements.values());

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      enabled: true,
      gateway: true,
      identity: {
        pubkey: b4a.toString(swarm.keyPair.publicKey, 'hex'),
        name: 'Oikos Gateway',
        reputation: 1.0,
        capabilities: ['gateway', 'observer'],
      },
      boardPeers: peerList.map(p => ({
        pubkey: p.pubkey,
        name: p.name,
        reputation: p.reputation,
        capabilities: p.capabilities,
        lastSeen: p.lastSeen,
      })),
      announcements: annList.map(a => ({
        id: a.id,
        agentPubkey: a.agentPubkey,
        agentName: a.agentName,
        reputation: a.reputation,
        category: a.category,
        title: a.title,
        description: a.description,
        priceRange: a.priceRange,
        capabilities: a.capabilities,
        expiresAt: a.expiresAt,
        timestamp: a.timestamp,
      })),
      economics: null,
      events: events.slice(0, 30),
      stats: {
        totalConnections,
        activePeers: peerList.length,
        activeAnnouncements: annList.length,
        uptime: process.uptime(),
      },
      timestamp: Date.now(),
    }));
    return;
  }

  if (req.url === '/' || req.url === '/board') {
    // Serve the board HTML — it fetches /api/board which works the same
    try {
      const html = readFileSync(boardHtmlPath, 'utf-8');
      // Patch the title to say "Gateway" instead of just "Board"
      const patched = html
        .replace('<title>Oikos Board</title>', '<title>Oikos Gateway</title>')
        .replace('OIKOS <span>/ board</span>', 'OIKOS <span>/ gateway</span>');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(patched);
    } catch {
      res.writeHead(500);
      res.end('board.html not found — run from repo root');
    }
    return;
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found', routes: ['/', '/board', '/api/board'] }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.error(`[gateway] HTTP server: http://0.0.0.0:${PORT}`);
  console.error(`[gateway] Board UI:    http://0.0.0.0:${PORT}/board`);
  console.error(`[gateway] Board API:   http://0.0.0.0:${PORT}/api/board`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('[gateway] Shutting down...');
  await swarm.destroy();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('[gateway] Shutting down...');
  await swarm.destroy();
  server.close();
  process.exit(0);
});
