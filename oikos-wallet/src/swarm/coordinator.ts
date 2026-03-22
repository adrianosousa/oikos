/**
 * Swarm Coordinator — Top-level swarm orchestration.
 *
 * Wires together: discovery, channels, marketplace, reputation, economics.
 * Integrates with AgentBrain via event callbacks.
 *
 * This is the real Hyperswarm coordinator (not mock).
 * For demo mode without networking, use MockSwarmCoordinator.
 */

import type { WalletIPCClient } from '../ipc/client.js';
import type { AgentCapability } from './types.js';
import type {
  AgentIdentity,
  SwarmState,
  SwarmPeerInfo,
  BoardAnnouncement,
  BoardMessage,
  RoomMessage,
  FeedMessage,
  SwarmEvent,
  RoomAccept,
  SwarmCoordinatorInterface,
  BoardBidNotification,
  BoardAcceptNotification,
  BoardPaymentNotification,
} from './types.js';
import { SwarmDiscovery } from './discovery.js';
import { ChannelManager } from './channels.js';
import { Marketplace } from './marketplace.js';
import { loadOrCreateKeypair, buildIdentity } from './identity.js';
import type { AgentKeypair } from './identity.js';
import {
  computeReputation,
  computeAuditHash,
  reputationFromAuditEntries,
} from './reputation.js';

export interface SwarmConfig {
  swarmId: string;
  agentName: string;
  capabilities: AgentCapability[];
  keypairPath: string;
  heartbeatIntervalMs: number;
  /** How long announcements stay active (default: 1 hour). Auto-renewed on heartbeat. */
  announcementTtlMs: number;
  /** Injected HyperDHT for testnet */
  dht?: unknown;
  /** Relay peer pubkey (hex) for holepunch fallback */
  relayPubkey?: string;
  /** Explicit peer pubkeys (hex) to connect to via joinPeer */
  bootstrapPeers?: string[];
  /** ERC-8004 on-chain agent ID (if registered). Included in heartbeats for peer discovery. */
  erc8004AgentId?: string;
}

export class SwarmCoordinator implements SwarmCoordinatorInterface {
  private wallet: WalletIPCClient;
  private config: SwarmConfig;
  private keypair: AgentKeypair | null = null;
  private identity: AgentIdentity | null = null;
  private discovery: SwarmDiscovery | null = null;
  private channels: ChannelManager | null = null;
  private marketplace: Marketplace;
  private eventHandlers: Array<(event: SwarmEvent) => void> = [];
  private knownPeers: Map<string, SwarmPeerInfo> = new Map();
  private announcements: BoardAnnouncement[] = [];
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(wallet: WalletIPCClient, config: SwarmConfig) {
    this.wallet = wallet;
    this.config = config;
    this.marketplace = new Marketplace();
  }

  /** Expose underlying Hyperswarm instance for companion to reuse */
  getHyperswarm(): unknown {
    return this.discovery?.getSwarmInstance() ?? null;
  }

  /** Start the swarm: generate identity, join board, begin heartbeat */
  async start(): Promise<void> {
    if (this.started) return;

    // 1. Load/create persistent keypair
    this.keypair = loadOrCreateKeypair(this.config.keypairPath);

    // 2. Compute reputation from audit log
    let reputation = 0.5;
    let auditHash = '';
    try {
      const entries = await this.wallet.queryAudit(1000);
      const input = reputationFromAuditEntries(entries as Array<{ type: string; proposal?: { amount?: string; symbol?: string }; timestamp?: number }>);
      reputation = computeReputation(input);
      auditHash = computeAuditHash(entries);
    } catch {
      // No audit entries yet — use defaults
    }

    // 3. Build identity
    this.identity = buildIdentity(
      this.keypair,
      this.config.agentName,
      this.config.capabilities,
      reputation,
      auditHash
    );

    // Attach ERC-8004 on-chain identity if available
    if (this.config.erc8004AgentId) {
      this.identity.erc8004AgentId = this.config.erc8004AgentId;
    }

    // 4. Initialize discovery (with relay + bootstrap peers)
    this.discovery = new SwarmDiscovery({
      swarmId: this.config.swarmId,
      keypair: this.keypair,
      dht: this.config.dht,
      relayPubkey: this.config.relayPubkey,
    });

    // 5. Initialize channel manager
    this.channels = new ChannelManager({
      onBoardMessage: (msg, fromPubkey) => this._handleBoardMessage(msg, fromPubkey),
      onRoomMessage: (roomId, msg, fromPubkey) => this._handleRoomMessage(roomId, msg, fromPubkey),
      onFeedMessage: (msg, fromPubkey) => this._handleFeedMessage(msg, fromPubkey),
    });

    // 6. Wire discovery -> channels
    this.discovery.onConnection((socket, remotePubkey) => {
      this.channels!.setupPeer(socket, remotePubkey);

      // Auto-open room channels for any active rooms where we're the creator.
      // Ensures late-joining peers can immediately bid (protomux requires both
      // sides to open a channel before messages flow).
      for (const room of this.marketplace.getRooms()) {
        if (room.role === 'creator' && room.status !== 'settled' && room.status !== 'cancelled') {
          this.channels!.openRoomChannel(remotePubkey, room.announcementId);
        }
      }

      this._emit({ kind: 'peer_connected', pubkey: remotePubkey.toString('hex') });
    });

    this.discovery.onDisconnect((remotePubkey) => {
      this.channels!.removePeer(remotePubkey);
      const pubkeyHex = remotePubkey.toString('hex');
      this.knownPeers.delete(pubkeyHex);
      this._emit({ kind: 'peer_disconnected', pubkey: pubkeyHex });
    });

    // 7. Join board
    await this.discovery.joinBoard();

    // 7b. Explicitly connect to bootstrap peers (bypasses topic discovery)
    if (this.config.bootstrapPeers?.length) {
      for (const peerHex of this.config.bootstrapPeers) {
        if (peerHex.length === 64) {
          this.discovery.joinPeer(peerHex);
        }
      }
    }

    // 7c. Maintain persistent connection to the relay node.
    // Critical for Docker/NAT: the relay can only pipe two peers together
    // if it has active connections to BOTH. joinPeer creates an outbound
    // connection (works through NAT), keeping the relay path alive.
    if (this.config.relayPubkey && this.config.relayPubkey.length === 64) {
      this.discovery.joinPeer(this.config.relayPubkey);
    }

    // 8. Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      this._sendHeartbeat();
    }, this.config.heartbeatIntervalMs);

    this.started = true;
    console.error(`[swarm] Started. Identity: ${this.identity.name} (${this.identity.pubkey.slice(0, 12)}...)`);
  }

  /** Post an announcement to the board */
  postAnnouncement(opts: {
    category: import('./types.js').AnnouncementCategory;
    title: string;
    description: string;
    priceRange: { min: string; max: string; symbol: string };
    tags?: string[];
  }): string {
    if (!this.identity || !this.channels) {
      throw new Error('Swarm not started');
    }

    const announcement: BoardAnnouncement = {
      type: 'announcement',
      id: Marketplace.generateAnnouncementId(),
      agentPubkey: this.identity.pubkey,
      agentName: this.identity.name,
      reputation: this.identity.reputation,
      erc8004AgentId: this.identity.erc8004AgentId,
      category: opts.category,
      title: opts.title,
      description: opts.description,
      priceRange: opts.priceRange,
      capabilities: this.identity.capabilities,
      tags: opts.tags || [],
      expiresAt: Date.now() + this.config.announcementTtlMs,
      timestamp: Date.now(),
    };

    // Broadcast on board channel
    this.channels.broadcastBoard(announcement);

    // Track locally
    this.announcements.push(announcement);

    // Create room for this announcement
    this.marketplace.createRoom(announcement);

    // Join the room DHT topic so bidders can find us even without board connection
    if (this.discovery && this.keypair) {
      void this.discovery.joinRoom(announcement.id, this.keypair.publicKey);
    }

    // Pre-open room channels with ALL connected board peers.
    // Critical: protomux drops messages on unmatched channels. If a bidder opens
    // oikos/room/{id} and sends a bid before the creator has opened the same
    // channel, the bid is silently lost. By pre-opening, we ensure the channel
    // is paired and ready when any peer decides to bid.
    const connectedPeers = this.channels.getConnectedPeers();
    for (const peerHex of connectedPeers) {
      this.channels.openRoomChannel(Buffer.from(peerHex, 'hex'), announcement.id);
    }
    console.error(`[swarm] Room channels pre-opened with ${connectedPeers.length} peers`);

    console.error(`[swarm] Posted announcement: ${announcement.title} (${announcement.id.slice(0, 8)})`);
    return announcement.id;
  }

  /** Remove own announcement from the board. Only the creator can remove. */
  removeAnnouncement(announcementId: string): boolean {
    if (!this.identity) return false;
    const idx = this.announcements.findIndex(
      (a) => a.id === announcementId && a.agentPubkey === this.identity!.pubkey,
    );
    if (idx === -1) return false;

    this.announcements.splice(idx, 1);

    // Broadcast removal to peers
    if (this.channels) {
      this.channels.broadcastBoard({
        type: 'announcement_removed',
        id: announcementId,
        agentPubkey: this.identity.pubkey,
        timestamp: Date.now(),
      });
    }

    console.error(`[swarm] Removed announcement: ${announcementId.slice(0, 8)}`);
    return true;
  }

  /** Deliver task result or file content to a room */
  deliverTaskResult(announcementId: string, result: string, opts?: {
    contentHash?: string; contentType?: string; filename?: string; deliveryMethod?: 'inline' | 'url';
  }): boolean {
    if (!this.identity) return false;
    const room = this.marketplace.getRooms().find((r: { announcementId: string }) => r.announcementId === announcementId);
    if (!room) return false;

    room.taskResult = {
      result,
      contentHash: opts?.contentHash,
      contentType: opts?.contentType || 'text/markdown',
      filename: opts?.filename,
      deliveryMethod: opts?.deliveryMethod || 'inline',
      receivedAt: Date.now(),
    };
    room.status = 'executing';

    const msg = {
      type: 'task_result' as const,
      announcementId,
      fromPubkey: this.identity.pubkey,
      result,
      deliveryMethod: opts?.deliveryMethod || 'inline',
      contentHash: opts?.contentHash,
      contentType: opts?.contentType || 'text/markdown',
      filename: opts?.filename,
      timestamp: Date.now(),
    };

    // Broadcast to room channel
    if (this.channels) {
      this.channels.broadcastRoom(announcementId, msg);
    }

    this._emit({
      kind: 'room_message',
      roomId: announcementId,
      message: msg,
      fromPubkey: this.identity.pubkey,
    });

    console.error(`[swarm] Delivered task result for ${announcementId.slice(0, 8)}${opts?.filename ? ` (${opts.filename})` : ''}`);
    return true;
  }

  /** Bid on a peer's announcement */
  async bidOnAnnouncement(
    announcementId: string,
    price: string,
    symbol: string,
    reason: string
  ): Promise<void> {
    if (!this.identity || !this.channels || !this.discovery || !this.keypair) {
      throw new Error('Swarm not started');
    }

    // Find the announcement
    const announcement = this.announcements.find((a) => a.id === announcementId);
    if (!announcement) throw new Error(`Announcement ${announcementId} not found`);

    // Get our wallet address so the creator knows where to pay us (if we're the payee)
    let bidderPaymentAddress: string | undefined;
    let bidderPaymentChain: string | undefined;
    try {
      const addr = await this.wallet.queryAddress('ethereum');
      if (addr && typeof addr === 'object' && 'address' in addr) {
        bidderPaymentAddress = (addr as { address: string }).address;
        bidderPaymentChain = 'ethereum';
      }
    } catch {
      // Will fall back to pubkey-derived address
    }

    // Join the room topic
    const creatorPubkeyBuf = Buffer.from(announcement.agentPubkey, 'hex');
    await this.discovery.joinRoom(announcementId, creatorPubkeyBuf);

    // Open room channel with creator
    this.channels.openRoomChannel(creatorPubkeyBuf, announcementId);

    // Join the room in marketplace
    this.marketplace.joinRoom(announcement);

    // Send bid on room channel (private, E2E encrypted)
    const bid: RoomMessage = {
      type: 'bid',
      announcementId,
      bidderPubkey: this.identity.pubkey,
      bidderName: this.identity.name,
      price,
      symbol,
      reason,
      paymentAddress: bidderPaymentAddress,
      paymentChain: bidderPaymentChain,
      timestamp: Date.now(),
    };

    const sentRoom = this.channels.broadcastRoom(announcementId, bid);

    // Also send bid notification on the board channel (proven reliable).
    // Protomux room channels require both sides to have opened the channel
    // before messages flow. The board channel is always paired (opened in
    // setupPeer). This dual-send guarantees bid delivery.
    const boardBid: BoardBidNotification = {
      type: 'board_bid',
      announcementId,
      bidderPubkey: this.identity.pubkey,
      bidderName: this.identity.name,
      price,
      symbol,
      reason,
      paymentAddress: bidderPaymentAddress,
      paymentChain: bidderPaymentChain,
      timestamp: Date.now(),
    };
    const sentBoard = this.channels.broadcastBoard(boardBid);
    console.error(`[swarm] Bid on ${announcementId.slice(0, 8)}: ${price} ${symbol} (room: ${sentRoom}, board: ${sentBoard})`);
  }

  /** Accept the best bid in a room I created */
  async acceptBestBid(announcementId: string): Promise<RoomAccept | undefined> {
    if (!this.channels || !this.wallet) return undefined;

    const bestBid = this.marketplace.getBestBid(announcementId);
    if (!bestBid) return undefined;

    // Get our payment address
    let paymentAddress = '0x0000000000000000000000000000000000000000';
    try {
      const addr = await this.wallet.queryAddress('ethereum');
      if (addr && typeof addr === 'object' && 'address' in addr) {
        paymentAddress = (addr as { address: string }).address;
      }
    } catch {
      // Use default
    }

    const accept = this.marketplace.acceptBid(
      announcementId,
      bestBid.bidderPubkey,
      paymentAddress,
      'ethereum'
    );

    if (accept) {
      this.channels.broadcastRoom(announcementId, accept);

      // Board fallback for accept notification
      const boardAccept: BoardAcceptNotification = {
        type: 'board_accept',
        announcementId,
        acceptedBidderPubkey: accept.acceptedBidderPubkey,
        agreedPrice: accept.agreedPrice,
        agreedSymbol: accept.agreedSymbol,
        paymentAddress: accept.paymentAddress,
        paymentChain: accept.paymentChain,
        timestamp: Date.now(),
      };
      this.channels.broadcastBoard(boardAccept);

      // Notify losing bidders
      const room = this.marketplace.getRoom(announcementId);
      if (room) {
        for (const bid of room.bids) {
          if (bid.bidderPubkey !== bestBid.bidderPubkey) {
            const reject: RoomMessage = {
              type: 'reject',
              announcementId,
              rejectedBidderPubkey: bid.bidderPubkey,
              reason: `Another bid was accepted (${bestBid.bidderName}: ${bestBid.price} ${bestBid.symbol})`,
              timestamp: Date.now(),
            };
            this.channels.broadcastRoom(announcementId, reject);
            this.channels.broadcastBoard(reject as unknown as BoardMessage);
          }
        }
      }

      console.error(`[swarm] Accepted bid from ${bestBid.bidderName} for ${bestBid.price} ${bestBid.symbol}`);
    }

    return accept;
  }

  /** Submit payment for an accepted task.
   *  Payment direction: the buyer always pays.
   *  - 'buyer': creator is buying → creator pays bidder
   *  - 'seller'/'auction': creator is selling → bidder pays creator
   *  Either party can call this — the system determines who should pay. */
  async submitPayment(announcementId: string): Promise<void> {
    const room = this.marketplace.getRoom(announcementId);
    if (!room || !room.acceptedBid || !room.agreedPrice || !room.agreedSymbol) return;

    const category = room.announcement.category;
    const iAmCreator = room.role === 'creator';

    // The buyer always pays.
    // 'buyer' = creator is the buyer → creator pays bidder
    // 'seller'/'auction' = creator is selling → bidder (the buyer) pays creator
    const creatorPays = category === 'buyer';

    // Validate: only the payer should call submitPayment
    if (creatorPays && !iAmCreator) {
      console.error(`[swarm] Cannot pay: you are the bidder on a 'buyer' announcement. The creator (buyer) pays.`);
      return;
    }
    if (!creatorPays && iAmCreator) {
      console.error(`[swarm] Cannot pay: you are the creator (seller) of a '${category}' announcement. The bidder (buyer) pays.`);
      return;
    }

    // Determine recipient address from negotiation data (real wallet addresses)
    let toAddress: string;
    if (creatorPays) {
      // Creator pays bidder — use bidder's wallet address from their bid
      toAddress = room.acceptedBid.paymentAddress
        ?? room.acceptedBid.bidderPubkey.slice(0, 42); // fallback: pubkey prefix
    } else {
      // Bidder pays creator — use creator's wallet address from the accept message
      toAddress = room.paymentAddress
        ?? room.announcement.agentPubkey.slice(0, 42); // fallback: pubkey prefix
    }

    // Determine chain from negotiation data
    const paymentChain = (creatorPays
      ? room.acceptedBid.paymentChain
      : room.paymentChain) ?? 'ethereum';

    const directionLabel = creatorPays
      ? `${room.announcement.agentName} → ${room.acceptedBid.bidderName}`
      : `${room.acceptedBid.bidderName} → ${room.announcement.agentName}`;
    console.error(`[swarm] Payment direction: ${directionLabel} (${room.agreedPrice} ${room.agreedSymbol})`);

    // Build payment proposal and send via wallet IPC
    // This goes through PolicyEngine — source='swarm'
    try {
      const result = await this.wallet.proposalFromExternal('swarm', 'payment', {
        amount: room.agreedPrice,
        symbol: room.agreedSymbol as 'USDT' | 'BTC' | 'XAUT' | 'USAT' | 'ETH',
        chain: paymentChain as 'ethereum' | 'bitcoin' | 'arbitrum' | 'polygon',
        reason: `Swarm payment for: ${room.announcement.title} [${directionLabel}]`,
        confidence: 0.9,
        strategy: 'swarm-settlement',
        timestamp: Date.now(),
        to: toAddress,
      } as unknown as import('../ipc/types.js').ProposalCommon);

      if (result.status === 'executed') {
        // Send payment confirmation
        const confirm: RoomMessage = {
          type: 'payment_confirm',
          announcementId,
          fromPubkey: this.identity!.pubkey,
          txHash: result.txHash ?? 'unknown',
          amount: room.agreedPrice,
          symbol: room.agreedSymbol,
          timestamp: Date.now(),
        };

        this.channels!.broadcastRoom(announcementId, confirm);

        // Board fallback for payment confirmation
        const boardPayment: BoardPaymentNotification = {
          type: 'board_payment',
          announcementId,
          fromPubkey: this.identity!.pubkey,
          txHash: result.txHash ?? 'unknown',
          amount: room.agreedPrice,
          symbol: room.agreedSymbol,
          timestamp: Date.now(),
        };
        this.channels!.broadcastBoard(boardPayment);

        this.marketplace.settleRoom(announcementId, result.txHash ?? 'unknown');
        console.error(`[swarm] Payment settled for ${announcementId.slice(0, 8)}: ${result.txHash}`);
      } else {
        console.error(`[swarm] Payment ${result.status} for ${announcementId.slice(0, 8)}: ${result.error ?? result.violations.join(', ') ?? 'unknown'}`);
      }
    } catch (err) {
      console.error(`[swarm] Payment error:`, err);
    }
  }

  /** Confirm payment (called when we receive payment_confirm as bidder) */
  confirmPayment(announcementId: string, txHash: string): void {
    this.marketplace.settleRoom(announcementId, txHash);
  }

  /** Cancel a negotiation room (creator only) */
  cancelRoom(announcementId: string): boolean {
    return this.marketplace.cancelRoom(announcementId);
  }

  /** Explicitly connect to a peer by Noise public key */
  joinPeer(pubkeyHex: string): void {
    if (!this.discovery) throw new Error('Swarm not started');
    this.discovery.joinPeer(pubkeyHex);
  }

  /** Stop explicitly connecting to a peer */
  leavePeer(pubkeyHex: string): void {
    if (!this.discovery) throw new Error('Swarm not started');
    this.discovery.leavePeer(pubkeyHex);
  }

  /** Get current swarm state (for dashboard) */
  getState(): SwarmState {
    return {
      identity: this.identity ?? {
        pubkey: '',
        name: this.config.agentName,
        capabilities: this.config.capabilities,
        reputation: 0.5,
        auditHash: '',
      },
      boardPeers: Array.from(this.knownPeers.values()),
      activeRooms: this.marketplace.getRooms(),
      announcements: this.announcements,
      economics: this.marketplace.getEconomics(),
    };
  }

  /** Update ERC-8004 on-chain identity after registration (called from main.ts). */
  updateErc8004AgentId(agentId: string): void {
    if (this.identity) {
      this.identity.erc8004AgentId = agentId;
    }
    this.config.erc8004AgentId = agentId;
  }

  /** Register event handler */
  onEvent(handler: (event: SwarmEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  /** Graceful shutdown */
  async stop(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.discovery) await this.discovery.destroy();
    this.started = false;
    console.error('[swarm] Stopped.');
  }

  // ── Private ──

  /** Emit an event to all registered handlers */
  private _emit(event: SwarmEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  /** Send heartbeat + re-broadcast active announcements to all board peers.
   *  Re-broadcasting ensures late joiners (like the gateway) see our listings. */
  private _sendHeartbeat(): void {
    if (!this.identity || !this.channels) return;
    this.channels.broadcastBoard({
      type: 'heartbeat',
      agentPubkey: this.identity.pubkey,
      agentName: this.identity.name,
      reputation: this.identity.reputation,
      capabilities: this.identity.capabilities,
      erc8004AgentId: this.identity.erc8004AgentId,
      timestamp: Date.now(),
    });

    // Re-broadcast own announcements and auto-renew their TTL.
    // As long as the agent is online and heartbeating, its announcements stay alive.
    // When the agent goes offline, announcements naturally expire after the TTL.
    const now = Date.now();
    for (const ann of this.announcements) {
      if (ann.agentPubkey === this.identity.pubkey) {
        // Renew TTL — announcement lives as long as agent is online
        ann.expiresAt = now + this.config.announcementTtlMs;
        this.channels.broadcastBoard(ann);
      }
    }
  }

  /** Handle incoming board message */
  private _handleBoardMessage(msg: BoardMessage, fromPubkey: Buffer): void {
    const pubkeyHex = fromPubkey.toString('hex');

    if (msg.type === 'heartbeat') {
      // Update known peers
      this.knownPeers.set(pubkeyHex, {
        pubkey: pubkeyHex,
        name: msg.agentName,
        reputation: msg.reputation,
        capabilities: msg.capabilities,
        erc8004AgentId: msg.erc8004AgentId,
        lastSeen: Date.now(),
      });
    } else if (msg.type === 'announcement') {
      // Track announcement
      if (!this.announcements.find((a) => a.id === msg.id)) {
        this.announcements.push(msg);
      }

      // Update known peers from announcement
      this.knownPeers.set(pubkeyHex, {
        pubkey: pubkeyHex,
        name: msg.agentName,
        reputation: msg.reputation,
        capabilities: msg.capabilities,
        erc8004AgentId: msg.erc8004AgentId,
        lastSeen: Date.now(),
      });
    } else if (msg.type === 'board_bid') {
      // Board-level bid fallback: convert to RoomMessage and process via room handler.
      // This guarantees bid delivery even when protomux room channels aren't paired.
      const roomBid: RoomMessage = {
        type: 'bid',
        announcementId: msg.announcementId,
        bidderPubkey: msg.bidderPubkey,
        bidderName: msg.bidderName,
        price: msg.price,
        symbol: msg.symbol,
        reason: msg.reason,
        paymentAddress: msg.paymentAddress,
        paymentChain: msg.paymentChain,
        timestamp: msg.timestamp,
      };
      this._handleRoomMessage(msg.announcementId, roomBid, fromPubkey);
      return; // Skip the board event emit — room handler already emits
    } else if (msg.type === 'board_accept') {
      // Board-level accept fallback
      const roomAccept: RoomMessage = {
        type: 'accept',
        announcementId: msg.announcementId,
        acceptedBidderPubkey: msg.acceptedBidderPubkey,
        agreedPrice: msg.agreedPrice,
        agreedSymbol: msg.agreedSymbol,
        paymentAddress: msg.paymentAddress,
        paymentChain: msg.paymentChain,
        timestamp: msg.timestamp,
      };
      this._handleRoomMessage(msg.announcementId, roomAccept, fromPubkey);
      return;
    } else if (msg.type === 'announcement_removed') {
      // Peer removed their announcement — remove from our local list
      const idx = this.announcements.findIndex((a) => a.id === msg.id);
      if (idx !== -1) {
        this.announcements.splice(idx, 1);
        console.error(`[swarm] Peer removed announcement: ${msg.id.slice(0, 8)}`);
      }
    } else if (msg.type === 'board_payment') {
      // Board-level payment confirmation fallback
      const roomPayment: RoomMessage = {
        type: 'payment_confirm',
        announcementId: msg.announcementId,
        fromPubkey: msg.fromPubkey,
        txHash: msg.txHash,
        amount: msg.amount,
        symbol: msg.symbol,
        timestamp: msg.timestamp,
      };
      this._handleRoomMessage(msg.announcementId, roomPayment, fromPubkey);
      return;
    }

    this._emit({ kind: 'board_message', message: msg, fromPubkey: pubkeyHex });
  }

  /** Handle incoming room message */
  private _handleRoomMessage(roomId: string, msg: RoomMessage, fromPubkey: Buffer): void {
    const fromHex = fromPubkey.toString('hex');

    // Log room events prominently — these are the core negotiation flow
    if (msg.type === 'bid') {
      const bid = msg as { bidderName?: string; price?: string; symbol?: string };
      console.error(`[swarm] ★ BID RECEIVED from ${bid.bidderName ?? fromHex.slice(0, 12)} — ${bid.price} ${bid.symbol} on room ${roomId.slice(0, 8)}`);
    } else if (msg.type === 'accept') {
      console.error(`[swarm] ★ BID ACCEPTED in room ${roomId.slice(0, 8)} by ${fromHex.slice(0, 12)}`);
    } else if (msg.type === 'payment_confirm') {
      const confirm = msg as { amount?: string; symbol?: string; txHash?: string };
      console.error(`[swarm] ★ PAYMENT CONFIRMED in room ${roomId.slice(0, 8)} — ${confirm.amount} ${confirm.symbol} (tx: ${confirm.txHash?.slice(0, 12) ?? '?'})`);
    }

    // Auto-open room channel back to bidder when creator receives a bid.
    // The bidder opens oikos/room/{id}; creator must reciprocate so
    // broadcastRoom (accept, payment_confirm) can reach them.
    if (msg.type === 'bid' && this.channels) {
      const room = this.marketplace.getRoom(roomId);
      if (room && room.role === 'creator') {
        this.channels.openRoomChannel(fromPubkey, roomId);
      }
    }

    this.marketplace.handleRoomMessage(roomId, msg);
    this._emit({
      kind: 'room_message',
      roomId,
      message: msg,
      fromPubkey: fromHex,
    });
  }

  /** Handle incoming feed message */
  private _handleFeedMessage(msg: FeedMessage, fromPubkey: Buffer): void {
    this._emit({
      kind: 'feed_message',
      message: msg,
      fromPubkey: fromPubkey.toString('hex'),
    });
  }
}
