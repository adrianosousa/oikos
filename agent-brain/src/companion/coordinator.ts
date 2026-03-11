/**
 * Companion Coordinator — P2P Human-Agent Channel.
 *
 * Manages the Hyperswarm connection between the Agent Brain and
 * the owner's companion app. Uses the same protomux infrastructure
 * as the swarm layer — just a different channel and auth model.
 *
 * Auth: Owner Ed25519 pubkey verified via Noise handshake.
 * Only the owner can connect as a companion.
 *
 * Design constraint: Companion NEVER talks to Wallet Isolate.
 * Brain translates companion instructions into IPC proposals.
 */

import Hyperswarm from 'hyperswarm';
import Protomux from 'protomux';
import c from 'compact-encoding';
import b4a from 'b4a';
import sodium from 'sodium-universal';
import type { WalletIPCClient } from 'oikos-wallet-gateway';
import type { AgentBrain } from '../agent/brain.js';
import type { SwarmCoordinatorInterface } from '../swarm/types.js';
import type {
  AgentToCompanionMessage,
  CompanionToAgentMessage,
  CompanionBalanceUpdate,
  CompanionSwarmStatus,
  CompanionAgentReasoning,
  CompanionPolicyUpdate,
  CompanionExecutionNotify,
} from './types.js';

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
}

export class CompanionCoordinator {
  private brain: AgentBrain;
  private swarm: SwarmCoordinatorInterface | undefined;
  private config: CompanionConfig;

  private hyperswarm: Hyperswarm | null = null;
  private companionChannel: { channel: unknown; message: unknown } | null = null;
  private ownerPubkeyBuf: Buffer;
  private companionTopic: Buffer;
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private started = false;

  /** Instruction handler — Brain sets this to process companion commands */
  private onInstructionHandler: ((text: string) => void) | null = null;

  constructor(
    _wallet: WalletIPCClient,
    brain: AgentBrain,
    config: CompanionConfig,
    swarm?: SwarmCoordinatorInterface,
  ) {
    this.brain = brain;
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

  /** Register instruction handler (called by Brain to process companion commands) */
  onInstruction(handler: (text: string) => void): void {
    this.onInstructionHandler = handler;
  }

  /** Start listening for companion connections */
  async start(): Promise<void> {
    if (this.started) return;

    // Load agent keypair (reuse swarm identity)
    const { loadOrCreateKeypair } = await import('../swarm/identity.js');
    const keypair = loadOrCreateKeypair(this.config.keypairPath);

    const opts: Record<string, unknown> = { keyPair: keypair };
    if (this.config.dht) opts['dht'] = this.config.dht;

    this.hyperswarm = new Hyperswarm(opts);

    // Connection handler with owner auth
    this.hyperswarm.on('connection', (socket: unknown) => {
      this._onConnection(socket);
    });

    // Join companion topic (server only — we listen, companion connects)
    const discovery = this.hyperswarm.join(this.companionTopic, {
      server: true,
      client: false,
    });
    await discovery.flushed();

    // Start periodic state updates
    this.updateInterval = setInterval(() => {
      this._pushStateUpdate();
    }, this.config.updateIntervalMs);

    this.started = true;
    console.error(`[companion] Listening for companion. Topic: ${this.companionTopic.toString('hex').slice(0, 16)}...`);
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
  notifyExecution(result: import('oikos-wallet-gateway').ExecutionResult): void {
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
    if (this.hyperswarm) await this.hyperswarm.destroy();
    this.started = false;
    this.connected = false;
    console.error('[companion] Stopped.');
  }

  // ── Private ──

  /** Handle incoming connection — verify owner auth */
  private _onConnection(socket: unknown): void {
    const sock = socket as {
      remotePublicKey: Buffer;
      on(event: string, handler: (...args: unknown[]) => void): void;
    };

    const remotePubkey = sock.remotePublicKey;
    if (!remotePubkey) return;

    // CRITICAL: Only allow the authorized owner
    if (!b4a.equals(remotePubkey, this.ownerPubkeyBuf)) {
      console.error(`[companion] Rejected unauthorized connection: ${remotePubkey.toString('hex').slice(0, 16)}...`);
      // Close the socket
      const closeable = socket as { destroy(): void };
      closeable.destroy();
      return;
    }

    console.error(`[companion] Owner connected: ${remotePubkey.toString('hex').slice(0, 16)}...`);

    // Set up protomux companion channel
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
        // socket closed
        this.companionChannel = null;
      },
    });

    const message = channel.messages[0];
    channel.open();

    this.companionChannel = { channel, message };
    this.connected = true;

    // Handle socket close
    sock.on('close', () => {
      this.connected = false;
      // socket closed
      this.companionChannel = null;
    });

    // Push initial state immediately
    this._pushStateUpdate();
  }

  /** Handle incoming companion message */
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
          break;

        case 'approval_response':
          console.error(`[companion] Approval: ${msg.proposalId} → ${msg.approved ? 'APPROVED' : 'REJECTED'}`);
          // TODO: Wire to pending approval queue in brain
          break;

        case 'ping':
          // Respond with current state
          this._pushStateUpdate();
          break;

        default:
          console.error(`[companion] Unknown message type: ${(msg as { type: string }).type}`);
      }
    } catch {
      console.error('[companion] Failed to parse message');
    }
  }

  /** Push current state to connected companion */
  private _pushStateUpdate(): void {
    if (!this.connected) return;

    // Balance update
    const brainState = this.brain.getState();
    const balanceMsg: CompanionBalanceUpdate = {
      type: 'balance_update',
      balances: brainState.balances,
      timestamp: Date.now(),
    };
    this.send(balanceMsg);

    // Agent reasoning
    const reasoningMsg: CompanionAgentReasoning = {
      type: 'agent_reasoning',
      status: brainState.status,
      reasoning: brainState.lastReasoning ?? '',
      decision: brainState.lastDecision ?? '',
      timestamp: Date.now(),
    };
    this.send(reasoningMsg);

    // Policy update
    const policyMsg: CompanionPolicyUpdate = {
      type: 'policy_update',
      policies: brainState.policies,
      timestamp: Date.now(),
    };
    this.send(policyMsg);

    // Swarm status (if available)
    if (this.swarm) {
      const swarmState = this.swarm.getState();
      const swarmMsg: CompanionSwarmStatus = {
        type: 'swarm_status',
        peersConnected: swarmState.boardPeers.length,
        activeRooms: swarmState.activeRooms.length,
        announcements: swarmState.announcements.length,
        economics: {
          totalRevenue: swarmState.economics.totalRevenue,
          totalCosts: swarmState.economics.totalCosts,
          sustainabilityScore: swarmState.economics.sustainabilityScore,
        },
        timestamp: Date.now(),
      };
      this.send(swarmMsg);
    }
  }
}
