/**
 * Agent Brain — Entry Point
 *
 * Wires all components together:
 * 1. Load configuration
 * 2. Spawn wallet-isolate process (Bare Runtime)
 * 3. Initialize LLM client (Ollama or cloud)
 * 4. Start event source (mock or real)
 * 5. Start agent brain (reasoning loop)
 * 6. Start swarm (if enabled)
 * 7. Start dashboard (localhost-only)
 *
 * @security The Brain NEVER touches seed phrases or private keys.
 * It sends structured PaymentProposals and receives ExecutionResults.
 */

import { loadConfig } from './config/env.js';
import { WalletIPCClient } from './ipc/client.js';
import { AgentBrain } from './agent/brain.js';
import { createLLMClient } from './llm/client.js';
import { MockEventSource } from './events/mock.js';
import { getDemoCreators, getDefaultCreator } from './creators/registry.js';
import { createDashboard } from './dashboard/server.js';
import { resolve } from 'path';
import type { SwarmCoordinatorInterface, AgentCapability } from './swarm/types.js';

async function main(): Promise<void> {
  console.error('[oikos] Starting Agent Brain...');

  // 1. Load configuration
  const config = loadConfig();
  console.error(`[oikos] LLM mode: ${config.llmMode} (mock: ${String(config.mockLlm)})`);
  console.error(`[oikos] Events: ${config.mockEvents ? 'mock' : 'live'}`);

  // 2. Spawn wallet-isolate
  const wallet = new WalletIPCClient();
  const walletPath = resolve(config.walletIsolatePath);

  // Detect runtime — use 'node' for development, 'bare' for production
  const runtime: 'bare' | 'node' = process.env['WALLET_RUNTIME'] === 'bare' ? 'bare' : 'node';
  console.error(`[oikos] Spawning wallet-isolate (${runtime}): ${walletPath}`);

  wallet.start(walletPath, runtime, {
    MOCK_WALLET: config.mockWallet ? 'true' : 'false',
    POLICY_FILE: config.policyFile,
    AUDIT_LOG_PATH: config.auditLogPath,
  });

  wallet.onDisconnect((reason) => {
    console.error(`[oikos] Wallet disconnected: ${reason ?? 'unknown'}`);
  });

  // Wait for wallet to initialize
  await new Promise(resolve => setTimeout(resolve, 1000));

  if (!wallet.isRunning()) {
    console.error('[oikos] FATAL: Wallet isolate failed to start');
    process.exit(1);
  }

  // 3. Initialize LLM client
  const llmClient = config.mockLlm ? null : createLLMClient(config);
  if (!config.mockLlm) {
    console.error(`[oikos] LLM: ${config.llmBaseUrl} (model: ${config.llmModel})`);
  }

  // 4. Initialize agent brain
  const brain = new AgentBrain(wallet, config, llmClient);

  // Set up creator
  const creators = getDemoCreators();
  const defaultCreator = getDefaultCreator(creators, 'ethereum');
  if (defaultCreator) {
    brain.setCreator(defaultCreator.addresses['ethereum'] ?? '');
    console.error(`[oikos] Creator: ${defaultCreator.name} (${defaultCreator.addresses['ethereum'] ?? 'unknown'})`);
  }

  // Initial wallet state refresh
  await brain.refreshWalletState();
  const state = brain.getState();
  if (state.balances.length > 0) {
    console.error(`[oikos] Balance: ${state.balances[0]?.formatted ?? 'unknown'}`);
  }

  // 5. Start event source
  if (config.mockEvents) {
    const eventSource = new MockEventSource();
    eventSource.onEvents((events) => {
      brain.handleEvents(events);
    });
    eventSource.start();
  } else {
    console.error('[oikos] Live events not yet implemented — using idle mode');
  }

  // 6. Start swarm (if enabled)
  let swarm: SwarmCoordinatorInterface | null = null;

  if (config.swarmEnabled) {
    const capabilities = config.agentCapabilities.split(',').filter(Boolean) as AgentCapability[];

    if (config.mockSwarm) {
      const { MockSwarmCoordinator } = await import('./swarm/mock.js');
      swarm = new MockSwarmCoordinator(wallet, {
        agentName: config.agentName,
        capabilities,
        roomTimeoutMs: 60000,
      });
    } else {
      const { SwarmCoordinator } = await import('./swarm/coordinator.js');
      swarm = new SwarmCoordinator(wallet, {
        swarmId: config.swarmId,
        agentName: config.agentName,
        capabilities,
        keypairPath: config.keypairPath,
        roomTimeoutMs: 60000,
        heartbeatIntervalMs: 15000,
      });
    }

    // Wire swarm events to brain
    swarm.onEvent((event) => {
      brain.handleSwarmEvent(event);
    });

    await swarm.start();
    console.error(`[oikos] Swarm: ${config.mockSwarm ? 'mock' : 'live'} (${config.agentName})`);
  }

  // 7. Start dashboard
  createDashboard(brain, wallet, config.dashboardPort, swarm ?? undefined);

  console.error('[oikos] Agent Brain ready.');
  console.error(`[oikos] Dashboard: http://127.0.0.1:${config.dashboardPort}`);
  if (config.swarmEnabled) {
    console.error(`[oikos] Swarm: enabled (${config.agentName})`);
  }
  console.error('[oikos] Press Ctrl+C to stop.');

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.error('[oikos] Shutting down...');
    if (swarm) await swarm.stop();
    wallet.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
}

main().catch((err: unknown) => {
  console.error('[oikos] FATAL:', err);
  process.exit(1);
});
