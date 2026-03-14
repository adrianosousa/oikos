/**
 * Dashboard Server — monitoring UI + REST API + public board.
 *
 * Serves a static HTML dashboard and REST API for wallet state.
 * Uses OikosServices for direct access to all infrastructure.
 *
 * Bind modes:
 * - DASHBOARD_HOST=127.0.0.1 (default) — localhost only, private dashboard
 * - DASHBOARD_HOST=0.0.0.0 — public access. /board and /api/board are
 *   unauthenticated (public discovery data). All other /api/* endpoints
 *   still require Bearer token when SESSION_TOKEN is set.
 *
 * Auth: Optional Bearer token (SESSION_TOKEN env). If set,
 * all /api/* endpoints require Authorization header
 * (except /api/health, /api/token, and /api/board).
 * Pattern from rgb-wallet-pear.
 *
 * @security All proposals flow through the Wallet Isolate's PolicyEngine.
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { OikosServices } from '../types.js';
import type { TokenSymbol, Chain } from '../ipc/types.js';
import type { SwarmState, SwarmPeerInfo, BoardAnnouncement } from '../swarm/types.js';
import { mountMCP } from '../mcp/server.js';
import { buildWalletContext } from '../brain/adapter.js';
import type { ChatMessage } from '../brain/adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createDashboard(
  services: OikosServices,
  port: number,
  host = '127.0.0.1',
): void {
  const app = express();
  const { wallet } = services;
  const sessionToken = process.env['SESSION_TOKEN'] ?? null;

  // Serve static files (fallback browser dashboard)
  const projectRoot = join(__dirname, '..', '..', '..');
  const publicDir = join(projectRoot, 'src', 'dashboard', 'public');
  app.use(express.static(publicDir));
  app.use(express.json());

  // ── Bearer Token Auth (rgb-wallet-pear pattern) ──

  /** Token endpoint — unauthenticated, returns session token */
  app.get('/api/token', (_req, res) => {
    if (!sessionToken) {
      res.json({ token: null, auth: false });
      return;
    }
    res.json({ token: sessionToken });
  });

  /** Auth middleware — skip for health, token, board, and static files */
  app.use('/api', (req, res, next) => {
    // Skip auth for public endpoints (health, token, board)
    if (req.path === '/health' || req.path === '/token' || req.path === '/board') {
      next();
      return;
    }
    // If no session token configured, skip auth entirely
    if (!sessionToken) {
      next();
      return;
    }
    const auth = req.headers['authorization'];
    if (!auth || auth !== 'Bearer ' + sessionToken) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next();
  });

  // ── Logo serving ──
  app.get('/logo.png', (_req, res) => {
    const logoPath = join(projectRoot, '..', 'assets', 'logo.png');
    res.sendFile(logoPath, (err) => {
      if (err) res.status(404).end();
    });
  });

  // -- MCP Endpoint --
  mountMCP(app, services);

  // -- API Routes --

  /** Agent state — stub for agent-agnostic mode */
  app.get('/api/state', async (_req, res) => {
    // Build a rich state response for the dashboard
    try {
      const balances = await wallet.queryBalanceAll().catch(() => []);
      const auditEntries = await wallet.queryAudit(20).catch(() => []);
      const entries = auditEntries as Record<string, unknown>[];

      // Extract recent operations from audit log
      const recentResults = entries
        .filter((e) => e['type'] === 'proposal_result' || e['proposalType'])
        .slice(0, 10);

      // Swarm events
      const swarmState = services.swarm?.getState();
      const swarmEvents = (swarmState as Record<string, unknown> | undefined)?.['recentEvents'] ?? [];

      res.json({
        status: 'running',
        balances,
        recentResults,
        swarmEvents,
        eventsSeen: services.eventBus?.count ?? 0,
        proposalsSent: entries.length,
        proposalsApproved: entries.filter((e) => e['status'] === 'executed').length,
        proposalsRejected: entries.filter((e) => e['status'] === 'rejected').length,
        defiOps: entries.filter((e) => ['swap', 'bridge', 'yield'].includes(String(e['proposalType'] ?? ''))).length,
        lastReasoning: 'Connect an agent via MCP to see reasoning.',
        lastDecision: '--',
      });
    } catch {
      res.json({ status: 'connect_your_agent_via_mcp', hint: 'Use MCP tools at POST /mcp or REST API endpoints' });
    }
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

  /** Swarm state — peers, announcements, rooms */
  app.get('/api/swarm', (_req, res) => {
    if (!services.swarm) {
      res.json({ enabled: false });
      return;
    }
    res.json({ enabled: true, ...services.swarm.getState() });
  });

  /** Swarm economics — revenue, costs, sustainability */
  app.get('/api/economics', (_req, res) => {
    if (!services.swarm) {
      res.json({ enabled: false });
      return;
    }
    const state = services.swarm.getState();
    res.json({ enabled: true, economics: (state as Record<string, unknown>)['economics'] });
  });

  // ── ERC-8004 Identity & Reputation ──

  app.get('/agent-card.json', (_req, res) => {
    res.json({
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name: 'Oikos Agent',
      description: 'Autonomous AI agent with process-isolated multi-chain wallet.',
      services: [
        { name: 'MCP', endpoint: `http://127.0.0.1:${port}/mcp`, version: '2025-06-18' },
        { name: 'web', endpoint: `http://127.0.0.1:${port}/` },
      ],
      x402Support: true,
      active: true,
      registrations: services.identity.agentId
        ? [{ agentId: Number(services.identity.agentId), agentRegistry: 'eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e' }]
        : [],
      supportedTrust: ['reputation'],
    });
  });

  app.get('/api/identity', (_req, res) => {
    res.json(services.identity);
  });

  app.get('/api/reputation/onchain', async (_req, res) => {
    if (!services.identity.registered || !services.identity.agentId) {
      res.json({ registered: false });
      return;
    }
    try {
      const rep = await wallet.queryReputation(services.identity.agentId);
      res.json({ registered: true, ...rep });
    } catch {
      res.status(500).json({ error: 'Failed to query on-chain reputation' });
    }
  });

  // ── Pricing & Portfolio Valuation ──

  app.get('/api/prices', async (_req, res) => {
    if (!services.pricing) {
      res.json({ source: 'unavailable', prices: [] });
      return;
    }
    try {
      const prices = await services.pricing.getAllPrices();
      res.json({ prices });
    } catch {
      res.status(500).json({ error: 'Failed to fetch prices' });
    }
  });

  app.get('/api/valuation', async (_req, res) => {
    try {
      const balances = await wallet.queryBalanceAll();
      if (services.pricing) {
        const valuation = await services.pricing.valuatePortfolio(balances);
        res.json(valuation);
      } else {
        res.json({ totalUsd: 0, assets: [], prices: [], updatedAt: Date.now() });
      }
    } catch {
      res.status(500).json({ error: 'Failed to compute valuation' });
    }
  });

  app.get('/api/prices/history/:symbol', async (req, res) => {
    if (!services.pricing) {
      res.json({ symbol: req.params['symbol'], history: [] });
      return;
    }
    const symbol = (req.params['symbol'] ?? '').toUpperCase();
    try {
      const history = await services.pricing.getHistoricalPrices(symbol);
      res.json({ symbol, history });
    } catch {
      res.status(500).json({ error: `Failed to fetch history for ${symbol}` });
    }
  });

  // ── Dry-Run Policy Check ──

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

  app.get('/api/rgb/assets', async (_req, res) => {
    try {
      const assets = await wallet.queryRGBAssets();
      res.json({ assets });
    } catch {
      res.status(500).json({ error: 'Failed to query RGB assets' });
    }
  });

  // ── Events (for connected agents) ──

  app.get('/api/events', (req, res) => {
    if (!services.eventBus) {
      res.json({ events: [] });
      return;
    }
    const limit = parseInt(String(req.query['limit'] ?? '50'), 10);
    res.json({ events: services.eventBus.getRecent(limit) });
  });

  // ── Companion Endpoints ──

  /** Full companion state bundle — single call for everything the UI needs */
  app.get('/api/companion/state', async (_req, res) => {
    try {
      const [balances, policies] = await Promise.all([
        wallet.queryBalanceAll().catch(() => []),
        wallet.queryPolicy().catch(() => []),
      ]);
      const swarmState = services.swarm?.getState() ?? null;
      res.json({
        balances,
        policies,
        swarm: swarmState,
        events: services.eventBus?.getRecent(20) ?? [],
        instructions: services.instructions.slice(-20),
        companionConnected: services.companionConnected,
        identity: services.identity,
        walletConnected: wallet.isRunning(),
      });
    } catch {
      res.status(500).json({ error: 'Failed to build companion state' });
    }
  });

  /** Read queued instructions */
  app.get('/api/companion/instructions', (req, res) => {
    const limit = parseInt(String(req.query['limit'] ?? '50'), 10);
    res.json({ instructions: services.instructions.slice(-limit) });
  });

  /** Submit instruction (companion -> agent path) */
  app.post('/api/companion/instruct', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const text = String(body['text'] ?? '').trim();
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }
    services.instructions.push({ text, timestamp: Date.now() });
    // Keep last 50
    if (services.instructions.length > 50) {
      services.instructions.splice(0, services.instructions.length - 50);
    }
    console.error(`[companion] Instruction received: "${text.slice(0, 80)}"`);
    res.json({ ok: true, queued: services.instructions.length });
  });

  /** Propose a payment from the companion UI */
  app.post('/api/companion/propose', async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>;
      const type = String(body['type'] ?? 'payment');

      if (type === 'payment') {
        const result = await wallet.proposePayment({
          to: String(body['to'] ?? ''),
          amount: String(body['amount'] ?? '0'),
          symbol: String(body['symbol'] ?? 'USDT') as TokenSymbol,
          chain: String(body['chain'] ?? 'ethereum') as Chain,
          reason: String(body['reason'] ?? 'companion'),
          confidence: 0.9,
          strategy: 'companion',
          timestamp: Date.now(),
        });
        res.json(result);
      } else if (type === 'swap') {
        const result = await wallet.proposeSwap({
          symbol: String(body['symbol'] ?? 'USDT') as TokenSymbol,
          toSymbol: String(body['toSymbol'] ?? 'XAUT') as TokenSymbol,
          amount: String(body['amount'] ?? '0'),
          chain: String(body['chain'] ?? 'ethereum') as Chain,
          reason: String(body['reason'] ?? 'companion swap'),
          confidence: 0.9,
          strategy: 'companion',
          timestamp: Date.now(),
        });
        res.json(result);
      } else {
        res.status(400).json({ error: `Unsupported proposal type: ${type}` });
      }
    } catch {
      res.status(500).json({ error: 'Failed to submit proposal' });
    }
  });

  // ── Agent Chat Bridge (agent-agnostic) ──

  /** Chat history — poll for conversation */
  app.get('/api/agent/chat/history', (req, res) => {
    const limit = parseInt(String(req.query['limit'] ?? '50'), 10);
    res.json({ messages: services.chatMessages.slice(-limit) });
  });

  /**
   * POST /api/agent/chat — THE agent-agnostic bridge contract.
   *
   * Body: { message: string, from?: 'companion' | 'dashboard' }
   * Response: { reply: string, from: 'agent', brainName: string }
   *
   * Oikos doesn't care what's behind BRAIN_CHAT_URL.
   * Swap the brain, keep the wallet.
   */
  app.post('/api/agent/chat', async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const message = String(body['message'] ?? '').trim();
    const from = String(body['from'] ?? 'dashboard');

    if (!message) {
      res.status(400).json({ error: 'message required' });
      return;
    }

    if (!services.brain) {
      res.status(503).json({ error: 'No brain adapter configured. Set BRAIN_TYPE in env.' });
      return;
    }

    // Store human message
    const humanMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: message,
      from: 'human',
      timestamp: Date.now(),
    };
    services.chatMessages.push(humanMsg);

    console.error(`[chat] ${from}: "${message.slice(0, 80)}"`);

    try {
      // Build wallet context and call brain
      const context = await buildWalletContext(services);
      const reply = await services.brain.chat(message, context);

      // Store agent reply
      const agentMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: reply,
        from: 'agent',
        timestamp: Date.now(),
      };
      services.chatMessages.push(agentMsg);

      // Keep last 100 messages
      if (services.chatMessages.length > 100) {
        services.chatMessages.splice(0, services.chatMessages.length - 100);
      }

      console.error(`[chat] agent (${services.brain.name}): "${reply.slice(0, 80)}"`);

      res.json({
        reply,
        from: 'agent',
        brainName: services.brain.name,
        messageId: agentMsg.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[chat] Brain error: ${msg}`);

      // Store error as agent message so UI shows it
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: `[Brain error: ${msg}]`,
        from: 'agent',
        timestamp: Date.now(),
      };
      services.chatMessages.push(errorMsg);

      res.status(502).json({ error: `Brain error: ${msg}` });
    }
  });

  /** Health check — unauthenticated */
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      walletConnected: wallet.isRunning(),
      swarmEnabled: !!services.swarm,
      companionConnected: services.companionConnected,
      eventsBuffered: services.eventBus?.count ?? 0,
    });
  });

  // ── Public Board (unauthenticated — discovery data is public by design) ──

  /** Public board JSON — peers, announcements, identity. No wallet data. */
  app.get('/api/board', (_req, res) => {
    if (!services.swarm) {
      res.json({ enabled: false, boardPeers: [], announcements: [] });
      return;
    }
    const state = services.swarm.getState() as unknown as SwarmState;
    // Only expose public discovery data — no wallet state, no room details
    const peers = (state.boardPeers ?? []) as SwarmPeerInfo[];
    const anns = (state.announcements ?? []) as BoardAnnouncement[];
    res.json({
      enabled: true,
      identity: {
        pubkey: state.identity.pubkey,
        name: state.identity.name,
        reputation: state.identity.reputation,
        capabilities: state.identity.capabilities,
      },
      boardPeers: peers.map((p: SwarmPeerInfo) => ({
        pubkey: p.pubkey,
        name: p.name,
        reputation: p.reputation,
        capabilities: p.capabilities,
        lastSeen: p.lastSeen,
      })),
      announcements: anns.map((a: BoardAnnouncement) => ({
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
      economics: state.economics,
      timestamp: Date.now(),
    });
  });

  /** Public board HTML page */
  app.get('/board', (_req, res) => {
    const boardHtml = join(publicDir, 'board.html');
    res.sendFile(boardHtml, (err) => {
      if (err) res.status(404).send('Board page not found');
    });
  });

  app.listen(port, host, () => {
    console.error(`[dashboard] Listening on http://${host}:${port}`);
    if (host === '0.0.0.0') {
      console.error(`[dashboard] Public board: http://<your-ip>:${port}/board`);
    }
  });
}
