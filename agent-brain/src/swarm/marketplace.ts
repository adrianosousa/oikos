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
  createRoom(announcement: BoardAnnouncement, timeoutMs: number = 60000): ActiveRoom {
    const room: ActiveRoom = {
      announcementId: announcement.id,
      announcement,
      role: 'creator',
      status: 'open',
      bids: [],
      createdAt: Date.now(),
      timeoutMs,
    };

    this.rooms.set(announcement.id, room);
    return room;
  }

  /** Join a room for an announcement I want to bid on (bidder role) */
  joinRoom(announcement: BoardAnnouncement, timeoutMs: number = 60000): ActiveRoom {
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
      timeoutMs,
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
          room.bids.push(msg);
          room.status = 'negotiating';
        }
        break;

      case 'counter_offer':
        // Counter offers just adjust expectations — no state change
        break;

      case 'accept': {
        const accept = msg as RoomAccept;
        room.status = 'accepted';
        room.agreedPrice = accept.agreedPrice;
        room.agreedSymbol = accept.agreedSymbol;

        // Find the accepted bid
        room.acceptedBid = room.bids.find(
          (b) => b.bidderPubkey === accept.acceptedBidderPubkey
        );
        break;
      }

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

  /** Check and expire timed-out rooms */
  expireStaleRooms(): string[] {
    const now = Date.now();
    const expired: string[] = [];

    for (const [id, room] of this.rooms) {
      if (
        room.status !== 'settled' &&
        room.status !== 'expired' &&
        now - room.createdAt > room.timeoutMs
      ) {
        const wasActive = room.status === 'accepted' || room.status === 'executing';
        room.status = 'expired';
        expired.push(id);
        if (wasActive) {
          this.economics.failedTasks++;
        }
      }
    }

    return expired;
  }

  /** Get a specific room */
  getRoom(roomId: string): ActiveRoom | undefined {
    return this.rooms.get(roomId);
  }

  /** Get all rooms */
  getRooms(): ActiveRoom[] {
    return Array.from(this.rooms.values());
  }

  /** Get active (non-settled, non-expired) rooms */
  getActiveRooms(): ActiveRoom[] {
    return this.getRooms().filter(
      (r) => r.status !== 'settled' && r.status !== 'expired'
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

  /** Update economics after a room settles */
  private _updateEconomics(room: ActiveRoom): void {
    if (!room.agreedPrice) return;

    const amount = parseFloat(room.agreedPrice);
    if (isNaN(amount)) return;

    if (room.role === 'creator') {
      // We paid for a service
      const current = parseFloat(this.economics.totalCosts);
      this.economics.totalCosts = (current + amount).toString();
    } else if (room.role === 'bidder') {
      // We earned revenue
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
