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
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentToCompanionMessage,
  CompanionToAgentMessage,
  CompanionBalanceUpdate,
  CompanionSwarmStatus,
  CompanionAgentReasoning,
  CompanionPolicyUpdate,
  CompanionExecutionNotify,
  CompanionChatReply,
  CompanionStrategyResult,
  CompanionPolicyResult,
  CompanionAuthResponse,
  CompanionAuthUpdate,
} from './types.js';
import type { PassphraseAuth } from '../auth/passphrase.js';

/** State provider — decoupled from any specific brain implementation */
export interface CompanionStateProvider {
  getBalances(): Promise<BalanceResponse[]>;
  getPolicies(): Promise<PolicyStatus[]>;
  getAddresses?(): Promise<Array<{ chain: string; address: string }>>;
  getPrices?(): Promise<Array<{ symbol: string; priceUsd: number; source: string; updatedAt: number }>>;
  getStrategies?(): Promise<Array<{ filename: string; enabled: boolean; source: string; content: string }>>;
  getAudit?(): Promise<Array<Record<string, unknown>>>;
  restartWallet?(): Promise<void>;
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
  private ownsHyperswarm = false;
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
  /** Passphrase auth module — set via setAuth() from main.ts */
  private auth: PassphraseAuth | null = null;

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

  /** Set passphrase auth module for companion auth operations */
  setAuth(auth: PassphraseAuth): void {
    this.auth = auth;
  }

  /** Start listening for companion connections */
  async start(): Promise<void> {
    if (this.started) return;

    // Reuse swarm's Hyperswarm if available (same keypair, same DHT connection).
    // Two Hyperswarm instances with the same keypair on the same machine causes DHT conflicts.
    // The companion joins its OWN topic on the shared instance for channel isolation.
    const swarmHyperswarm = this.swarm && typeof (this.swarm as unknown as { getHyperswarm?: () => Hyperswarm | null }).getHyperswarm === 'function'
      ? (this.swarm as unknown as { getHyperswarm(): Hyperswarm | null }).getHyperswarm()
      : null;

    if (swarmHyperswarm) {
      console.error('[companion] Reusing swarm Hyperswarm (shared keypair, dedicated companion topic)');
      this.hyperswarm = swarmHyperswarm;
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
      this.ownsHyperswarm = true;

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

    // Always join the dedicated companion topic — even when sharing swarm's Hyperswarm.
    // Piggybacking on the board topic causes channel instability: the swarm coordinator
    // cycles connections for peers that don't participate in board/feed protocols.
    const discovery = this.hyperswarm.join(this.companionTopic, {
      server: true,
      client: false,
    });
    // Timeout after 10s — DHT announcement continues in background even if flushed() is slow
    await Promise.race([
      discovery.flushed(),
      new Promise<void>(r => setTimeout(r, 10000)),
    ]);
    console.error(`[companion] Listening on companion topic: ${this.companionTopic.toString('hex').slice(0, 16)}...`);

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
    if (this.hyperswarm && this.ownsHyperswarm) await this.hyperswarm.destroy();
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
          // Route 2: Brain adapter fallback (Ollama/HTTP) — used when hook fails or isn't running
          if (this.config.hookUrl) {
            this._forwardToHook(msg.text).catch((err) => {
              console.error(`[companion] Hook unavailable, falling back to brain: ${err instanceof Error ? err.message : String(err)}`);
              this._chatViaBrain(msg.text);
            });
          } else {
            this._chatViaBrain(msg.text);
          }
          break;
        case 'approval_response':
          console.error(`[companion] Approval: ${msg.proposalId} → ${msg.approved ? 'APPROVED' : 'REJECTED'}`);
          break;
        case 'ping':
          void this._pushStateUpdate();
          break;
        case 'strategy_save':
          this._handleStrategySave(msg.requestId, msg.filename, msg.content);
          break;
        case 'strategy_toggle':
          this._handleStrategyToggle(msg.requestId, msg.filename, msg.enabled);
          break;
        case 'policy_save':
          void this._handlePolicySave(msg.requestId, msg.rules, msg.name);
          break;
        case 'auth_request':
          this._handleAuthRequest(msg.requestId, msg.action, msg.payload);
          break;
        default:
          console.error(`[companion] Unknown message type: ${(msg as { type: string }).type}`);
      }
    } catch {
      console.error('[companion] Failed to parse message');
    }
  }

  private _resolveStrategiesDir(): string {
    const coordDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = join(coordDir, '..', '..', '..');
    const candidates = [
      join(repoRoot, 'strategies'),
      join(process.cwd(), 'strategies'),
      join(process.cwd(), '..', 'strategies'),
    ];
    return candidates.find(d => existsSync(d)) ?? candidates[0] as string;
  }

  private _handleStrategySave(requestId: string, filename: string, content: string): void {
    try {
      if (!filename || !content) {
        this.send({ type: 'strategy_result', requestId, success: false, error: 'filename and content required', timestamp: Date.now() } satisfies CompanionStrategyResult);
        return;
      }
      const strategiesDir = this._resolveStrategiesDir();
      if (!existsSync(strategiesDir)) mkdirSync(strategiesDir, { recursive: true });
      const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, '') + '.md';
      const exists = existsSync(join(strategiesDir, safeName));
      writeFileSync(join(strategiesDir, safeName), content);
      console.error(`[companion] ${exists ? 'Updated' : 'Created'} strategy: ${safeName}`);
      this.send({ type: 'strategy_result', requestId, success: true, filename: safeName, action: exists ? 'updated' : 'created', timestamp: Date.now() } satisfies CompanionStrategyResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[companion] Strategy save error: ${msg}`);
      this.send({ type: 'strategy_result', requestId, success: false, error: msg, timestamp: Date.now() } satisfies CompanionStrategyResult);
    }
  }

  private _handleStrategyToggle(requestId: string, filename: string, enabled: boolean): void {
    try {
      if (!filename || enabled === undefined) {
        this.send({ type: 'strategy_result', requestId, success: false, error: 'filename and enabled required', timestamp: Date.now() } satisfies CompanionStrategyResult);
        return;
      }
      const strategiesDir = this._resolveStrategiesDir();
      const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, '') + '.md';
      const filePath = join(strategiesDir, safeName);
      if (!existsSync(filePath)) {
        this.send({ type: 'strategy_result', requestId, success: false, error: `Strategy not found: ${safeName}`, timestamp: Date.now() } satisfies CompanionStrategyResult);
        return;
      }
      let fileContent = readFileSync(filePath, 'utf-8');
      fileContent = fileContent.replace(/^enabled:\s*(true|false)/m, `enabled: ${enabled}`);
      writeFileSync(filePath, fileContent);
      console.error(`[companion] ${enabled ? 'Enabled' : 'Disabled'} strategy: ${safeName}`);
      this.send({ type: 'strategy_result', requestId, success: true, filename: safeName, action: enabled ? 'enabled' : 'disabled', timestamp: Date.now() } satisfies CompanionStrategyResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[companion] Strategy toggle error: ${msg}`);
      this.send({ type: 'strategy_result', requestId, success: false, error: msg, timestamp: Date.now() } satisfies CompanionStrategyResult);
    }
  }

  /** Handle policy save request from companion — write policies.json and restart wallet */
  private async _handlePolicySave(requestId: string, rules: unknown[], name?: string): Promise<void> {
    try {
      if (!rules || !Array.isArray(rules) || rules.length === 0) {
        this.send({ type: 'policy_result', requestId, success: false, error: 'non-empty rules array required', timestamp: Date.now() } satisfies CompanionPolicyResult);
        return;
      }

      // Find policies.json (same paths as dashboard/server.ts)
      const configPaths = [
        join(process.cwd(), 'policies.json'),
        join(process.cwd(), '..', 'policies.json'),
      ];
      let configPath = configPaths.find(p => existsSync(p));
      if (!configPath) configPath = configPaths[0] as string;

      // Read existing or create default
      const config = existsSync(configPath)
        ? JSON.parse(readFileSync(configPath, 'utf-8')) as { policies: Array<{ id: string; name: string; rules: unknown[] }> }
        : { policies: [{ id: 'default', name: 'Default Policy', rules: [] as unknown[] }] };

      // Update first policy's rules
      if (config.policies?.[0]) {
        config.policies[0].rules = rules;
        if (name) config.policies[0].name = name;
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.error(`[companion] Updated policy config: ${rules.length} rules`);

      // Restart wallet isolate to load new policies (preserves immutability guarantee)
      if (this.stateProvider.restartWallet) {
        await this.stateProvider.restartWallet();
        console.error('[companion] Wallet isolate restarted with new policy');
      }

      this.send({ type: 'policy_result', requestId, success: true, rulesCount: rules.length, timestamp: Date.now() } satisfies CompanionPolicyResult);

      // Push fresh state after restart
      void this._pushStateUpdate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[companion] Policy save error: ${msg}`);
      this.send({ type: 'policy_result', requestId, success: false, error: msg, timestamp: Date.now() } satisfies CompanionPolicyResult);
    }
  }

  private _handleAuthRequest(requestId: string, action: string, payload?: Record<string, unknown>): void {
    const sendResponse = (success: boolean, data?: Record<string, unknown>, error?: string): void => {
      const resp: CompanionAuthResponse = {
        type: 'auth_response', requestId, success,
        data, error, timestamp: Date.now(),
      };
      this.send(resp);
    };

    if (!this.auth) {
      // Auth module not loaded — return disabled status for reads, error for writes
      if (action === 'status') return sendResponse(true, { enabled: false });
      if (action === 'pending') return sendResponse(true, { pending: [] });
      return sendResponse(false, undefined, 'Auth module not loaded');
    }

    try {
      switch (action) {
        case 'status':
          return sendResponse(true, this.auth.getStatus() as unknown as Record<string, unknown>);
        case 'setup': {
          const pp = String(payload?.passphrase ?? '');
          if (!pp) return sendResponse(false, undefined, 'Passphrase required');
          const ok = this.auth.setup(pp, {
            threshold: payload?.threshold as number | undefined,
            timeoutMinutes: payload?.timeoutMinutes as number | undefined,
          });
          return sendResponse(ok, undefined, ok ? undefined : 'Passphrase too short (min 4 chars)');
        }
        case 'verify': {
          const pp = String(payload?.passphrase ?? '');
          if (!pp) return sendResponse(false, { valid: false }, 'Passphrase required');
          const valid = this.auth.verify(pp);
          const status = this.auth.getStatus();
          return sendResponse(true, { valid, expiresAt: valid ? status.expiresAt : null });
        }
        case 'disable': {
          const pp = String(payload?.passphrase ?? '');
          if (!pp) return sendResponse(false, undefined, 'Passphrase required');
          const ok = this.auth.disable(pp);
          return sendResponse(ok, undefined, ok ? undefined : 'Incorrect passphrase');
        }
        case 'change': {
          const cur = String(payload?.currentPassphrase ?? '');
          const next = String(payload?.newPassphrase ?? '');
          if (!cur || !next) return sendResponse(false, undefined, 'Both passphrases required');
          const ok = this.auth.change(cur, next);
          return sendResponse(ok, undefined, ok ? undefined : 'Current passphrase incorrect or new too short');
        }
        case 'settings':
          this.auth.updateSettings({
            threshold: payload?.threshold as number | undefined,
            timeoutMinutes: payload?.timeoutMinutes as number | undefined,
            requireForPolicyChanges: payload?.requireForPolicyChanges as boolean | undefined,
            requireForStrategyActivation: payload?.requireForStrategyActivation as boolean | undefined,
          });
          return sendResponse(true);
        case 'pending':
          return sendResponse(true, { pending: this.auth.getPendingList() });
        case 'resolve': {
          const pp = String(payload?.passphrase ?? '');
          const proposalId = String(payload?.proposalId ?? '');
          if (!pp || !proposalId) return sendResponse(false, undefined, 'Passphrase and proposalId required');
          const approved = this.auth.resolvePending(proposalId, pp);
          return sendResponse(true, { approved });
        }
        default:
          return sendResponse(false, undefined, `Unknown auth action: ${action}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[companion] Auth error: ${msg}`);
      sendResponse(false, undefined, msg);
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

    // Address update (from wallet IPC)
    if (this.stateProvider.getAddresses) {
      try {
        const addresses = await this.stateProvider.getAddresses();
        if (addresses.length > 0) {
          this.send({ type: 'address_update', addresses, timestamp: Date.now() });
        }
      } catch { /* wallet may not be ready */ }
    }

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

    // Strategy update (filesystem strategies)
    if (this.stateProvider.getStrategies) {
      try {
        const strategies = await this.stateProvider.getStrategies();
        this.send({ type: 'strategy_update', strategies, timestamp: Date.now() });
      } catch { /* strategies dir may not exist */ }
    }

    // Audit trail (from wallet IPC)
    if (this.stateProvider.getAudit) {
      try {
        const entries = await this.stateProvider.getAudit();
        if (entries.length > 0) {
          this.send({ type: 'audit_update', entries, timestamp: Date.now() });
        }
      } catch { /* wallet may not be ready */ }
    }

    // Auth status push
    if (this.auth) {
      try {
        const status = this.auth.getStatus();
        const pending = this.auth.getPendingList().map((p: { proposalId: string; description: string; amount: number; createdAt: number; expiresAt: number; resolved: boolean; approved: boolean }) => ({
          proposalId: p.proposalId, description: p.description, amount: p.amount,
          createdAt: p.createdAt, expiresAt: p.expiresAt,
          resolved: p.resolved, approved: p.approved,
        }));
        const authMsg: CompanionAuthUpdate = {
          type: 'auth_update', status, pending, timestamp: Date.now(),
        };
        this.send(authMsg);
      } catch { /* auth may not be ready */ }
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
   *
   * Two modes:
   *   /hooks/agent — isolated run, synchronous reply in HTTP response
   *   /hooks/wake  — injects into main session (full context), reply comes
   *                  asynchronously via companion_reply MCP tool
   *
   * If the response contains a reply, send it back immediately via protomux.
   * If not (wake mode), the agent will call companion_reply MCP when ready.
   */

  /** Route instruction through the brain adapter (Ollama/HTTP LLM) */
  private _chatViaBrain(text: string): void {
    if (!this.onChatHandler) {
      console.error('[companion] No chat handler registered — cannot reply');
      return;
    }
    this.onChatHandler(text).then((result) => {
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
          text: `[oikos-companion] ${text}`,
          name: 'Oikos Companion',
        }),
      });

      if (!res.ok) {
        console.error(`[companion] Hook ${res.status}: ${await res.text().catch(() => '')}`);
        return;
      }

      // Try to parse reply — /hooks/agent returns one, /hooks/wake may not
      try {
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
          console.error(`[companion] Hook reply (sync): "${reply.slice(0, 80)}..."`);
        } else {
          console.error(`[companion] Hook accepted (async — reply via companion_reply MCP)`);
        }
      } catch {
        // No JSON body — wake mode, reply comes via MCP
        console.error(`[companion] Hook accepted (async — reply via companion_reply MCP)`);
      }
    } catch (err) {
      console.error(`[companion] Hook fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err; // Re-throw so caller can fall back to brain adapter
    }
  }
}
