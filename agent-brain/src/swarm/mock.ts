/**
 * Mock Swarm Coordinator — Simulates multi-agent swarm locally.
 *
 * Creates 2 virtual peer agents (AlphaBot, BetaBot) that:
 * 1. "Connect" to the board (simulated peer events)
 * 2. Post announcements (service offers)
 * 3. Bid on our announcements
 * 4. Accept payment and confirm
 *
 * Follows the same pattern as MockEventSource (events/mock.ts):
 * scripted timeline with setTimeout scheduling.
 *
 * Used when MOCK_SWARM=true. Implements SwarmCoordinatorInterface
 * so the rest of the system (brain, dashboard) can't tell the difference.
 */

import { randomUUID } from 'crypto';
import type { WalletIPCClient } from '../ipc/client.js';
import type {
  AgentIdentity,
  SwarmState,
  SwarmPeerInfo,
  BoardAnnouncement,
  RoomAccept,
  SwarmEvent,
  SwarmCoordinatorInterface,
  AgentCapability,
} from './types.js';
import { Marketplace } from './marketplace.js';

interface MockPeer {
  identity: AgentIdentity;
  info: SwarmPeerInfo;
}

export interface MockSwarmConfig {
  agentName: string;
  capabilities: AgentCapability[];
  roomTimeoutMs: number;
}

export class MockSwarmCoordinator implements SwarmCoordinatorInterface {
  private wallet: WalletIPCClient;
  private config: MockSwarmConfig;
  private marketplace: Marketplace;
  private eventHandlers: Array<(event: SwarmEvent) => void> = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private peers: MockPeer[] = [];
  private announcements: BoardAnnouncement[] = [];
  private identity: AgentIdentity;
  private started = false;

  constructor(wallet: WalletIPCClient, config: MockSwarmConfig) {
    this.wallet = wallet;
    this.config = config;
    this.marketplace = new Marketplace();

    // Our agent identity (mock pubkey)
    this.identity = {
      pubkey: 'a1b2c3d4e5f6'.padEnd(64, '0'),
      name: config.agentName,
      capabilities: config.capabilities,
      reputation: 0.5,
      auditHash: '0'.repeat(64),
    };
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // Create mock peers
    this.peers = [
      this._createMockPeer('AlphaBot', ['price-feed', 'data-provider'], 0.82),
      this._createMockPeer('BetaBot', ['yield-optimizer', 'portfolio-analyst'], 0.75),
    ];

    console.error(`[swarm:mock] Started with 2 mock peers: AlphaBot, BetaBot`);

    // Scripted timeline
    this._schedule(2000, () => this._peerConnects(this.peers[0]!));
    this._schedule(4000, () => this._peerConnects(this.peers[1]!));
    this._schedule(7000, () => this._peerAnnounces(this.peers[0]!, {
      category: 'service',
      title: 'Real-time price feed (USDt/XAUt/USAt)',
      description: 'Streaming price data for all Tether assets. Updated every 5 seconds.',
      priceRange: { min: '0.5', max: '2', symbol: 'USDT' },
    }));
    this._schedule(12000, () => this._peerAnnounces(this.peers[1]!, {
      category: 'service',
      title: 'Yield optimization analysis',
      description: 'Analyze DeFi protocols and recommend best yield strategies for your portfolio.',
      priceRange: { min: '1', max: '5', symbol: 'USDT' },
    }));

    // After 20s, if we have posted an announcement, mock peers bid on it
    this._schedule(20000, () => this._mockPeersBidOnOurAnnouncements());

    // Periodic: check for our new announcements and bid on them
    this._schedule(35000, () => this._mockPeersBidOnOurAnnouncements());
    this._schedule(50000, () => this._mockPeersBidOnOurAnnouncements());
  }

  async stop(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    this.started = false;
    console.error('[swarm:mock] Stopped.');
  }

  getState(): SwarmState {
    return {
      identity: this.identity,
      boardPeers: this.peers.map((p) => p.info),
      activeRooms: this.marketplace.getRooms(),
      announcements: this.announcements,
      economics: this.marketplace.getEconomics(),
    };
  }

  onEvent(handler: (event: SwarmEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  postAnnouncement(opts: {
    category: 'service' | 'auction' | 'request';
    title: string;
    description: string;
    priceRange: { min: string; max: string; symbol: string };
  }): string {
    const announcement: BoardAnnouncement = {
      type: 'announcement',
      id: randomUUID(),
      agentPubkey: this.identity.pubkey,
      agentName: this.identity.name,
      reputation: this.identity.reputation,
      category: opts.category,
      title: opts.title,
      description: opts.description,
      priceRange: opts.priceRange,
      capabilities: this.identity.capabilities,
      expiresAt: Date.now() + this.config.roomTimeoutMs,
      timestamp: Date.now(),
    };

    this.announcements.push(announcement);
    this.marketplace.createRoom(announcement, this.config.roomTimeoutMs);
    console.error(`[swarm:mock] Our announcement: ${opts.title} (${announcement.id.slice(0, 8)})`);

    // Mock peers will bid on this after a delay
    this._schedule(5000, () => this._mockPeerBidsOnAnnouncement(announcement));

    return announcement.id;
  }

  async bidOnAnnouncement(
    announcementId: string,
    price: string,
    symbol: string,
    _reason: string
  ): Promise<void> {
    const announcement = this.announcements.find((a) => a.id === announcementId);
    if (!announcement) return;

    this.marketplace.joinRoom(announcement);

    // Simulate our bid being acknowledged
    console.error(`[swarm:mock] We bid ${price} ${symbol} on ${announcementId.slice(0, 8)}`);

    // Mock: peer accepts our bid after 3s
    this._schedule(3000, () => {
      this.marketplace.handleRoomMessage(announcementId, {
        type: 'accept',
        announcementId,
        acceptedBidderPubkey: this.identity.pubkey,
        agreedPrice: price,
        agreedSymbol: symbol,
        paymentAddress: announcement.agentPubkey.slice(0, 42),
        paymentChain: 'ethereum',
        timestamp: Date.now(),
      });

      this._emit({
        kind: 'room_message',
        roomId: announcementId,
        message: {
          type: 'accept',
          announcementId,
          acceptedBidderPubkey: this.identity.pubkey,
          agreedPrice: price,
          agreedSymbol: symbol,
          paymentAddress: announcement.agentPubkey.slice(0, 42),
          paymentChain: 'ethereum',
          timestamp: Date.now(),
        },
        fromPubkey: announcement.agentPubkey,
      });

      // Mock: payment comes from the peer after 5s
      this._schedule(5000, () => {
        const txHash = `0xmock${Date.now().toString(16)}`;
        this.marketplace.settleRoom(announcementId, txHash);
        this._emit({
          kind: 'room_message',
          roomId: announcementId,
          message: {
            type: 'payment_confirm',
            announcementId,
            fromPubkey: announcement.agentPubkey,
            txHash,
            amount: price,
            symbol,
            timestamp: Date.now(),
          },
          fromPubkey: announcement.agentPubkey,
        });
        console.error(`[swarm:mock] Payment received for ${announcementId.slice(0, 8)}: ${txHash}`);
      });
    });
  }

  async acceptBestBid(announcementId: string): Promise<RoomAccept | undefined> {
    const bestBid = this.marketplace.getBestBid(announcementId);
    if (!bestBid) return undefined;

    const accept = this.marketplace.acceptBid(
      announcementId,
      bestBid.bidderPubkey,
      this.identity.pubkey.slice(0, 42),
      'ethereum'
    );

    if (accept) {
      console.error(`[swarm:mock] Accepted bid from ${bestBid.bidderName}: ${bestBid.price} ${bestBid.symbol}`);

      // Mock: task result arrives after 2s
      this._schedule(2000, () => {
        this.marketplace.handleRoomMessage(announcementId, {
          type: 'task_result',
          announcementId,
          fromPubkey: bestBid.bidderPubkey,
          result: `Mock result from ${bestBid.bidderName}: data delivered successfully.`,
          timestamp: Date.now(),
        });

        // Payment request follows
        this.marketplace.handleRoomMessage(announcementId, {
          type: 'payment_request',
          announcementId,
          fromPubkey: bestBid.bidderPubkey,
          amount: bestBid.price,
          symbol: bestBid.symbol,
          chain: 'ethereum',
          toAddress: bestBid.bidderPubkey.slice(0, 42),
          timestamp: Date.now(),
        });

        this._emit({
          kind: 'room_message',
          roomId: announcementId,
          message: {
            type: 'payment_request',
            announcementId,
            fromPubkey: bestBid.bidderPubkey,
            amount: bestBid.price,
            symbol: bestBid.symbol,
            chain: 'ethereum',
            toAddress: bestBid.bidderPubkey.slice(0, 42),
            timestamp: Date.now(),
          },
          fromPubkey: bestBid.bidderPubkey,
        });
      });
    }

    return accept;
  }

  async submitPayment(announcementId: string): Promise<void> {
    const room = this.marketplace.getRoom(announcementId);
    if (!room || !room.acceptedBid || !room.agreedPrice || !room.agreedSymbol) return;

    try {
      const result = await this.wallet.proposalFromExternal('swarm', 'payment', {
        amount: room.agreedPrice,
        symbol: room.agreedSymbol as 'USDT' | 'BTC' | 'XAUT' | 'USAT' | 'ETH',
        chain: 'ethereum' as const,
        reason: `Swarm payment for: ${room.announcement.title}`,
        confidence: 0.9,
        strategy: 'swarm-settlement',
        timestamp: Date.now(),
        to: room.acceptedBid.bidderPubkey.slice(0, 42),
      } as unknown as import('../ipc/types.js').ProposalCommon);

      if (result.status === 'executed') {
        this.marketplace.settleRoom(announcementId, result.txHash ?? 'mock-tx');
        console.error(`[swarm:mock] Payment executed for ${announcementId.slice(0, 8)}: ${result.txHash}`);
      } else {
        console.error(`[swarm:mock] Payment ${result.status}: ${result.error ?? result.violations.join(', ')}`);
      }
    } catch (err) {
      console.error(`[swarm:mock] Payment error:`, err);
    }
  }

  confirmPayment(announcementId: string, txHash: string): void {
    this.marketplace.settleRoom(announcementId, txHash);
  }

  // ── Private ──

  private _createMockPeer(name: string, caps: AgentCapability[], reputation: number): MockPeer {
    const pubkey = Buffer.from(name).toString('hex').padEnd(64, '0');
    return {
      identity: {
        pubkey,
        name,
        capabilities: caps,
        reputation,
        auditHash: '0'.repeat(64),
      },
      info: {
        pubkey,
        name,
        capabilities: caps,
        reputation,
        lastSeen: Date.now(),
      },
    };
  }

  private _schedule(delayMs: number, fn: () => void): void {
    const timer = setTimeout(fn, delayMs);
    this.timers.push(timer);
  }

  private _emit(event: SwarmEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  private _peerConnects(peer: MockPeer): void {
    peer.info.lastSeen = Date.now();
    this._emit({ kind: 'peer_connected', pubkey: peer.identity.pubkey, name: peer.identity.name });
    console.error(`[swarm:mock] Peer connected: ${peer.identity.name}`);
  }

  private _peerAnnounces(peer: MockPeer, opts: {
    category: 'service' | 'auction' | 'request';
    title: string;
    description: string;
    priceRange: { min: string; max: string; symbol: string };
  }): void {
    const announcement: BoardAnnouncement = {
      type: 'announcement',
      id: randomUUID(),
      agentPubkey: peer.identity.pubkey,
      agentName: peer.identity.name,
      reputation: peer.identity.reputation,
      category: opts.category,
      title: opts.title,
      description: opts.description,
      priceRange: opts.priceRange,
      capabilities: peer.identity.capabilities,
      expiresAt: Date.now() + this.config.roomTimeoutMs,
      timestamp: Date.now(),
    };

    this.announcements.push(announcement);
    this._emit({ kind: 'board_message', message: announcement, fromPubkey: peer.identity.pubkey });
    console.error(`[swarm:mock] ${peer.identity.name} announced: ${opts.title}`);
  }

  private _mockPeersBidOnOurAnnouncements(): void {
    const ourAnnouncements = this.announcements.filter(
      (a) => a.agentPubkey === this.identity.pubkey
    );

    for (const announcement of ourAnnouncements) {
      const room = this.marketplace.getRoom(announcement.id);
      if (!room || room.status !== 'open') continue;

      // Both peers bid with different prices
      for (let i = 0; i < this.peers.length; i++) {
        const peer = this.peers[i]!;
        const basePrice = parseFloat(announcement.priceRange.min);
        const bidPrice = (basePrice + (i + 1) * 0.5).toFixed(2);

        this._schedule(1000 + i * 2000, () => {
          this._mockPeerBid(peer, announcement, bidPrice);
        });
      }
    }
  }

  private _mockPeerBidsOnAnnouncement(announcement: BoardAnnouncement): void {
    for (let i = 0; i < this.peers.length; i++) {
      const peer = this.peers[i]!;
      const basePrice = parseFloat(announcement.priceRange.min);
      const bidPrice = (basePrice + (i + 1) * 0.5).toFixed(2);

      this._schedule(1000 + i * 2000, () => {
        this._mockPeerBid(peer, announcement, bidPrice);
      });
    }
  }

  private _mockPeerBid(peer: MockPeer, announcement: BoardAnnouncement, price: string): void {
    const bid = {
      type: 'bid' as const,
      announcementId: announcement.id,
      bidderPubkey: peer.identity.pubkey,
      bidderName: peer.identity.name,
      price,
      symbol: announcement.priceRange.symbol,
      reason: `${peer.identity.name} can deliver this service efficiently.`,
      timestamp: Date.now(),
    };

    this.marketplace.handleRoomMessage(announcement.id, bid);
    this._emit({
      kind: 'room_message',
      roomId: announcement.id,
      message: bid,
      fromPubkey: peer.identity.pubkey,
    });

    console.error(`[swarm:mock] ${peer.identity.name} bid ${price} ${bid.symbol} on ${announcement.id.slice(0, 8)}`);
  }
}
