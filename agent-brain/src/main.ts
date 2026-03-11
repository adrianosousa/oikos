/**
 * Agent Brain — Entry Point
 *
 * Wires the Wallet Gateway with the Brain's autonomous services:
 * 1. Load configuration (gateway + brain)
 * 2. Start gateway (spawns wallet, starts dashboard + MCP)
 * 3. Register brain as gateway plugin
 * 4. Initialize LLM, events, swarm, companion
 *
 * @security The Brain NEVER touches seed phrases or private keys.
 * It sends structured PaymentProposals and receives ExecutionResults.
 */

import {
  WalletIPCClient,
  loadGatewayConfig,
  createDashboard,
  getDemoCreators,
  getDefaultCreator,
} from 'oikos-wallet-gateway';
import type { GatewayPlugin, SwarmInterface, PricingInterface } from 'oikos-wallet-gateway';
import { loadBrainConfig } from './config/env.js';
import { AgentBrain } from './agent/brain.js';
import { createLLMClient } from './llm/client.js';
import { MockEventSource } from './events/mock.js';
import { IndexerEventSource } from './events/indexer.js';
import { PricingService } from './pricing/client.js';
import { resolve } from 'path';
import type { SwarmCoordinatorInterface, AgentCapability } from './swarm/types.js';

async function main(): Promise<void> {
  console.error('[oikos] Starting Agent Brain...');

  // 1. Load configuration
  const gwConfig = loadGatewayConfig();
  const brainConfig = loadBrainConfig();
  console.error(`[oikos] Mode: ${gwConfig.mode} | LLM: ${brainConfig.llmMode} (mock: ${String(brainConfig.mockLlm)})`);
  console.error(`[oikos] Events: ${brainConfig.mockEvents ? 'mock' : 'live'}`);

  // 2. Spawn wallet-isolate via gateway
  const wallet = new WalletIPCClient();
  const walletPath = resolve(gwConfig.walletIsolatePath);

  console.error(`[oikos] Spawning wallet-isolate (${gwConfig.walletRuntime}): ${walletPath}`);

  wallet.start(walletPath, gwConfig.walletRuntime, {
    MOCK_WALLET: gwConfig.mockWallet ? 'true' : 'false',
    POLICY_FILE: gwConfig.policyFile,
    AUDIT_LOG_PATH: gwConfig.auditLogPath,
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
  const llmClient = brainConfig.mockLlm ? null : createLLMClient(brainConfig);
  if (!brainConfig.mockLlm) {
    console.error(`[oikos] LLM: ${brainConfig.llmBaseUrl} (model: ${brainConfig.llmModel})`);
  }

  // 4. Initialize agent brain
  const brain = new AgentBrain(wallet, brainConfig, llmClient);

  // Set up creator
  const creators = getDemoCreators();
  const defaultCreator = getDefaultCreator(creators, 'ethereum');
  if (defaultCreator) {
    brain.setCreator(defaultCreator.addresses['ethereum'] ?? '');
    console.error(`[oikos] Creator: ${defaultCreator.name} (${defaultCreator.addresses['ethereum'] ?? 'unknown'})`);
  }

  // 4b. Initialize pricing service
  const pricing = new PricingService();
  await pricing.initialize();
  brain.setPricing(pricing);

  // Initial wallet state refresh
  await brain.refreshWalletState();
  const state = brain.getState();
  if (state.balances.length > 0) {
    console.error(`[oikos] Balance: ${state.balances[0]?.formatted ?? 'unknown'}`);
    const valuation = await pricing.valuatePortfolio(state.balances);
    console.error(`[oikos] Portfolio: $${valuation.totalUsd.toFixed(2)} USD (${valuation.assets.length} assets)`);
  }

  // 4c. Bootstrap ERC-8004 identity (if enabled)
  if (brainConfig.erc8004Enabled) {
    await brain.bootstrapIdentity(gwConfig.dashboardPort);
    console.error(`[oikos] ERC-8004: ${brain.getIdentityState().registered ? 'registered' : 'disabled'}`);
  }

  // 5. Start event source
  if (brainConfig.mockEvents) {
    const eventSource = new MockEventSource();
    eventSource.onEvents((events) => {
      brain.handleEvents(events);
    });
    eventSource.start();
  } else if (brainConfig.indexerApiKey) {
    const ethAddress = await wallet.queryAddress('ethereum').then(r => r.address).catch(() => '');
    const addresses: Record<string, string> = {};
    if (ethAddress) addresses['ethereum'] = ethAddress;
    if (ethAddress) addresses['sepolia'] = ethAddress;

    const indexerSource = new IndexerEventSource({
      apiKey: brainConfig.indexerApiKey,
      baseUrl: brainConfig.indexerBaseUrl,
      pollIntervalMs: brainConfig.eventPollIntervalMs,
      addresses,
    });
    indexerSource.onEvents((events) => {
      brain.handleEvents(events);
    });
    indexerSource.start();
    console.error(`[oikos] Events: live (WDK Indexer, address: ${ethAddress.slice(0, 10)}...)`);
  } else {
    console.error('[oikos] No event source configured (set MOCK_EVENTS=true or INDEXER_API_KEY)');
  }

  // 6. Start swarm (if enabled)
  let swarm: SwarmCoordinatorInterface | null = null;

  if (brainConfig.swarmEnabled) {
    const capabilities = brainConfig.agentCapabilities.split(',').filter(Boolean) as AgentCapability[];

    if (brainConfig.mockSwarm) {
      const { MockSwarmCoordinator } = await import('./swarm/mock.js');
      swarm = new MockSwarmCoordinator(wallet, {
        agentName: brainConfig.agentName,
        capabilities,
        roomTimeoutMs: 60000,
      });
    } else {
      const { SwarmCoordinator } = await import('./swarm/coordinator.js');
      swarm = new SwarmCoordinator(wallet, {
        swarmId: brainConfig.swarmId,
        agentName: brainConfig.agentName,
        capabilities,
        keypairPath: brainConfig.keypairPath,
        roomTimeoutMs: 60000,
        heartbeatIntervalMs: 15000,
      });
    }

    swarm.onEvent((event) => {
      brain.handleSwarmEvent(event);
    });

    await swarm.start();
    console.error(`[oikos] Swarm: ${brainConfig.mockSwarm ? 'mock' : 'live'} (${brainConfig.agentName})`);
  }

  // 6b. Start RGB transport bridge (if enabled)
  let rgbBridge: { stop: () => void } | null = null;

  if (brainConfig.rgbEnabled) {
    const { startTransportBridge } = await import('./rgb/transport-bridge.js');
    rgbBridge = startTransportBridge(brainConfig.rgbTransportPort, {
      mock: gwConfig.mockWallet,
    });
    console.error(`[oikos] RGB transport bridge: http://127.0.0.1:${brainConfig.rgbTransportPort}`);
  }

  // 7. Start companion (if enabled)
  let companion: import('./companion/coordinator.js').CompanionCoordinator | null = null;

  if (brainConfig.companionEnabled && brainConfig.companionOwnerPubkey) {
    const { CompanionCoordinator } = await import('./companion/coordinator.js');
    companion = new CompanionCoordinator(wallet, brain, {
      ownerPubkey: brainConfig.companionOwnerPubkey,
      keypairPath: brainConfig.keypairPath,
      topicSeed: brainConfig.companionTopicSeed,
      updateIntervalMs: brainConfig.companionUpdateIntervalMs,
    }, swarm ?? undefined);

    companion.onInstruction((text) => {
      console.error(`[oikos] Companion instruction: "${text}"`);
    });

    await companion.start();
    console.error(`[oikos] Companion: listening for owner`);
  }

  // 8. Create gateway plugin (brain provides agent state, swarm, pricing to gateway)
  const plugin: GatewayPlugin = {
    getAgentState: () => brain.getState(),
    getIdentityState: () => brain.getIdentityState(),
    getSwarm: () => swarm ? swarm as unknown as SwarmInterface : null,
    getPricing: () => pricing as unknown as PricingInterface,
  };

  // 9. Start dashboard with plugin
  createDashboard(wallet, gwConfig.dashboardPort, plugin);

  console.error('[oikos] Agent Brain ready.');
  console.error(`[oikos] Dashboard: http://127.0.0.1:${gwConfig.dashboardPort}`);
  if (brainConfig.swarmEnabled) {
    console.error(`[oikos] Swarm: enabled (${brainConfig.agentName})`);
  }
  if (brainConfig.companionEnabled) {
    console.error(`[oikos] Companion: enabled (owner: ${brainConfig.companionOwnerPubkey.slice(0, 16)}...)`);
  }
  console.error('[oikos] Press Ctrl+C to stop.');

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.error('[oikos] Shutting down...');
    if (companion) await companion.stop();
    if (swarm) await swarm.stop();
    if (rgbBridge) rgbBridge.stop();
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
