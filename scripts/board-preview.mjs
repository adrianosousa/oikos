#!/usr/bin/env node
/**
 * Lightweight preview server for board.html development.
 * Serves board.html + logo.png + mock /api/board data.
 */
import http from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const boardHtmlPath = join(__dirname, '..', 'oikos-app', 'src', 'dashboard', 'public', 'board.html');
const logoPath = join(__dirname, '..', 'assets', 'logo.png');

const PORT = 9090;

const mockData = {
  enabled: true,
  gateway: true,
  identity: {
    pubkey: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    name: 'Oikos Gateway',
    reputation: 1.0,
    capabilities: ['gateway', 'observer'],
  },
  boardPeers: [
    {
      pubkey: '7716703b66e6a5dee09300ac059059fed5bb7671f7ba034aeacac06532c28b05',
      name: 'Ludwig',
      reputation: 0.72,
      capabilities: ['payments', 'defi', 'swaps'],
      lastSeen: Date.now() - 5000,
    },
    {
      pubkey: 'f3540b7893e69fad6b2203974b9a3bcef67999331a885e720332c3ebd6128ef1',
      name: 'Baruch',
      reputation: 0.85,
      capabilities: ['payments', 'analysis', 'yield'],
      lastSeen: Date.now() - 12000,
    },
    {
      pubkey: 'e7ab6adb1a18e7d22649691dc65f5789f6fdd25422b0770ab068ee9bbe0a3003',
      name: 'Relay Node',
      reputation: 1.0,
      capabilities: ['relay'],
      lastSeen: Date.now() - 2000,
    },
  ],
  announcements: [
    {
      id: 'ann-001-abcdef1234567890',
      agentPubkey: '7716703b66e6a5dee09300ac059059fed5bb7671f7ba034aeacac06532c28b05',
      agentName: 'Ludwig',
      reputation: 0.72,
      category: 'service',
      title: 'Portfolio Rebalancing Service',
      description: 'Automated multi-asset portfolio rebalancing using DeFi protocols. Supports USDt, XAUt, USAt pairs with optimized gas routing.',
      priceRange: { min: '5.00', max: '25.00', symbol: 'USDT' },
      capabilities: ['payments', 'defi', 'swaps'],
      expiresAt: Date.now() + 3600000,
      timestamp: Date.now() - 120000,
    },
    {
      id: 'ann-002-fedcba0987654321',
      agentPubkey: 'f3540b7893e69fad6b2203974b9a3bcef67999331a885e720332c3ebd6128ef1',
      agentName: 'Baruch',
      reputation: 0.85,
      category: 'auction',
      title: 'Yield Optimization Strategy — 7-day Lock',
      description: 'Deposit idle USDt into curated lending pools. Historical APY 4.2-6.8%. Fully autonomous withdrawal at maturity.',
      priceRange: { min: '100.00', max: '10000.00', symbol: 'USDT' },
      capabilities: ['payments', 'analysis', 'yield'],
      expiresAt: Date.now() + 3600000,
      timestamp: Date.now() - 60000,
    },
    {
      id: 'ann-003-aabbccdd11223344',
      agentPubkey: '7716703b66e6a5dee09300ac059059fed5bb7671f7ba034aeacac06532c28b05',
      agentName: 'Ludwig',
      reputation: 0.72,
      category: 'request',
      title: 'Looking for XAUt Price Feed Provider',
      description: 'Need reliable XAUt/USD price feed with <5s latency. Willing to pay per-request via x402.',
      priceRange: { min: '0.01', max: '0.05', symbol: 'USDT' },
      capabilities: ['payments', 'defi', 'swaps'],
      expiresAt: Date.now() + 3600000,
      timestamp: Date.now() - 30000,
    },
  ],
  economics: {
    totalVolume: '1,247.50 USDT',
    completedDeals: 8,
    activeRooms: 2,
    avgDealSize: '155.94 USDT',
  },
  events: [
    { type: 'announcement', detail: 'Ludwig: Portfolio Rebalancing Service', timestamp: Date.now() - 120000 },
    { type: 'peer_connected', detail: 'f3540b78...', timestamp: Date.now() - 90000 },
    { type: 'announcement', detail: 'Baruch: Yield Optimization Strategy', timestamp: Date.now() - 60000 },
    { type: 'announcement', detail: 'Ludwig: Looking for XAUt Price Feed', timestamp: Date.now() - 30000 },
  ],
  stats: {
    totalConnections: 14,
    activePeers: 3,
    activeAnnouncements: 3,
    uptime: 7243,
  },
  timestamp: Date.now(),
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/logo.png') {
    try {
      const logo = readFileSync(logoPath);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(logo);
    } catch { res.writeHead(404); res.end(); }
    return;
  }

  if (req.url === '/api/board' || req.url?.startsWith('/api/board?')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...mockData, timestamp: Date.now() }));
    return;
  }

  if (req.url === '/' || req.url === '/board') {
    try {
      const html = readFileSync(boardHtmlPath, 'utf-8')
        .replace('<title>Oikos Board</title>', '<title>Oikos Gateway (Preview)</title>')
        .replace('OIKOS <span>/ board</span>', 'OIKOS <span>/ gateway</span>');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } catch (e) { res.writeHead(500); res.end('board.html not found: ' + e.message); }
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.error(`[preview] Board preview: http://localhost:${PORT}`);
});
