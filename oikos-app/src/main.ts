/**
 * Oikos App — Entry Point
 *
 * Agent-agnostic wallet infrastructure. Spawns the wallet isolate,
 * starts all services (swarm, companion, events, pricing, RGB),
 * and serves MCP + REST + CLI for any agent to connect.
 *
 * No LLM. No brain. No plugin. Just infrastructure.
 * Any agent connects via MCP tools at POST /mcp.
 *
 * @security The app NEVER touches seed phrases or private keys.
 * It sends structured proposals and receives execution results.
 */

import { WalletIPCClient } from './ipc/client.js';
import { loadOikosConfig } from './config/env.js';
import { createDashboard } from './dashboard/server.js';
import { EventBus } from './events/bus.js';
import { getDemoCreators, getDefaultCreator } from './creators/registry.js';
import { PricingService } from './pricing/client.js';
import { resolve } from 'path';
import type { OikosServices, IdentityState, CompanionInstruction, SwarmInterface } from './types.js';
import { createBrainAdapter } from './brain/adapter.js';
import type { ChatMessage } from './brain/adapter.js';
import type { SwarmCoordinatorInterface, AgentCapability } from './swarm/types.js';
import type { CompanionCoordinator, CompanionStateProvider } from './companion/coordinator.js';

async function main(): Promise<void> {
  console.error('[oikos] Starting Oikos App...');

  // 1. Load unified config
  const config = loadOikosConfig();
  console.error(`[oikos] Mode: ${config.mode} | Wallet: ${config.mockWallet ? 'mock' : 'real'}`);

  // 2. Spawn wallet-isolate
  const wallet = new WalletIPCClient();
  const walletPath = resolve(config.walletIsolatePath);
  console.error(`[oikos] Spawning wallet-isolate (${config.walletRuntime}): ${walletPath}`);

  wallet.start(walletPath, config.walletRuntime, {
    MOCK_WALLET: config.mockWallet ? 'true' : 'false',
    POLICY_FILE: config.policyFile,
    AUDIT_LOG_PATH: config.auditLogPath,
  });

  wallet.onDisconnect((reason) => {
    console.error(`[oikos] Wallet disconnected: ${reason ?? 'unknown'}`);
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  if (!wallet.isRunning()) {
    console.error('[oikos] FATAL: Wallet isolate failed to start');
    process.exit(1);
  }

  // 3. Initialize pricing service
  const pricing = new PricingService();
  await pricing.initialize();

  // Initial balance check
  try {
    const balances = await wallet.queryBalanceAll();
    if (balances.length > 0) {
      console.error(`[oikos] Balance: ${balances[0]?.formatted ?? 'unknown'}`);
      const valuation = await pricing.valuatePortfolio(balances);
      console.error(`[oikos] Portfolio: $${valuation.totalUsd.toFixed(2)} USD (${valuation.assets.length} assets)`);
    }
  } catch { /* wallet may not be ready */ }

  // 4. Create EventBus + start event source
  const eventBus = new EventBus();

  if (config.mockEvents) {
    const { MockEventSource } = await import('./events/mock.js');
    const eventSource = new MockEventSource();
    eventSource.onEvents((events) => eventBus.emit(events));
    eventSource.start();
    console.error('[oikos] Events: mock (3-minute cycle)');
  } else if (config.indexerApiKey) {
    const ethAddress = await wallet.queryAddress('ethereum').then(r => r.address).catch(() => '');
    const addresses: Record<string, string> = {};
    if (ethAddress) {
      addresses['ethereum'] = ethAddress;
      addresses['sepolia'] = ethAddress;
    }

    const { IndexerEventSource } = await import('./events/indexer.js');
    const indexerSource = new IndexerEventSource({
      apiKey: config.indexerApiKey,
      baseUrl: config.indexerBaseUrl,
      pollIntervalMs: config.eventPollIntervalMs,
      addresses,
    });
    indexerSource.onEvents((events) => eventBus.emit(events));
    indexerSource.start();
    console.error(`[oikos] Events: live (WDK Indexer, address: ${ethAddress.slice(0, 10)}...)`);
  } else {
    console.error('[oikos] No event source configured (set MOCK_EVENTS=true or INDEXER_API_KEY)');
  }

  // 5. Start swarm (if enabled)
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
      const bootstrapPeers = config.swarmBootstrapPeers
        ? config.swarmBootstrapPeers.split(',').map(s => s.trim()).filter(s => s.length === 64)
        : [];
      swarm = new SwarmCoordinator(wallet, {
        swarmId: config.swarmId,
        agentName: config.agentName,
        capabilities,
        keypairPath: config.keypairPath,
        roomTimeoutMs: 60000,
        heartbeatIntervalMs: 15000,
        relayPubkey: config.swarmRelayPubkey || undefined,
        bootstrapPeers: bootstrapPeers.length > 0 ? bootstrapPeers : undefined,
      });
    }

    // Swarm events flow into the EventBus (agents read via MCP/REST)
    swarm.onEvent((event) => {
      eventBus.emit([{
        type: 'swarm' as const,
        id: `swarm-${Date.now()}`,
        timestamp: new Date().toISOString(),
        data: { type: 'swarm' as const, kind: event.kind, summary: `Swarm: ${event.kind}` },
      }]);
    });

    await swarm.start();
    console.error(`[oikos] Swarm: ${config.mockSwarm ? 'mock' : 'live'} (${config.agentName})`);
  }

  // 6. Start companion (if enabled)
  let companion: CompanionCoordinator | null = null;
  const instructions: CompanionInstruction[] = [];

  if (config.companionEnabled && config.companionOwnerPubkey) {
    const { CompanionCoordinator: CC } = await import('./companion/coordinator.js');

    // State provider backed by wallet IPC (no brain needed)
    const stateProvider: CompanionStateProvider = {
      getBalances: () => wallet.queryBalanceAll(),
      getPolicies: () => wallet.queryPolicy(),
    };

    companion = new CC(wallet, stateProvider, {
      ownerPubkey: config.companionOwnerPubkey,
      keypairPath: config.keypairPath,
      topicSeed: config.companionTopicSeed,
      updateIntervalMs: config.companionUpdateIntervalMs,
    }, swarm ?? undefined);

    companion.onInstruction((text) => {
      console.error(`[oikos] Companion instruction: "${text}"`);
      instructions.push({ text, timestamp: Date.now() });
      // Keep last 50
      if (instructions.length > 50) instructions.splice(0, instructions.length - 50);
    });

    // Chat handler registered after brain adapter is created (deferred in step 9)

    await companion.start();
    console.error(`[oikos] Companion: listening for owner`);
  }

  // 7. Bootstrap ERC-8004 identity (if enabled)
  const identity: IdentityState = {
    registered: false,
    agentId: null,
    walletSet: false,
    agentURI: null,
    registrationTxHash: null,
  };

  if (config.erc8004Enabled) {
    try {
      const creators = getDemoCreators();
      const defaultCreator = getDefaultCreator(creators, 'ethereum');
      if (defaultCreator) {
        const agentURI = `http://127.0.0.1:${config.dashboardPort}/agent-card.json`;
        const regResult = await wallet.registerIdentity(agentURI);
        if (regResult.status === 'registered') {
          identity.registered = true;
          identity.agentId = regResult.agentId ?? null;
          identity.registrationTxHash = regResult.txHash ?? null;
          identity.agentURI = agentURI;

          // Set wallet (deadline: 1 hour from now)
          const deadline = Math.floor(Date.now() / 1000) + 3600;
          const walletResult = await wallet.setAgentWallet(identity.agentId ?? '', deadline);
          identity.walletSet = walletResult.status === 'wallet_set';
        }
      }
    } catch (err) {
      console.error('[oikos] ERC-8004 bootstrap failed:', err);
    }
    console.error(`[oikos] ERC-8004: ${identity.registered ? `registered (agentId: ${identity.agentId ?? 'unknown'})` : 'disabled'}`);
  }

  // 8. Start RGB transport bridge (if enabled)
  let rgbBridge: { stop: () => void } | null = null;

  if (config.rgbEnabled) {
    const { startTransportBridge } = await import('./rgb/transport-bridge.js');
    rgbBridge = startTransportBridge(config.rgbTransportPort, {
      mock: config.mockWallet,
    });
    console.error(`[oikos] RGB transport bridge: http://127.0.0.1:${config.rgbTransportPort}`);
  }

  // 9. Initialize brain adapter (chat bridge)
  const brain = createBrainAdapter({
    type: config.brainType,
    chatUrl: config.brainChatUrl,
    model: config.brainModel,
  });
  const chatMessages: ChatMessage[] = [];
  console.error(`[oikos] Brain: ${brain.name} adapter`);

  // 10. Assemble services
  const services: OikosServices = {
    wallet,
    pricing,
    swarm: swarm as unknown as SwarmInterface | null,
    eventBus,
    identity,
    companionConnected: companion?.isConnected() ?? false,
    instructions,
    brain,
    chatMessages,
  };

  // 11. Register companion chat handler (now that brain is available)
  if (companion && brain) {
    companion.onChat(async (text: string) => {
      try {
        const { buildWalletContext } = await import('./brain/adapter.js');
        const context = await buildWalletContext(services);
        const reply = await brain.chat(text, context);

        // Store both messages in history
        const humanMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          from: 'human',
          timestamp: Date.now(),
        };
        const agentMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: reply,
          from: 'agent',
          timestamp: Date.now(),
        };
        chatMessages.push(humanMsg, agentMsg);
        if (chatMessages.length > 100) chatMessages.splice(0, chatMessages.length - 100);

        return { reply, brainName: brain.name };
      } catch (err) {
        console.error(`[oikos] Chat error: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    });
  }

  // 12. Update companion status dynamically
  if (companion) {
    setInterval(() => {
      services.companionConnected = companion?.isConnected() ?? false;
    }, 1000);
  }

  // 12. Start dashboard (Express: REST + MCP + static UI + public board)
  createDashboard(services, config.dashboardPort, config.dashboardHost);

  console.error('[oikos] Oikos App ready.');
  console.error(`[oikos] Dashboard: http://${config.dashboardHost}:${config.dashboardPort}`);
  console.error(`[oikos] MCP: POST http://${config.dashboardHost}:${config.dashboardPort}/mcp`);
  if (config.dashboardHost === '0.0.0.0') {
    console.error(`[oikos] Public board: http://<your-ip>:${config.dashboardPort}/board`);
  }
  console.error(`[oikos] CLI: oikos --port ${config.dashboardPort} <command>`);
  if (config.swarmEnabled) console.error(`[oikos] Swarm: enabled (${config.agentName})`);
  if (config.companionEnabled) console.error(`[oikos] Companion: enabled`);
  console.error('[oikos] Connect your agent via MCP tools. Oikos is the wallet, your agent is the brain.');
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
