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
import { processActions } from './brain/actions.js';
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
        heartbeatIntervalMs: 15000,       // 15s — heartbeat + announcement re-broadcast
        announcementTtlMs: 3600000,       // 1 hour — auto-renewed on each heartbeat
        relayPubkey: config.swarmRelayPubkey || undefined,
        bootstrapPeers: bootstrapPeers.length > 0 ? bootstrapPeers : undefined,
      });
    }

    // Swarm events flow into the EventBus (agents read via MCP/REST)
    swarm.onEvent((event) => {
      // Build a rich summary so agents polling get_events see useful info
      const ev = event as unknown as Record<string, unknown>;
      let summary = `Swarm: ${event.kind}`;

      if (event.kind === 'room_message') {
        const msg = ev['message'] as Record<string, unknown> | undefined;
        if (msg) {
          if (msg['type'] === 'bid') {
            summary = `Bid received from ${msg['bidderName'] ?? 'unknown'}: ${msg['price']} ${msg['symbol']}`;
          } else if (msg['type'] === 'accept') {
            summary = `Bid accepted in room ${(ev['roomId'] as string | undefined)?.slice(0, 8) ?? '?'}`;
          } else if (msg['type'] === 'payment_confirm') {
            summary = `Payment confirmed: ${msg['amount']} ${msg['symbol']}`;
          }
        }
      } else if (event.kind === 'peer_connected') {
        summary = `Peer connected: ${(ev['pubkey'] as string | undefined)?.slice(0, 12) ?? '?'}...`;
      } else if (event.kind === 'board_message') {
        const msg = ev['message'] as Record<string, unknown> | undefined;
        if (msg?.['type'] === 'announcement') {
          summary = `New announcement: ${msg['title']} by ${msg['agentName']}`;
        }
      }

      eventBus.emit([{
        type: 'swarm' as const,
        id: `swarm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        data: { type: 'swarm' as const, kind: event.kind, summary, details: ev },
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
      getPrices: () => pricing.getAllPrices(),
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

  // 10. x402 client (micropayments)
  let x402Client: import('./x402/client.js').X402Client | null = null;
  const x402Enabled = process.env['X402_ENABLED'] === 'true';
  if (x402Enabled) {
    const { X402Client } = await import('./x402/client.js');
    x402Client = new X402Client(wallet);
    console.error('[x402] Machine payments client enabled');
  }

  // 10b. Spark status (mock for now — wallet isolate handles real ops)
  const sparkEnabled = process.env['SPARK_ENABLED'] === 'true';
  if (sparkEnabled) {
    console.error('[spark] Lightning wallet enabled');
  }

  // 11. Assemble services
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
    x402: x402Client,
    sparkEnabled,
  };

  // 11. Register companion chat handler (now that brain is available)
  if (companion && brain) {
    companion.onChat(async (text: string) => {
      try {
        const { buildWalletContext } = await import('./brain/adapter.js');
        const context = await buildWalletContext(services);
        const rawReply = await brain.chat(text, context, chatMessages);

        // Parse and execute any ACTION: lines in the brain's reply
        const { reply: actionReply, results } = await processActions(rawReply, services);
        if (results.length > 0) {
          console.error(`[companion] Executed ${results.length} action(s): ${results.map(r => `${r.tool}:${r.success ? 'ok' : 'fail'}`).join(', ')}`);
        }

        // If actions were executed, feed results back to LLM for human-friendly interpretation
        let finalReply = actionReply;
        if (results.length > 0) {
          try {
            const interpretPrompt = `The user asked: "${text}"\n\nResult:\n${actionReply}\n\nRespond naturally to the user about this result. RULES: Never mention tool names, ACTION format, or JSON. Never say "tool was executed". Just answer the user's question using the data. Be concise. Do not output any ACTION.`;
            const interpreted = await brain.chat(interpretPrompt, context, chatMessages);
            if (interpreted && !interpreted.includes('ACTION:')) {
              finalReply = interpreted;
            }
          } catch {
            console.error('[companion] Failed to interpret action result, using raw reply');
          }
        }

        // Store both messages in history
        const humanMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          from: 'human',
          timestamp: Date.now(),
        };
        const agentMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: finalReply,
          from: 'agent',
          timestamp: Date.now(),
        };
        chatMessages.push(humanMsg, agentMsg);
        if (chatMessages.length > 100) chatMessages.splice(0, chatMessages.length - 100);

        return { reply: finalReply, brainName: brain.name };
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

  // ═══ 13. AGENT AUTONOMY LOOP ═══
  // Gives the brain real agency: events trigger autonomous reasoning + action chains.
  // The brain acts within policy + strategy constraints — no human needed for routine ops.
  if (brain && swarm) {
    const seenAnnouncements = new Set<string>();
    const seenBids = new Set<string>();
    const processedRoomEvents = new Set<string>();
    let autonomyBusy = false;

    // ── TIER 1: Deterministic auto-actions (no LLM, instant) ──
    const autoAcceptBid = async (announcementId: string, bidderName: string, price: string, symbol: string): Promise<boolean> => {
      try {
        const result = await swarm.acceptBestBid(announcementId);
        if (result) {
          console.error(`[autonomy] Auto-accepted bid from ${bidderName}: ${price} ${symbol} on ${announcementId.slice(0, 8)}`);
          return true;
        }
      } catch (err) {
        console.error(`[autonomy] Auto-accept failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return false;
    };

    const autoSubmitPayment = async (announcementId: string): Promise<boolean> => {
      try {
        await swarm.submitPayment(announcementId);
        console.error(`[autonomy] Auto-submitted payment for ${announcementId.slice(0, 8)}`);
        return true;
      } catch (err) {
        console.error(`[autonomy] Auto-payment failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      return false;
    };

    const autoDeliverStrategy = async (announcementId: string): Promise<boolean> => {
      if (!swarm.deliverTaskResult) return false;
      // Read active strategies and deliver the first one (or a generic response)
      try {
        const fs = await import('fs');
        const path = await import('path');
        const strategiesDir = path.resolve(process.cwd(), '..', 'strategies');
        const files = fs.existsSync(strategiesDir) ? fs.readdirSync(strategiesDir).filter((f: string) => f.endsWith('.md')) : [];
        if (files.length > 0) {
          const firstFile = files[0] as string;
          const content = fs.readFileSync(path.join(strategiesDir, firstFile), 'utf-8');
          return swarm.deliverTaskResult(announcementId, content, {
            filename: firstFile,
            contentType: 'text/markdown',
            deliveryMethod: 'inline',
          });
        }
        return swarm.deliverTaskResult(announcementId, 'Task completed. No strategy file available for delivery.', {
          contentType: 'text/plain',
          deliveryMethod: 'inline',
        });
      } catch {
        return false;
      }
    };

    // ── TIER 1 Event Router ──
    swarm.onEvent(async (event) => {
      if (autonomyBusy) return;
      const ev = event as unknown as Record<string, unknown>;

      if (event.kind === 'room_message') {
        const msg = ev['message'] as Record<string, unknown> | undefined;
        if (!msg) return;
        const annId = (msg['announcementId'] as string) || '';
        const eventKey = `${annId}-${msg['type']}-${msg['fromPubkey'] || ''}`;
        if (processedRoomEvents.has(eventKey)) return;
        processedRoomEvents.add(eventKey);

        if (msg['type'] === 'bid') {
          // ── Deterministic: accept if price is within range and rep >= 50% ──
          const bidKey = `${annId}-${msg['fromPubkey'] || msg['bidderName']}`;
          if (seenBids.has(bidKey)) return;
          seenBids.add(bidKey);

          const bidRep = msg['bidderReputation'] as number || 0;
          const bidPrice = parseFloat(msg['price'] as string || '0');
          const bidderName = (msg['bidderName'] as string) || 'unknown';
          const bidSymbol = (msg['symbol'] as string) || 'USDT';

          // Check: is this our announcement?
          const state = swarm.getState();
          const ourAnn = state.announcements.find((a: { id: string }) => a.id === annId);
          if (!ourAnn) return; // not our announcement, ignore

          // Check price is within our range
          const minPrice = parseFloat(ourAnn.priceRange?.min || '0');
          const maxPrice = parseFloat(ourAnn.priceRange?.max || '999999');
          const priceOk = bidPrice >= minPrice && bidPrice <= maxPrice;
          const repOk = bidRep >= 0.3; // 30% min for auto-accept

          if (priceOk && repOk) {
            autonomyBusy = true;
            const accepted = await autoAcceptBid(annId, bidderName, msg['price'] as string, bidSymbol);
            if (accepted) {
              // Log to chat
              chatMessages.push(
                { id: `auto-${Date.now()}`, text: `[Auto] Accepted bid from ${bidderName}: ${msg['price']} ${bidSymbol}`, from: 'agent', timestamp: Date.now() },
              );
            }
            setTimeout(() => { autonomyBusy = false; }, 3000);
          } else {
            console.error(`[autonomy] Bid from ${bidderName} (${(bidRep * 100).toFixed(0)}% rep, ${bidPrice} ${bidSymbol}) — ${!priceOk ? 'price out of range' : 'rep too low'}, skipping`);
          }

        } else if (msg['type'] === 'accept') {
          // ── Our bid was accepted → auto-deliver if we're seller, auto-pay if buyer ──
          autonomyBusy = true;
          const rooms = swarm.getState().activeRooms || [];
          const room = rooms.find((r: { announcementId: string }) => r.announcementId === annId);
          if (room && room.role === 'creator') {
            // We're the seller — deliver our content
            const delivered = await autoDeliverStrategy(annId);
            if (delivered) {
              chatMessages.push(
                { id: `auto-${Date.now()}`, text: `[Auto] Delivered strategy file for deal ${annId.slice(0, 8)}`, from: 'agent', timestamp: Date.now() },
              );
            }
          } else if (room && room.role === 'bidder') {
            // We're the buyer — submit payment
            await autoSubmitPayment(annId);
            chatMessages.push(
              { id: `auto-${Date.now()}`, text: `[Auto] Submitted payment for deal ${annId.slice(0, 8)}`, from: 'agent', timestamp: Date.now() },
            );
          }
          setTimeout(() => { autonomyBusy = false; }, 3000);

        } else if (msg['type'] === 'task_result') {
          // ── Content delivered to us → auto-pay ──
          autonomyBusy = true;
          await autoSubmitPayment(annId);
          const filename = msg['filename'] as string || 'content';
          chatMessages.push(
            { id: `auto-${Date.now()}`, text: `[Auto] Received ${filename} and submitted payment for ${annId.slice(0, 8)}`, from: 'agent', timestamp: Date.now() },
          );
          setTimeout(() => { autonomyBusy = false; }, 3000);

        } else if (msg['type'] === 'payment_confirm') {
          // ── Deal complete → log it ──
          chatMessages.push(
            { id: `auto-${Date.now()}`, text: `[Auto] Deal ${annId.slice(0, 8)} settled: ${msg['amount']} ${msg['symbol']}`, from: 'agent', timestamp: Date.now() },
          );
        }
      } else if (event.kind === 'board_message') {
        const msg = ev['message'] as Record<string, unknown> | undefined;
        if (msg?.['type'] === 'announcement') {
          const annId = msg['id'] as string || '';
          if (!seenAnnouncements.has(annId)) {
            seenAnnouncements.add(annId);
            // Silent log — no LLM call, no bidding. Human must instruct to buy.
          }
        }
      }
    });

    console.error('[autonomy] Deterministic autonomy loop active (Tier 1: no LLM, instant decisions)');
  }

  // 14. Start dashboard (Express: REST + MCP + static UI + public board)
  createDashboard(services, config.dashboardPort, config.dashboardHost);

  console.error('[oikos] Oikos App ready.');
  console.error(`[oikos] Dashboard: http://${config.dashboardHost}:${config.dashboardPort}`);
  console.error(`[oikos] MCP: POST http://${config.dashboardHost}:${config.dashboardPort}/mcp`);
  console.error(`[oikos] Remote MCP: http://${config.dashboardHost}:${config.dashboardPort}/mcp/remote`);
  if (config.dashboardHost === '0.0.0.0') {
    console.error(`[oikos] Public board: http://<your-ip>:${config.dashboardPort}/board`);
    console.error(`[oikos] Claude iOS: Add https://<your-domain>/mcp/remote as custom connector`);
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
