/**
 * Companion Coordinator — P2P Human-Agent Channel.
 *
 * Manages the Hyperswarm connection between the Oikos app and
 * the owner's companion app. Uses protomux infrastructure.
 *
 * Auth: Owner Ed25519 pubkey verified via Noise handshake.
 * Only the owner can connect as a companion.
 *
 * Design constraint: Companion NEVER talks to Wallet Isolate directly.
 * Instructions from the companion are queued for any connected agent to read.
 */

import Hyperswarm from 'hyperswarm';
import Protomux from 'protomux';
import c from 'compact-encoding';
import b4a from 'b4a';
import sodium from 'sodium-universal';
import type { WalletIPCClient } from '../ipc/client.js';
import type { BalanceResponse, PolicyStatus } from '../ipc/types.js';
import type { SwarmCoordinatorInterface } from '../swarm/types.js';
import type {
  AgentToCompanionMessage,
  CompanionToAgentMessage,
  CompanionBalanceUpdate,
  CompanionSwarmStatus,
  CompanionAgentReasoning,
  CompanionPolicyUpdate,
  CompanionExecutionNotify,
  CompanionChatReply,
} from './types.js';

/** State provider — decoupled from any specific brain implementation */
export interface CompanionStateProvider {
  getBalances(): Promise<BalanceResponse[]>;
  getPolicies(): Promise<PolicyStatus[]>;
  getPrices?(): Promise<Array<{ symbol: string; priceUsd: number; source: string; updatedAt: number }>>;
}

export interface CompanionConfig {
  /** Ed25519 public key of the authorized owner (hex) */
  ownerPubkey: string;
  /** Agent's keypair for Hyperswarm identity */
  keypairPath: string;
  /** Topic seed for companion discovery */
  topicSeed: string;
  /** How often to push state updates (ms) */
  updateIntervalMs: number;
  /** Injected DHT for testnet */
  dht?: unknown;
  /** Relay peer pubkey for NAT traversal (hex) */
  relayPubkey?: string;
  /** OpenClaw webhook URL for forwarding companion instructions (e.g., http://127.0.0.1:18789/hooks/agent) */
  hookUrl?: string;
  /** OpenClaw webhook auth token */
  hookToken?: string;
}

export class CompanionCoordinator {
  private stateProvider: CompanionStateProvider;
  private swarm: SwarmCoordinatorInterface | undefined;
  private config: CompanionConfig;

  private hyperswarm: Hyperswarm | null = null;
  private isSharedSwarm = false;
  private companionChannel: { channel: unknown; message: unknown } | null = null;
  private ownerPubkeyBuf: Buffer;
  private companionTopic: Buffer;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private started = false;

  /** Instruction handler — set by main.ts to queue instructions */
  private onInstructionHandler: ((text: string) => void) | null = null;
  /** Chat handler — set by main.ts to forward to brain and get reply */
  private onChatHandler: ((text: string) => Promise<{ reply: string; brainName: string } | null>) | null = null;

  constructor(
    _wallet: WalletIPCClient,
    stateProvider: CompanionStateProvider,
    config: CompanionConfig,
    swarm?: SwarmCoordinatorInterface,
  ) {
    this.stateProvider = stateProvider;
    this.config = config;
    this.swarm = swarm;
    this.ownerPubkeyBuf = Buffer.from(config.ownerPubkey, 'hex');

    // Derive companion topic: BLAKE2b-256("oikos-companion-v0", ownerPubkey)
    this.companionTopic = b4a.alloc(32);
    sodium.crypto_generichash(
      this.companionTopic,
      b4a.from(`oikos-companion-v0:${config.topicSeed}`),
      this.ownerPubkeyBuf,
    );
  }

  /** Register instruction handler */
  onInstruction(handler: (text: string) => void): void {
    this.onInstructionHandler = handler;
  }

  /** Register chat handler — called when instruction arrives, forwards to brain, returns reply */
  onChat(handler: (text: string) => Promise<{ reply: string; brainName: string } | null>): void {
    this.onChatHandler = handler;
  }

  /** Start listening for companion connections */
  async start(): Promise<void> {
    if (this.started) return;

    // Try to reuse the swarm's Hyperswarm instance (same UDP socket, same DHT connection)
    // This avoids opening a second UDP port which may be blocked by Docker/NAT
    const swarmHyperswarm = this.swarm && typeof (this.swarm as unknown as { getHyperswarm?: () => Hyperswarm | null }).getHyperswarm === 'function'
      ? (this.swarm as unknown as { getHyperswarm(): Hyperswarm | null }).getHyperswarm()
      : null;

    if (swarmHyperswarm) {
      console.error('[companion] Reusing swarm Hyperswarm instance (shared UDP socket)');
      this.hyperswarm = swarmHyperswarm;
      this.isSharedSwarm = true;
    } else {
      const { loadOrCreateKeypair } = await import('../swarm/identity.js');
      const keypair = loadOrCreateKeypair(this.config.keypairPath);

      const opts: Record<string, unknown> = { keyPair: keypair };
      if (this.config.dht) opts['dht'] = this.config.dht;
      if (this.config.relayPubkey) {
        try {
          const relayBuf = Buffer.from(this.config.relayPubkey, 'hex');
          opts['relayThrough'] = () => relayBuf;
        } catch { /* invalid relay pubkey, skip */ }
      }

      this.hyperswarm = new Hyperswarm(opts);

      // Maintain persistent connection to relay node for bridging
      if (this.config.relayPubkey) {
        try {
          const relayBuf = Buffer.from(this.config.relayPubkey, 'hex');
          this.hyperswarm.joinPeer(relayBuf);
          console.error(`[companion] Joined relay peer: ${this.config.relayPubkey.slice(0, 16)}...`);
        } catch { /* relay join failed, non-fatal */ }
      }
    }

    this.hyperswarm.on('connection', (socket: unknown) => {
      this._onConnection(socket);
    });

    // When sharing the swarm's Hyperswarm, the board topic is already joined.
    // The companion piggybacks on board connections via protomux — no separate topic needed.
    if (!this.isSharedSwarm) {
      const discovery = this.hyperswarm.join(this.companionTopic, {
        server: true,
        client: false,
      });
      await discovery.flushed();
      console.error(`[companion] Listening on companion topic: ${this.companionTopic.toString('hex').slice(0, 16)}...`);
    } else {
      console.error(`[companion] Piggyback on swarm board (shared Hyperswarm, no separate topic)`);
    }

    this.updateInterval = setInterval(() => {
      void this._pushStateUpdate();
    }, this.config.updateIntervalMs);

    this.started = true;
    console.error(`[companion] Authorized owner: ${this.config.ownerPubkey.slice(0, 16)}...`);
  }

  /** Send a message to the connected companion */
  send(msg: AgentToCompanionMessage): boolean {
    if (!this.connected || !this.companionChannel) return false;
    try {
      const m = this.companionChannel.message as { send(buf: Buffer): void };
      m.send(b4a.from(JSON.stringify(msg)));
      return true;
    } catch {
      return false;
    }
  }

  /** Notify companion of an execution result */
  notifyExecution(result: import('../ipc/types.js').ExecutionResult): void {
    const msg: CompanionExecutionNotify = {
      type: 'execution_notify',
      result,
      timestamp: Date.now(),
    };
    this.send(msg);
  }

  /** Check if companion is connected */
  isConnected(): boolean {
    return this.connected;
  }

  /** Graceful shutdown */
  async stop(): Promise<void> {
    if (this.updateInterval) clearInterval(this.updateInterval);
    // Don't destroy shared Hyperswarm — it belongs to the swarm coordinator
    if (this.hyperswarm && !this.isSharedSwarm) await this.hyperswarm.destroy();
    this.started = false;
    this.connected = false;
    console.error('[companion] Stopped.');
  }

  // ── Private ──

  private _onConnection(socket: unknown): void {
    const sock = socket as {
      remotePublicKey: Buffer;
      on(event: string, handler: (...args: unknown[]) => void): void;
    };

    const remotePubkey = sock.remotePublicKey;
    if (!remotePubkey) return;

    // Only open companion channel with the authorized owner
    // Don't destroy non-owner sockets — they may be swarm peers (shared Hyperswarm)
    if (!b4a.equals(remotePubkey, this.ownerPubkeyBuf)) {
      return;
    }

    console.error(`[companion] Owner connected: ${remotePubkey.toString('hex').slice(0, 16)}...`);

    const mux = Protomux.from(socket);
    const channel = mux.createChannel({
      protocol: 'oikos/companion',
      id: null,
      unique: true,
      messages: [{
        encoding: c.raw,
        onmessage: (buf: Buffer) => {
          this._handleMessage(buf);
        },
      }],
      onclose: () => {
        console.error('[companion] Owner disconnected.');
        this.connected = false;
        this.companionChannel = null;
      },
    });

    const message = channel.messages[0];
    channel.open();

    this.companionChannel = { channel, message };
    this.connected = true;

    sock.on('close', () => {
      this.connected = false;
      this.companionChannel = null;
    });

    void this._pushStateUpdate();
  }

  private _handleMessage(buf: Buffer): void {
    try {
      const text = b4a.toString(buf, 'utf-8');
      const msg = JSON.parse(text) as CompanionToAgentMessage;

      switch (msg.type) {
        case 'instruction':
          console.error(`[companion] Instruction: "${msg.text}"`);
          if (this.onInstructionHandler) {
            this.onInstructionHandler(msg.text);
          }
          // Route 1: OpenClaw webhook (preferred — instant, no polling)
          if (this.config.hookUrl) {
            this._forwardToHook(msg.text).catch((err) => {
              console.error(`[companion] Hook error: ${err instanceof Error ? err.message : String(err)}`);
            });
          }
          // Route 2: Brain adapter fallback (Ollama/HTTP)
          else if (this.onChatHandler) {
            this.onChatHandler(msg.text).then((result) => {
              if (result) {
                const reply: CompanionChatReply = {
                  type: 'chat_reply',
                  text: result.reply,
                  brainName: result.brainName,
                  timestamp: Date.now(),
                };
                this.send(reply);
              }
            }).catch((err) => {
              console.error(`[companion] Chat handler error: ${err instanceof Error ? err.message : String(err)}`);
            });
          }
          break;
        case 'approval_response':
          console.error(`[companion] Approval: ${msg.proposalId} → ${msg.approved ? 'APPROVED' : 'REJECTED'}`);
          break;
        case 'ping':
          void this._pushStateUpdate();
          break;
        default:
          console.error(`[companion] Unknown message type: ${(msg as { type: string }).type}`);
      }
    } catch {
      console.error('[companion] Failed to parse message');
    }
  }

  private async _pushStateUpdate(): Promise<void> {
    if (!this.connected) return;

    // Balance update (from wallet IPC, not brain)
    try {
      const balances = await this.stateProvider.getBalances();
      const balanceMsg: CompanionBalanceUpdate = {
        type: 'balance_update',
        balances,
        timestamp: Date.now(),
      };
      this.send(balanceMsg);
    } catch { /* wallet may not be ready */ }

    // Agent reasoning — no agent connected, send stub
    const reasoningMsg: CompanionAgentReasoning = {
      type: 'agent_reasoning',
      status: 'idle',
      reasoning: '',
      decision: '',
      timestamp: Date.now(),
    };
    this.send(reasoningMsg);

    // Policy update (from wallet IPC)
    try {
      const policies = await this.stateProvider.getPolicies();
      const policyMsg: CompanionPolicyUpdate = {
        type: 'policy_update',
        policies,
        timestamp: Date.now(),
      };
      this.send(policyMsg);
    } catch { /* wallet may not be ready */ }

    // Price update (from pricing service)
    if (this.stateProvider.getPrices) {
      try {
        const prices = await this.stateProvider.getPrices();
        if (prices.length > 0) {
          this.send({ type: 'price_update', prices, timestamp: Date.now() });
        }
      } catch { /* pricing may not be ready */ }
    }

    // Swarm status (with full data for UI rendering)
    if (this.swarm) {
      const swarmState = this.swarm.getState();
      const swarmMsg: CompanionSwarmStatus = {
        type: 'swarm_status',
        peersConnected: swarmState.boardPeers.length,
        activeRooms: swarmState.activeRooms.length,
        announcements: swarmState.announcements.length,
        boardPeers: swarmState.boardPeers.map((p: { name: string; pubkey: string; reputation: number }) => ({
          name: p.name, pubkey: p.pubkey, reputation: p.reputation,
        })),
        announcementList: swarmState.announcements.map((a: { id: string; title: string; category: string; agentName: string; description: string; priceRange?: { min: string; max: string; symbol: string }; reputation: number; timestamp: number }) => ({
          id: a.id, title: a.title, category: a.category, agentName: a.agentName,
          description: a.description, priceRange: a.priceRange,
          reputation: a.reputation, timestamp: a.timestamp,
        })),
        roomList: swarmState.activeRooms.map((r: { announcementId: string; status: string; announcement: { title: string }; bids: Array<unknown> }) => ({
          announcementId: r.announcementId, status: r.status,
          announcement: { title: r.announcement?.title ?? 'Room' },
          bids: r.bids?.length ?? 0,
        })),
        identity: swarmState.identity ? { name: swarmState.identity.name, reputation: swarmState.identity.reputation } : undefined,
        economics: {
          totalRevenue: swarmState.economics.totalRevenue,
          totalCosts: swarmState.economics.totalCosts,
          sustainabilityScore: swarmState.economics.sustainabilityScore,
          dealsCompleted: swarmState.economics.completedTasks,
        },
        timestamp: Date.now(),
      };
      this.send(swarmMsg);
    }
  }

  /**
   * Forward a companion instruction to OpenClaw via webhook.
   * POST /hooks/agent → OpenClaw routes to agent session → reply comes back in response.
   * The reply is sent back to the Pear app via protomux chat_reply.
   */
  private async _forwardToHook(text: string): Promise<void> {
    const hookUrl = this.config.hookUrl;
    if (!hookUrl) return;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.hookToken) {
      headers['Authorization'] = `Bearer ${this.config.hookToken}`;
    }

    try {
      const res = await fetch(hookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text,
          name: 'Oikos Companion',
        }),
      });

      if (!res.ok) {
        console.error(`[companion] Hook ${res.status}: ${await res.text().catch(() => '')}`);
        return;
      }

      const data = await res.json() as { response?: string; reply?: string; text?: string };
      const reply = data.response ?? data.reply ?? data.text ?? '';

      if (reply) {
        const chatReply: CompanionChatReply = {
          type: 'chat_reply',
          text: reply,
          brainName: 'openclaw',
          timestamp: Date.now(),
        };
        this.send(chatReply);
        console.error(`[companion] Hook reply: "${reply.slice(0, 80)}..."`);
      }
    } catch (err) {
      console.error(`[companion] Hook fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
