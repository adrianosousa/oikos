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
import type { ActiveRoom, BoardAnnouncement, RoomMessage, RoomBid, RoomAccept, SwarmEconomics } from './types.js';
export declare class Marketplace {
    private rooms;
    private economics;
    /** Create a new room from an announcement I posted (creator role) */
    createRoom(announcement: BoardAnnouncement): ActiveRoom;
    /** Join a room for an announcement I want to bid on (bidder role) */
    joinRoom(announcement: BoardAnnouncement): ActiveRoom;
    /** Process an incoming room message */
    handleRoomMessage(roomId: string, msg: RoomMessage): void;
    /** Get the best bid for a room (lowest price) */
    getBestBid(roomId: string): RoomBid | undefined;
    /** Accept a bid in a room I created */
    acceptBid(roomId: string, bidderPubkey: string, paymentAddress: string, paymentChain: string): RoomAccept | undefined;
    /** Mark a room as settled after payment confirmation */
    settleRoom(roomId: string, txHash: string): void;
    /** Cancel a room explicitly (creator decides to close it) */
    cancelRoom(roomId: string): boolean;
    /** Get a specific room */
    getRoom(roomId: string): ActiveRoom | undefined;
    /** Get all rooms */
    getRooms(): ActiveRoom[];
    /** Get active (non-settled, non-cancelled) rooms */
    getActiveRooms(): ActiveRoom[];
    /** Get economics state */
    getEconomics(): SwarmEconomics;
    /** Generate a unique announcement ID */
    static generateAnnouncementId(): string;
    /**
     * Update economics after a room settles.
     * The buyer always pays.
     * - 'buyer': creator is buying → creator pays bidder
     * - 'seller'/'auction': creator is selling → bidder (buyer) pays creator
     */
    private _updateEconomics;
}
//# sourceMappingURL=marketplace.d.ts.map