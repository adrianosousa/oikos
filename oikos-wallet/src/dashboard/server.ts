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
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import type { OikosServices } from '../types.js';
import type { TokenSymbol, Chain } from '../ipc/types.js';
import type { SwarmState, SwarmPeerInfo, BoardAnnouncement } from '../swarm/types.js';
import { mountMCP, mountRemoteMCP } from '../mcp/server.js';
import { buildWalletContext } from '../brain/adapter.js';
import type { ChatMessage } from '../brain/adapter.js';
import { processActions } from '../brain/actions.js';
import { getFeedbackFile, listFeedbackIds } from '../reputation/feedback-file.js';

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

  // -- MCP Endpoints --
  mountMCP(app, services);

  // Remote MCP (Streamable HTTP) — for Claude iOS/web custom connectors
  const mcpAuthToken = process.env['MCP_AUTH_TOKEN'] ?? '';
  mountRemoteMCP(app, services, mcpAuthToken || undefined);

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

  /** Wallet addresses — all supported chains */
  app.get('/api/addresses', async (_req, res) => {
    try {
      const chains = ['ethereum', 'bitcoin', 'polygon', 'arbitrum', 'spark'] as const;
      const results = await Promise.all(
        chains.map(chain => wallet.queryAddress(chain).catch(() => null))
      );
      res.json({ addresses: results.filter(Boolean) });
    } catch {
      res.status(500).json({ error: 'Failed to query addresses' });
    }
  });

  /** Policy status — merge runtime state with config rules */
  app.get('/api/policies', async (_req, res) => {
    try {
      const policies = await wallet.queryPolicy();

      // Enrich with rules from config file (runtime state doesn't include rules)
      const configPaths = [
        join(process.cwd(), 'policies.json'),
        join(process.cwd(), '..', 'policies.json'),
      ];
      for (const cp of configPaths) {
        if (existsSync(cp)) {
          try {
            const config = JSON.parse(readFileSync(cp, 'utf-8'));
            if (config.policies) {
              // Merge rules from config into runtime policy state
              for (const runtimePol of policies) {
                const rp = runtimePol as unknown as Record<string, unknown>;
                const configPol = config.policies.find((c: Record<string, unknown>) => c.id === rp['id']);
                if (configPol && configPol.rules && !rp['rules']) {
                  rp['rules'] = configPol.rules;
                  if (configPol.name) rp['name'] = configPol.name;
                }
              }
              // If no match by ID, just merge first policy's rules
              if (policies.length > 0 && !(policies[0] as unknown as Record<string, unknown>)['rules'] && config.policies[0]?.rules) {
                (policies[0] as unknown as Record<string, unknown>)['rules'] = config.policies[0].rules;
              }
            }
          } catch { /* ignore parse errors */ }
          break;
        }
      }

      res.json({ policies });
    } catch {
      res.status(500).json({ error: 'Failed to query policies' });
    }
  });

  /** Update policy rules and restart wallet isolate */
  app.post('/api/policies', async (req, res) => {
    try {
      const { rules, name } = req.body as { rules?: unknown[]; name?: string };
      if (!rules || !Array.isArray(rules)) {
        res.status(400).json({ error: 'rules array required' });
        return;
      }

      // Find and update the policy config file
      const configPaths = [
        join(process.cwd(), 'policies.json'),
        join(process.cwd(), '..', 'policies.json'),
      ];
      let configPath = configPaths.find(p => existsSync(p));
      if (!configPath) configPath = configPaths[0] as string;

      const config = existsSync(configPath)
        ? JSON.parse(readFileSync(configPath, 'utf-8'))
        : { policies: [{ id: 'default', name: 'Default Policy', rules: [] }] };

      // Update first policy's rules
      if (config.policies && config.policies[0]) {
        config.policies[0].rules = rules;
        if (name) config.policies[0].name = name;
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.error(`[policy] Updated policy config: ${rules.length} rules`);

      // Restart wallet isolate if possible
      if (typeof (services.wallet as unknown as Record<string, unknown>)['restart'] === 'function') {
        await (services.wallet as unknown as { restart(): Promise<void> }).restart();
        console.error('[policy] Wallet isolate restarted with new policy');
      }

      res.json({ success: true, rules: rules.length, message: 'Policy updated. Wallet restart required for enforcement.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  /** Get strategy skill files */
  app.get('/api/strategies', (_req, res) => {
    try {
      // Resolve from script location (not CWD) for reliable path resolution
      const scriptDir = dirname(fileURLToPath(import.meta.url));
      const repoRoot = join(scriptDir, '..', '..', '..');
      const strategiesDirs = [
        join(repoRoot, 'strategies'),
        join(process.cwd(), 'strategies'),
        join(process.cwd(), '..', 'strategies'),
      ];
      // Also include the policy-engine skills as read-only module info
      const skillsDirCandidates = [
        join(repoRoot, 'skills', 'policy-engine'),
        join(process.cwd(), '..', 'skills', 'policy-engine'),
        join(process.cwd(), 'skills', 'policy-engine'),
      ];
      const skillsDir = skillsDirCandidates.find(d => existsSync(d)) ?? skillsDirCandidates[0] as string;

      const strategies: Array<{
        id: string; name: string; filename: string; source: string;
        enabled: boolean; content: string; createdAt: string;
      }> = [];

      // Load user strategies
      for (const dir of strategiesDirs) {
        if (!existsSync(dir)) continue;
        const files = readdirSync(dir).filter(f => f.endsWith('.md'));
        for (const file of files) {
          const content = readFileSync(join(dir, file), 'utf-8');
          const nameMatch = content.match(/^#\s+(.+)$/m);
          const enabledMatch = content.match(/enabled:\s*(true|false)/i);
          strategies.push({
            id: file.replace('.md', ''),
            name: nameMatch && nameMatch[1] ? nameMatch[1] : file.replace('.md', ''),
            filename: file,
            source: content.includes('[Purchased]') ? 'purchased' : content.includes('[Agent]') ? 'agent' : 'human',
            enabled: enabledMatch && enabledMatch[1] ? enabledMatch[1] === 'true' : true,
            content,
            createdAt: '',
          });
        }
      }

      // Load policy engine modules as reference
      const modules: Array<{ id: string; name: string; filename: string }> = [];
      if (existsSync(skillsDir)) {
        const files = readdirSync(skillsDir).filter(f => f.endsWith('.md') && f !== 'SKILL.md');
        for (const file of files) {
          const content = readFileSync(join(skillsDir, file), 'utf-8');
          const nameMatch = content.match(/^#\s+(.+)$/m);
          modules.push({
            id: file.replace('.md', ''),
            name: nameMatch && nameMatch[1] ? nameMatch[1] : file,
            filename: file,
          });
        }
      }

      res.json({ strategies, modules });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // Shared strategy dir resolver (same candidates as GET)
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const stratRepoRoot = join(scriptDir, '..', '..', '..');
  function resolveStrategiesDir(): string {
    const candidates = [
      join(stratRepoRoot, 'strategies'),
      join(process.cwd(), 'strategies'),
      join(process.cwd(), '..', 'strategies'),
    ];
    return candidates.find(d => existsSync(d)) ?? candidates[0] as string;
  }

  /** Save a strategy skill file */
  app.post('/api/strategies', (req, res) => {
    try {
      const { filename, content } = req.body as { filename?: string; content?: string };
      if (!filename || !content) {
        res.status(400).json({ error: 'filename and content required' });
        return;
      }

      const strategiesDir = resolveStrategiesDir();
      if (!existsSync(strategiesDir)) mkdirSync(strategiesDir, { recursive: true });

      const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, '') + '.md';
      writeFileSync(join(strategiesDir, safeName), content);
      console.error(`[strategies] Saved strategy: ${safeName}`);

      res.json({ success: true, filename: safeName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  /** Toggle a strategy's enabled state */
  app.post('/api/strategies/toggle', (req, res) => {
    try {
      const { filename, enabled } = req.body as { filename?: string; enabled?: boolean };
      if (!filename || enabled === undefined) {
        res.status(400).json({ error: 'filename and enabled required' });
        return;
      }

      const strategiesDir = resolveStrategiesDir();
      const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, '') + '.md';
      const filePath = join(strategiesDir, safeName);

      if (!existsSync(filePath)) {
        res.status(404).json({ error: `Strategy not found: ${safeName}` });
        return;
      }

      let content = readFileSync(filePath, 'utf-8');
      const enabledRegex = /enabled:\s*(true|false)/i;
      if (enabledRegex.test(content)) {
        content = content.replace(enabledRegex, `enabled: ${enabled}`);
      } else {
        content = `enabled: ${enabled}\n` + content;
      }
      writeFileSync(filePath, content);
      console.error(`[strategies] ${enabled ? 'Enabled' : 'Disabled'} strategy: ${safeName}`);
      res.json({ success: true, filename: safeName, enabled });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  /** Delete a strategy file */
  app.post('/api/strategies/delete', (req, res) => {
    try {
      const { filename } = req.body as { filename?: string };
      if (!filename) {
        res.status(400).json({ error: 'filename required' });
        return;
      }

      const strategiesDir = resolveStrategiesDir();
      const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, '') + '.md';
      const filePath = join(strategiesDir, safeName);

      if (!existsSync(filePath)) {
        res.status(404).json({ error: `Strategy not found: ${safeName}` });
        return;
      }

      unlinkSync(filePath);
      console.error(`[strategies] Deleted strategy: ${safeName}`);
      res.json({ success: true, filename: safeName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
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

  /** Spark transfer history */
  app.get('/api/spark/transfers', async (req, res) => {
    try {
      const direction = (req.query['direction'] as string) || 'all';
      const limit = parseInt(String(req.query['limit'] ?? '20'), 10);
      const transfers = await wallet.querySparkTransfers(direction as 'incoming' | 'outgoing' | 'all', limit);
      res.json({ transfers });
    } catch (err) {
      res.status(500).json({ error: 'Failed to query Spark transfers', detail: err instanceof Error ? err.message : String(err) });
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

  // ── Room Negotiation Endpoints ──

  /** List all negotiation rooms */
  app.get('/api/rooms', (_req, res) => {
    if (!services.swarm) {
      res.json({ enabled: false, rooms: [] });
      return;
    }
    const state = services.swarm.getState() as { activeRooms?: unknown[] };
    res.json({ enabled: true, rooms: state.activeRooms ?? [] });
  });

  /** Get specific room by announcement ID */
  app.get('/api/rooms/:id', (req, res) => {
    if (!services.swarm) {
      res.json({ enabled: false });
      return;
    }
    const state = services.swarm.getState() as { activeRooms?: Array<{ announcementId: string }> };
    const rooms = state.activeRooms ?? [];
    const room = rooms.find((r) => r.announcementId === req.params['id']);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json(room);
  });

  /** Bid on an announcement — joins private room and sends price offer */
  app.post('/api/rooms/:id/bid', async (req, res) => {
    if (!services.swarm) { res.status(503).json({ error: 'Swarm not enabled' }); return; }
    try {
      const body = req.body as Record<string, unknown>;
      await services.swarm.bidOnAnnouncement(
        req.params['id'] as string,
        String(body['price'] ?? ''),
        String(body['symbol'] ?? 'USDT'),
        String(body['reason'] ?? 'CLI bid'),
      );
      res.json({ bid: true, announcementId: req.params['id'] });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Accept best bid on an announcement (creator only) */
  app.post('/api/rooms/:id/accept', async (req, res) => {
    if (!services.swarm) { res.status(503).json({ error: 'Swarm not enabled' }); return; }
    try {
      const result = await services.swarm.acceptBestBid(req.params['id'] as string);
      if (!result) {
        res.status(404).json({ accepted: false, reason: 'No bids found or not the creator' });
        return;
      }
      res.json({ accepted: true, ...(result as Record<string, unknown>) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  /** Submit payment for accepted bid (creator only) */
  app.post('/api/rooms/:id/pay', async (req, res) => {
    if (!services.swarm) { res.status(503).json({ error: 'Swarm not enabled' }); return; }
    try {
      await services.swarm.submitPayment(req.params['id'] as string);
      res.json({ submitted: true, announcementId: req.params['id'] });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ── ERC-8004 Identity & Reputation ──

  app.get('/agent-card.json', (_req, res) => {
    const swarmState = services.swarm?.getState() as Record<string, unknown> | undefined;
    const swarmIdentity = swarmState?.['identity'] as Record<string, unknown> | undefined;
    const swarmPubkey = swarmIdentity?.['pubkey'] as string | undefined;
    const swarmCapabilities = (swarmIdentity?.['capabilities'] ?? []) as string[];

    res.json({
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name: process.env['AGENT_NAME'] || 'Oikos Agent',
      description: process.env['AGENT_DESCRIPTION'] || 'Autonomous AI agent with process-isolated multi-chain wallet on Tether runtime stack.',
      image: process.env['AGENT_IMAGE'] || null,
      services: [
        { name: 'MCP', endpoint: `http://127.0.0.1:${port}/mcp`, version: '2025-06-18' },
        { name: 'web', endpoint: `http://127.0.0.1:${port}/` },
        ...(swarmPubkey ? [{ name: 'hyperswarm', endpoint: `noise://${swarmPubkey}`, version: '1.0' }] : []),
      ],
      x402Support: true,
      active: true,
      registrations: services.identity.agentId
        ? [{ agentId: Number(services.identity.agentId), agentRegistry: 'eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e' }]
        : [],
      supportedTrust: ['reputation'],
      capabilities: swarmCapabilities,
    });
  });

  app.get('/.well-known/agent-registration.json', (_req, res) => {
    if (!services.identity.registered || !services.identity.agentId) {
      res.status(404).json({ error: 'Agent not registered on ERC-8004' });
      return;
    }
    res.json({
      agentId: Number(services.identity.agentId),
      agentRegistry: 'eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e',
      agentURI: services.identity.agentURI,
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
      const tag1 = _req.query['tag1'] as string | undefined;
      const tag2 = _req.query['tag2'] as string | undefined;
      const rep = await wallet.queryReputation(
        services.identity.agentId,
        'ethereum',
        { tag1: tag1 || undefined, tag2: tag2 || undefined },
      );
      res.json({ registered: true, ...rep });
    } catch {
      res.status(500).json({ error: 'Failed to query on-chain reputation' });
    }
  });

  // ── Feedback File Hosting (ERC-8004 off-chain evidence) ──

  /** Serve off-chain ERC-8004 feedback detail files */
  app.get('/api/feedback/:feedbackId', (_req, res) => {
    const file = getFeedbackFile(_req.params['feedbackId'] as string);
    if (!file) {
      res.status(404).json({ error: 'Feedback file not found' });
      return;
    }
    res.json(file);
  });

  /** List all feedback file IDs */
  app.get('/api/feedback', (_req, res) => {
    res.json({ feedbackIds: listFeedbackIds() });
  });

  // ── Reputation Bridge Stats ──

  app.get('/api/reputation/bridge', (_req, res) => {
    if (!services.reputationBridge) {
      res.json({ enabled: false });
      return;
    }
    res.json(services.reputationBridge.getStats());
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
      // Build wallet context and call brain (with conversation history for continuity)
      const context = await buildWalletContext(services);
      const rawReply = await services.brain.chat(message, context, services.chatMessages);

      // Parse and execute any ACTION: lines in the brain's reply.
      // This bridges brain text output → MCP tool execution → real results.
      const { reply: actionReply, results } = await processActions(rawReply, services);
      if (results.length > 0) {
        console.error(`[chat] Executed ${results.length} action(s): ${results.map(r => `${r.tool}:${r.success ? 'ok' : 'fail'}`).join(', ')}`);
      }

      // If actions were executed, feed the results back to the LLM for a human-friendly response
      let finalReply = actionReply;
      if (results.length > 0) {
        try {
          const interpretPrompt = `The user asked: "${message}"\n\nResult:\n${actionReply}\n\nRespond naturally to the user about this result. RULES: Never mention tool names, ACTION format, or JSON. Never say "tool was executed". Just answer the user's question using the data. Be concise. Do not output any ACTION.`;
          const interpretedReply = await services.brain.chat(interpretPrompt, context, services.chatMessages);
          // Only use the interpreted reply if it doesn't contain another ACTION
          if (interpretedReply && !interpretedReply.includes('ACTION:')) {
            finalReply = interpretedReply;
          }
        } catch {
          // If interpretation fails, fall back to the raw action reply
          console.error('[chat] Failed to interpret action result, using raw reply');
        }
      }

      // Store agent reply (human-friendly interpretation of action results)
      const agentMsg: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: finalReply,
        from: 'agent',
        timestamp: Date.now(),
      };
      services.chatMessages.push(agentMsg);

      // Keep last 100 messages
      if (services.chatMessages.length > 100) {
        services.chatMessages.splice(0, services.chatMessages.length - 100);
      }

      console.error(`[chat] agent (${services.brain.name}): "${finalReply.slice(0, 80)}"`);

      res.json({
        reply: finalReply,
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

  // ── Passphrase Auth API ──

  app.get('/api/auth/status', (_req, res) => {
    res.json(services.auth ? services.auth.getStatus() : { enabled: false });
  });

  app.post('/api/auth/setup', (req, res) => {
    if (!services.auth) { res.json({ success: false, error: 'Auth module not loaded' }); return; }
    const { passphrase, threshold, timeoutMinutes } = req.body as { passphrase?: string; threshold?: number; timeoutMinutes?: number };
    if (!passphrase) { res.json({ success: false, error: 'Passphrase required' }); return; }
    const ok = services.auth.setup(passphrase, { threshold, timeoutMinutes });
    res.json({ success: ok, error: ok ? undefined : 'Passphrase too short (min 4 chars)' });
  });

  app.post('/api/auth/verify', (req, res) => {
    if (!services.auth) { res.json({ valid: true }); return; }
    const { passphrase } = req.body as { passphrase?: string };
    if (!passphrase) { res.json({ valid: false, error: 'Passphrase required' }); return; }
    const valid = services.auth.verify(passphrase);
    const status = services.auth.getStatus();
    res.json({ valid, expiresAt: valid ? status.expiresAt : null });
  });

  app.post('/api/auth/change', (req, res) => {
    if (!services.auth) { res.json({ success: false }); return; }
    const { currentPassphrase, newPassphrase } = req.body as { currentPassphrase?: string; newPassphrase?: string };
    if (!currentPassphrase || !newPassphrase) { res.json({ success: false, error: 'Both passphrases required' }); return; }
    const ok = services.auth.change(currentPassphrase, newPassphrase);
    res.json({ success: ok, error: ok ? undefined : 'Current passphrase incorrect or new too short' });
  });

  app.post('/api/auth/disable', (req, res) => {
    if (!services.auth) { res.json({ success: false }); return; }
    const { passphrase } = req.body as { passphrase?: string };
    if (!passphrase) { res.json({ success: false, error: 'Passphrase required' }); return; }
    const ok = services.auth.disable(passphrase);
    res.json({ success: ok, error: ok ? undefined : 'Incorrect passphrase' });
  });

  app.post('/api/auth/settings', (req, res) => {
    if (!services.auth) { res.json({ success: false }); return; }
    const { threshold, timeoutMinutes, requireForPolicyChanges, requireForStrategyActivation } = req.body as {
      threshold?: number; timeoutMinutes?: number; requireForPolicyChanges?: boolean; requireForStrategyActivation?: boolean;
    };
    services.auth.updateSettings({ threshold, timeoutMinutes, requireForPolicyChanges, requireForStrategyActivation });
    res.json({ success: true });
  });

  /** Browser auth page — for Telegram/Discord/remote authorization */
  app.get('/auth/:proposalId', (req, res) => {
    if (!services.auth) { res.status(404).send('Auth not enabled'); return; }
    const pending = services.auth.getPending(req.params.proposalId);
    if (!pending) { res.status(404).send('Authorization request not found or expired'); return; }
    if (pending.resolved) { res.send('This authorization has already been resolved.'); return; }
    // Serve a simple auth page
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oikos — Authorize</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:monospace;background:#1c1c20;color:#e4e0d8;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{background:#2a2a2f;border:2px solid #6a6a70;padding:2rem;max-width:400px;width:90%}.title{font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:1.5rem;color:#ebb743}
.detail{font-size:13px;color:#a09a90;margin-bottom:0.5rem}.amount{font-size:24px;font-weight:800;margin:1rem 0}
input{width:100%;background:#1c1c20;border:2px solid #6a6a70;padding:0.6rem;font-family:inherit;font-size:14px;color:#e4e0d8;margin:1rem 0;outline:none}
input:focus{border-color:#60a5fa}button{padding:0.6rem 1.2rem;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;border:2px solid #6a6a70;text-transform:uppercase;letter-spacing:0.05em;margin-right:0.5rem}
.approve{background:#2d8a4e;color:#fff;border-color:#2d8a4e}.reject{background:#2a2a2f;color:#f87171;border-color:#f87171}
.result{margin-top:1rem;padding:0.5rem;font-size:12px;display:none}</style></head><body>
<div class="card"><div class="title">Authorize Transaction</div>
<div class="detail">${pending.description}</div>
<div class="amount">$${pending.amount.toFixed(2)} USDT</div>
<div class="detail">Expires: ${new Date(pending.expiresAt).toLocaleTimeString()}</div>
<input type="password" id="pp" placeholder="Enter passphrase" autofocus />
<div><button class="approve" onclick="auth(true)">Authorize</button><button class="reject" onclick="auth(false)">Reject</button></div>
<div class="result" id="result"></div></div>
<script>async function auth(approve){var pp=document.getElementById('pp').value;var r=document.getElementById('result');r.style.display='block';
if(!approve){r.textContent='Rejected.';r.style.color='#f87171';return}
try{var res=await fetch('/api/auth/pending/${pending.proposalId}/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passphrase:pp})});
var data=await res.json();if(data.approved){r.textContent='✓ Authorized! You can close this page.';r.style.color='#4ade80'}else{r.textContent='✗ Invalid passphrase.';r.style.color='#f87171'}}
catch(e){r.textContent='Error: '+e.message;r.style.color='#f87171'}}</script></body></html>`);
  });

  /** Resolve a pending auth via browser */
  app.post('/api/auth/pending/:proposalId/resolve', (req, res) => {
    if (!services.auth) { res.json({ approved: false }); return; }
    const { passphrase } = req.body as { passphrase?: string };
    if (!passphrase) { res.json({ approved: false, error: 'Passphrase required' }); return; }
    const approved = services.auth.resolvePending(req.params.proposalId, passphrase);
    res.json({ approved });
  });

  /** Get pending auth requests (for Pear app to poll) */
  app.get('/api/auth/pending', (_req, res) => {
    if (!services.auth) { res.json({ pending: [] }); return; }
    res.json({ pending: services.auth.getPendingList() });
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
        erc8004AgentId: state.identity.erc8004AgentId,
        onChainReputation: state.identity.onChainReputation,
      },
      boardPeers: peers.map((p: SwarmPeerInfo) => ({
        pubkey: p.pubkey,
        name: p.name,
        reputation: p.reputation,
        capabilities: p.capabilities,
        lastSeen: p.lastSeen,
        erc8004AgentId: p.erc8004AgentId,
      })),
      announcements: anns.map((a: BoardAnnouncement) => ({
        id: a.id,
        agentPubkey: a.agentPubkey,
        agentName: a.agentName,
        reputation: a.reputation,
        erc8004AgentId: a.erc8004AgentId,
        category: a.category,
        title: a.title,
        description: a.description,
        priceRange: a.priceRange,
        capabilities: a.capabilities,
        tags: a.tags ?? [],
        expiresAt: a.expiresAt,
        timestamp: a.timestamp,
      })),
      // Compute tag cloud from announcement tags
      tags: (() => {
        const counts = new Map<string, number>();
        for (const a of anns) {
          for (const t of a.tags ?? []) {
            counts.set(t, (counts.get(t) ?? 0) + 1);
          }
        }
        return [...counts.entries()]
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count);
      })(),
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

  // -- x402 Resource Server (sell services behind 402 paywall) --
  const x402ServerEnabled = process.env['X402_SERVER_ENABLED'] !== 'false';
  if (x402ServerEnabled) {
    const x402Economics = services.x402?.getEconomicsRef?.() ?? undefined;
    import('../x402/server.js').then(({ mountX402Server, mountX402Discovery, DEFAULT_ROUTES }) => {
      mountX402Server(app, wallet, DEFAULT_ROUTES, x402Economics).then(result => {
        if (result.mounted) {
          mountX402Discovery(app, DEFAULT_ROUTES ?? [], result.payToAddress);
        }
      }).catch(err => {
        console.error('[x402-server] Mount failed:', err instanceof Error ? err.message : err);
      });
    }).catch(() => {
      console.error('[x402-server] Module not available');
    });
  }

  app.listen(port, host, () => {
    console.error(`[dashboard] Listening on http://${host}:${port}`);
    if (host === '0.0.0.0') {
      console.error(`[dashboard] Public board: http://<your-ip>:${port}/board`);
    }
  });
}
