/**
 * Channel Manager — Protomux channels over Noise connections.
 *
 * For each peer connection, opens protomux channels:
 * - 'oikos/board' — public announcements + heartbeats
 * - 'oikos/room/{id}' — private negotiation per announcement
 * - 'oikos/feed' — lightweight data (price feeds, signals)
 *
 * Messages are JSON over c.raw encoding (not binary framing).
 * This is pragmatic for hackathon scope — messages are tiny JSON objects.
 *
 * Adapted from rgb-c-t/lib/session.js _setupAckChannel:
 * - Protomux.from(socket) to get/create muxer
 * - mux.createChannel({ protocol, messages: [{ encoding: c.raw, onmessage }] })
 * - channel.open() to initiate
 *
 * Key difference from rgb-c-t: no Hypercore replication, so we use
 * Protomux.from(socket) explicitly (not socket.userData).
 */
import type { BoardMessage, RoomMessage, FeedMessage } from './types.js';
export interface ChannelHandlers {
    onBoardMessage: (msg: BoardMessage, fromPubkey: Buffer) => void;
    onRoomMessage: (roomId: string, msg: RoomMessage, fromPubkey: Buffer) => void;
    onFeedMessage: (msg: FeedMessage, fromPubkey: Buffer) => void;
}
export declare class ChannelManager {
    private handlers;
    private peerChannels;
    constructor(handlers: ChannelHandlers);
    /**
     * Set up channels on a new peer connection.
     * Called by SwarmDiscovery when a peer connects.
     */
    setupPeer(socket: unknown, remotePubkey: Buffer): void;
    /**
     * Open a room channel with a specific peer for private negotiation.
     */
    openRoomChannel(remotePubkey: Buffer, roomId: string): void;
    /**
     * Close a room channel with a specific peer.
     */
    closeRoomChannel(remotePubkey: Buffer, roomId: string): void;
    /** Remove all channels for a disconnected peer */
    removePeer(remotePubkey: Buffer): void;
    /** Send a message on the board channel to a specific peer */
    sendBoard(remotePubkey: Buffer, msg: BoardMessage): boolean;
    /** Send a message on the board channel to ALL peers */
    broadcastBoard(msg: BoardMessage): number;
    /** Send a room message to a specific peer */
    sendRoom(remotePubkey: Buffer, roomId: string, msg: RoomMessage): boolean;
    /** Broadcast a room message to all peers in a room */
    broadcastRoom(roomId: string, msg: RoomMessage): number;
    /** Send a feed message to a specific peer */
    sendFeed(remotePubkey: Buffer, msg: FeedMessage): boolean;
    /** Get all connected peer pubkeys */
    getConnectedPeers(): string[];
    /** Create a protomux channel with JSON message handling */
    private _openChannel;
    /** Send a message on a named channel type */
    private _send;
    /** Parse and dispatch a board message */
    private _handleBoardMessage;
    /** Parse and dispatch a room message */
    private _handleRoomMessage;
    /** Parse and dispatch a feed message */
    private _handleFeedMessage;
}
//# sourceMappingURL=channels.d.ts.map