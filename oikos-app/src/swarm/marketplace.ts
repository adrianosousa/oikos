/**
 * Marketplace — Room-based negotiation and settlement.
 *
 * The meta-marketplace lifecycle:
 * 1. Agent posts BoardAnnouncement (on board channel)
 * 2. Interested agents join a private room
 * 3. Bidders send RoomBid messages
 * 4. Creator evaluates bids and sends RoomAccept
 * 5. Winner delivers result (RoomTaskResult)
 * 6. Creator sends payment (via wallet IPC) and RoomPaymentConfirm
 * 7. Room is settled and destroyed
 *
 * Privacy invariant: all negotiation details stay inside the room.
 * The board only ever sees metadata (category, price range, reputation).
 */

import { randomUUID } from 'crypto';
import type {
  ActiveRoom,
  BoardAnnouncement,
  RoomMessage,
  RoomBid,
  RoomAccept,
  RoomPaymentConfirm,
  SwarmEconomics,
} from './types.js';

export class Marketplace {
  private rooms: Map<string, ActiveRoom> = new Map();
  private economics: SwarmEconomics = {
    totalRevenue: '0',
    totalCosts: '0',
    completedTasks: 0,
    failedTasks: 0,
    sustainabilityScore: 0,
  };

  /** Create a new room from an announcement I posted (creator role) */
  createRoom(announcement: BoardAnnouncement): ActiveRoom {
    const room: ActiveRoom = {
      announcementId: announcement.id,
      announcement,
      role: 'creator',
      status: 'open',
      bids: [],
      createdAt: Date.now(),
    };

    this.rooms.set(announcement.id, room);
    return room;
  }

  /** Join a room for an announcement I want to bid on (bidder role) */
  joinRoom(announcement: BoardAnnouncement): ActiveRoom {
    // If we already have this room (e.g., we posted it), don't overwrite
    const existing = this.rooms.get(announcement.id);
    if (existing) return existing;

    const room: ActiveRoom = {
      announcementId: announcement.id,
      announcement,
      role: 'bidder',
      status: 'negotiating',
      bids: [],
      createdAt: Date.now(),
    };

    this.rooms.set(announcement.id, room);
    return room;
  }

  /** Process an incoming room message */
  handleRoomMessage(roomId: string, msg: RoomMessage): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    switch (msg.type) {
      case 'bid':
        if (room.status === 'open' || room.status === 'negotiating') {
          // Deduplicate: skip if same bidder+price+timestamp already exists
          // (board fallback + room channel may both deliver the same bid)
          const dup = room.bids.find(
            (b) => b.bidderPubkey === msg.bidderPubkey && b.timestamp === msg.timestamp
          );
          if (!dup) {
            room.bids.push(msg);
            room.status = 'negotiating';
          }
        }
        break;

      case 'counter_offer':
        // Counter offers just adjust expectations — no state change
        break;

      case 'accept': {
        // Deduplicate: only process first accept
        if (room.status === 'accepted' || room.status === 'executing' || room.status === 'settled') break;
        const accept = msg as RoomAccept;
        room.status = 'accepted';
        room.agreedPrice = accept.agreedPrice;
        room.agreedSymbol = accept.agreedSymbol;
        // Store payment address from accept message (creator's wallet address)
        room.paymentAddress = accept.paymentAddress;
        room.paymentChain = accept.paymentChain;

        // Find the accepted bid
        room.acceptedBid = room.bids.find(
          (b) => b.bidderPubkey === accept.acceptedBidderPubkey
        );
        break;
      }

      case 'reject':
        // Informational — losing bidders receive this
        break;

      case 'task_result':
        if (room.status === 'accepted') {
          room.status = 'executing';
        }
        break;

      case 'payment_request':
        // Seller is requesting payment — triggers coordinator to submit
        break;

      case 'payment_confirm': {
        const confirm = msg as RoomPaymentConfirm;
        room.paymentTxHash = confirm.txHash;
        room.status = 'settled';
        this._updateEconomics(room);
        break;
      }
    }
  }

  /** Get the best bid for a room (lowest price) */
  getBestBid(roomId: string): RoomBid | undefined {
    const room = this.rooms.get(roomId);
    if (!room || room.bids.length === 0) return undefined;

    return room.bids.reduce((best, bid) => {
      const bestPrice = parseFloat(best.price);
      const bidPrice = parseFloat(bid.price);
      return bidPrice < bestPrice ? bid : best;
    });
  }

  /** Accept a bid in a room I created */
  acceptBid(
    roomId: string,
    bidderPubkey: string,
    paymentAddress: string,
    paymentChain: string
  ): RoomAccept | undefined {
    const room = this.rooms.get(roomId);
    if (!room || room.role !== 'creator') return undefined;

    const bid = room.bids.find((b) => b.bidderPubkey === bidderPubkey);
    if (!bid) return undefined;

    const accept: RoomAccept = {
      type: 'accept',
      announcementId: roomId,
      acceptedBidderPubkey: bidderPubkey,
      agreedPrice: bid.price,
      agreedSymbol: bid.symbol,
      paymentAddress,
      paymentChain,
      timestamp: Date.now(),
    };

    // Update room state
    room.status = 'accepted';
    room.acceptedBid = bid;
    room.agreedPrice = bid.price;
    room.agreedSymbol = bid.symbol;

    return accept;
  }

  /** Mark a room as settled after payment confirmation */
  settleRoom(roomId: string, txHash: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.paymentTxHash = txHash;
    room.status = 'settled';
    this._updateEconomics(room);
  }

  /** Cancel a room explicitly (creator decides to close it) */
  cancelRoom(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.status === 'settled' || room.status === 'cancelled') return false;

    const wasActive = room.status === 'accepted' || room.status === 'executing';
    room.status = 'cancelled';
    if (wasActive) {
      this.economics.failedTasks++;
    }
    return true;
  }

  /** Get a specific room */
  getRoom(roomId: string): ActiveRoom | undefined {
    return this.rooms.get(roomId);
  }

  /** Get all rooms */
  getRooms(): ActiveRoom[] {
    return Array.from(this.rooms.values());
  }

  /** Get active (non-settled, non-cancelled) rooms */
  getActiveRooms(): ActiveRoom[] {
    return this.getRooms().filter(
      (r) => r.status !== 'settled' && r.status !== 'cancelled'
    );
  }

  /** Get economics state */
  getEconomics(): SwarmEconomics {
    return { ...this.economics };
  }

  /** Generate a unique announcement ID */
  static generateAnnouncementId(): string {
    return randomUUID();
  }

  // ── Private ──

  /**
   * Update economics after a room settles.
   * Payment direction depends on announcement category:
   * - 'request': creator pays bidder → creator has cost, bidder has revenue
   * - 'offer'/'service'/'auction': bidder pays creator → creator has revenue, bidder has cost
   */
  private _updateEconomics(room: ActiveRoom): void {
    if (!room.agreedPrice) return;

    const amount = parseFloat(room.agreedPrice);
    if (isNaN(amount)) return;

    const category = room.announcement.category;
    const creatorPays = category === 'request';

    // Determine if WE paid or received based on our role + category
    const wePaid = (room.role === 'creator' && creatorPays)
                || (room.role === 'bidder' && !creatorPays);

    if (wePaid) {
      const current = parseFloat(this.economics.totalCosts);
      this.economics.totalCosts = (current + amount).toString();
    } else {
      const current = parseFloat(this.economics.totalRevenue);
      this.economics.totalRevenue = (current + amount).toString();
    }

    this.economics.completedTasks++;

    // Sustainability = revenue / costs (> 1.0 = self-sustaining)
    const rev = parseFloat(this.economics.totalRevenue);
    const cost = parseFloat(this.economics.totalCosts);
    this.economics.sustainabilityScore = cost > 0 ? rev / cost : rev > 0 ? Infinity : 0;
  }
}
