/**
 * Wallet Gateway — Standalone Entry Point
 *
 * Starts the wallet gateway without an agent brain.
 * Provides MCP + REST + Dashboard for any external agent to use.
 *
 * Usage:
 *   node wallet-gateway/dist/src/main.js
 *   OIKOS_MODE=testnet node wallet-gateway/dist/src/main.js
 */

import { loadGatewayConfig } from './config/env.js';
import { WalletIPCClient } from './ipc/client.js';
import { createDashboard } from './dashboard/server.js';
import { resolve } from 'path';

async function main(): Promise<void> {
  console.error('[oikos-gateway] Starting Wallet Gateway...');

  // 1. Load configuration
  const config = loadGatewayConfig();
  console.error(`[oikos-gateway] Mode: ${config.mode} (mock wallet: ${String(config.mockWallet)})`);

  // 2. Spawn wallet-isolate
  const wallet = new WalletIPCClient();
  const walletPath = resolve(config.walletIsolatePath);

  console.error(`[oikos-gateway] Spawning wallet-isolate (${config.walletRuntime}): ${walletPath}`);

  wallet.start(walletPath, config.walletRuntime, {
    MOCK_WALLET: config.mockWallet ? 'true' : 'false',
    POLICY_FILE: config.policyFile,
    AUDIT_LOG_PATH: config.auditLogPath,
  });

  wallet.onDisconnect((reason) => {
    console.error(`[oikos-gateway] Wallet disconnected: ${reason ?? 'unknown'}`);
  });

  // Wait for wallet to initialize
  await new Promise(resolve => setTimeout(resolve, 1000));

  if (!wallet.isRunning()) {
    console.error('[oikos-gateway] FATAL: Wallet isolate failed to start');
    process.exit(1);
  }

  // 3. Start dashboard (no plugin — standalone mode)
  createDashboard(wallet, config.dashboardPort);

  console.error('[oikos-gateway] Wallet Gateway ready (standalone mode).');
  console.error(`[oikos-gateway] Dashboard: http://127.0.0.1:${config.dashboardPort}`);
  console.error(`[oikos-gateway] MCP: POST http://127.0.0.1:${config.dashboardPort}/mcp`);
  console.error('[oikos-gateway] Press Ctrl+C to stop.');

  // Graceful shutdown
  const shutdown = (): void => {
    console.error('[oikos-gateway] Shutting down...');
    wallet.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  console.error('[oikos-gateway] FATAL:', err);
  process.exit(1);
});
