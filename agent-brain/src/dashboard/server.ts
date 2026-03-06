/**
 * Dashboard Server — localhost-only monitoring UI.
 *
 * Serves a static HTML dashboard and REST API for agent state.
 * Displays multi-asset portfolio with allocation percentages.
 * NEVER exposed to the internet. Binds to 127.0.0.1 only.
 */

import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { AgentBrain } from '../agent/brain.js';
import type { WalletIPCClient } from '../ipc/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createDashboard(
  brain: AgentBrain,
  wallet: WalletIPCClient,
  port: number
): void {
  const app = express();

  // Serve static files
  // In compiled output, __dirname is dist/src/dashboard — but public/ lives in src/dashboard/public.
  // Resolve relative to the project root to work in both dev and compiled modes.
  const projectRoot = join(__dirname, '..', '..', '..');
  const publicDir = join(projectRoot, 'src', 'dashboard', 'public');
  app.use(express.static(publicDir));

  // -- API Routes --

  /** Agent brain state */
  app.get('/api/state', (_req, res) => {
    res.json(brain.getState());
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

  /** Health check */
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      walletConnected: wallet.isRunning(),
      brainStatus: brain.getState().status,
    });
  });

  // Bind to localhost only — never expose to network
  app.listen(port, '127.0.0.1', () => {
    console.error(`[dashboard] Listening on http://127.0.0.1:${port}`);
  });
}
