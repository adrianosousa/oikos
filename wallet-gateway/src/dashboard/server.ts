/**
 * Dashboard Server — localhost-only monitoring UI.
 *
 * Serves a static HTML dashboard and REST API for wallet state.
 * Displays multi-asset portfolio with allocation percentages.
 * NEVER exposed to the internet. Binds to 127.0.0.1 only.
 *
 * Works standalone (wallet-only) or with an agent brain plugin
 * for additional state (LLM reasoning, swarm, pricing).
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { WalletIPCClient } from '../ipc/client.js';
import type { GatewayPlugin } from '../types.js';
import type { TokenSymbol, Chain } from '../ipc/types.js';
import { mountMCP } from '../mcp/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createDashboard(
  wallet: WalletIPCClient,
  port: number,
  plugin?: GatewayPlugin,
): void {
  const app = express();

  // Serve static files
  const projectRoot = join(__dirname, '..', '..', '..');
  const publicDir = join(projectRoot, 'src', 'dashboard', 'public');
  app.use(express.static(publicDir));
  app.use(express.json());

  // -- MCP Endpoint --
  mountMCP(app, wallet, plugin);

  // -- API Routes --

  /** Agent brain state (requires plugin) */
  app.get('/api/state', (_req, res) => {
    if (!plugin?.getAgentState) {
      res.json({ status: 'no_agent_brain_connected' });
      return;
    }
    res.json(plugin.getAgentState());
  });

  /** Wallet balances — all assets across all chains */
  app.get('/api/balances', async (_req, res) => {
    try {
      const balances = await wallet.queryBalanceAll();
      res.json({ balances });
    } catch {
      res.status(500).json({ error: 'Failed to query balances' });
    }
  });

  /** Wallet addresses */
  app.get('/api/addresses', async (_req, res) => {
    try {
      const eth = await wallet.queryAddress('ethereum').catch(() => null);
      res.json({ addresses: [eth].filter(Boolean) });
    } catch {
      res.status(500).json({ error: 'Failed to query addresses' });
    }
  });

  /** Policy status */
  app.get('/api/policies', async (_req, res) => {
    try {
      const policies = await wallet.queryPolicy();
      res.json({ policies });
    } catch {
      res.status(500).json({ error: 'Failed to query policies' });
    }
  });

  /** Audit log entries */
  app.get('/api/audit', async (req, res) => {
    try {
      const limit = parseInt(String(req.query['limit'] ?? '50'), 10);
      const entries = await wallet.queryAudit(limit);
      res.json({ entries });
    } catch {
      res.status(500).json({ error: 'Failed to query audit log' });
    }
  });

  /** Swarm state — peers, announcements, rooms (requires plugin) */
  app.get('/api/swarm', (_req, res) => {
    const swarm = plugin?.getSwarm?.();
    if (!swarm) {
      res.json({ enabled: false });
      return;
    }
    res.json({ enabled: true, ...swarm.getState() });
  });

  /** Swarm economics — revenue, costs, sustainability (requires plugin) */
  app.get('/api/economics', (_req, res) => {
    const swarm = plugin?.getSwarm?.();
    if (!swarm) {
      res.json({ enabled: false });
      return;
    }
    const state = swarm.getState();
    res.json({ enabled: true, economics: (state as Record<string, unknown>)['economics'] });
  });

  // ── ERC-8004 Identity & Reputation ──

  /** ERC-8004 Agent Card (Registration File) — follows EIP-8004 schema */
  app.get('/agent-card.json', (_req, res) => {
    const identity = plugin?.getIdentityState?.() ?? { registered: false };
    res.json({
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name: 'Oikos Agent',
      description: 'Autonomous AI agent with process-isolated multi-chain wallet. Supports portfolio management, DeFi operations, P2P swarm trading, and on-chain reputation via ERC-8004.',
      services: [
        { name: 'MCP', endpoint: `http://127.0.0.1:${port}/mcp`, version: '2025-06-18' },
        { name: 'web', endpoint: `http://127.0.0.1:${port}/` },
      ],
      x402Support: true,
      active: true,
      registrations: identity.agentId
        ? [{ agentId: Number(identity.agentId), agentRegistry: `eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e` }]
        : [],
      supportedTrust: ['reputation'],
    });
  });

  /** ERC-8004 identity state (requires plugin) */
  app.get('/api/identity', (_req, res) => {
    if (!plugin?.getIdentityState) {
      res.json({ registered: false, status: 'no_agent_brain_connected' });
      return;
    }
    res.json(plugin.getIdentityState());
  });

  /** ERC-8004 on-chain reputation */
  app.get('/api/reputation/onchain', async (_req, res) => {
    const identity = plugin?.getIdentityState?.();
    if (!identity?.registered || !identity.agentId) {
      res.json({ registered: false });
      return;
    }
    try {
      const rep = await wallet.queryReputation(identity.agentId);
      res.json({ registered: true, ...rep });
    } catch {
      res.status(500).json({ error: 'Failed to query on-chain reputation' });
    }
  });

  // ── Pricing & Portfolio Valuation ──

  /** Current asset prices (requires plugin with pricing) */
  app.get('/api/prices', async (_req, res) => {
    const pricing = plugin?.getPricing?.();
    if (!pricing) {
      res.json({ source: 'unavailable', prices: [] });
      return;
    }
    try {
      const prices = await pricing.getAllPrices();
      res.json({ prices });
    } catch {
      res.status(500).json({ error: 'Failed to fetch prices' });
    }
  });

  /** Portfolio valuation with USD totals and per-asset breakdown */
  app.get('/api/valuation', async (_req, res) => {
    try {
      const balances = await wallet.queryBalanceAll();
      const pricing = plugin?.getPricing?.();
      if (pricing) {
        const valuation = await pricing.valuatePortfolio(balances);
        res.json(valuation);
      } else {
        res.json({ totalUsd: 0, assets: [], prices: [], updatedAt: Date.now() });
      }
    } catch {
      res.status(500).json({ error: 'Failed to compute valuation' });
    }
  });

  /** Historical price data for charts (requires plugin with pricing) */
  app.get('/api/prices/history/:symbol', async (req, res) => {
    const pricing = plugin?.getPricing?.();
    if (!pricing) {
      res.json({ symbol: req.params['symbol'], history: [] });
      return;
    }
    const symbol = (req.params['symbol'] ?? '').toUpperCase();
    try {
      const history = await pricing.getHistoricalPrices(symbol);
      res.json({ symbol, history });
    } catch {
      res.status(500).json({ error: `Failed to fetch history for ${symbol}` });
    }
  });

  // ── Dry-Run Policy Check ──

  /** Simulate a proposal against the PolicyEngine without executing */
  app.post('/api/simulate', async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const proposal = {
        amount: String(body['amount'] ?? '0'),
        symbol: String(body['symbol'] ?? 'USDT') as TokenSymbol,
        chain: String(body['chain'] ?? 'ethereum') as Chain,
        reason: String(body['reason'] ?? 'dry-run'),
        confidence: Number(body['confidence'] ?? 0.85),
        strategy: String(body['strategy'] ?? 'simulate'),
        timestamp: Date.now(),
        ...(body['to'] ? { to: String(body['to']) } : {}),
        ...(body['toSymbol'] ? { toSymbol: String(body['toSymbol']) } : {}),
      };
      const result = await wallet.simulateProposal(proposal);
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Failed to simulate proposal' });
    }
  });

  // ── RGB Asset Endpoints ──

  /** List all RGB assets with balances */
  app.get('/api/rgb/assets', async (_req, res) => {
    try {
      const assets = await wallet.queryRGBAssets();
      res.json({ assets });
    } catch {
      res.status(500).json({ error: 'Failed to query RGB assets' });
    }
  });

  /** Health check */
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      walletConnected: wallet.isRunning(),
      brainConnected: !!plugin?.getAgentState,
      swarmEnabled: !!plugin?.getSwarm?.(),
    });
  });

  // Bind to localhost only — never expose to network
  app.listen(port, '127.0.0.1', () => {
    console.error(`[dashboard] Listening on http://127.0.0.1:${port}`);
  });
}
