/**
 * Swarm Discovery Manager — Hyperswarm DHT integration.
 *
 * Manages two layers:
 * - Board: single shared topic for public announcements
 * - Rooms: per-announcement topics for private negotiation
 *
 * Adapted from rgb-c-t/lib/session.js:
 * - swarm.join() + discovery.flushed() pattern (lines 160-196)
 * - Firewall function (lines 126-148)
 * - Connection handling (lines 430-470)
 *
 * Key difference: rgb-c-t has 1 session = 1 connection.
 * Oikos has N board peers + M room peers, all tracked.
 */
import Hyperswarm from 'hyperswarm';
import type { AgentKeypair } from './identity.js';
export interface DiscoveryConfig {
    swarmId: string;
    keypair: AgentKeypair;
    /** Injected HyperDHT instance for testnet (optional) */
    dht?: unknown;
    /**
     * Relay peer public key (hex) for connections that can't holepunch.
     * When holepunching fails (Docker containers, restrictive NATs, double-randomized NATs),
     * Hyperswarm automatically relays through this peer.
     * Without this, failed holepunches have NO fallback — connections silently die.
     */
    relayPubkey?: string;
}
export interface PeerConnection {
    socket: unknown;
    remotePubkey: Buffer;
    isBoard: boolean;
    roomId?: string;
}
type ConnectionHandler = (socket: unknown, remotePubkey: Buffer, info: {
    isBoard: boolean;
    roomId?: string;
}) => void;
type DisconnectHandler = (remotePubkey: Buffer) => void;
export declare class SwarmDiscovery {
    private swarm;
    /** Expose Hyperswarm instance for companion to reuse (same UDP socket, same DHT) */
    getSwarmInstance(): Hyperswarm;
    private config;
    private boardTopic;
    private boardDiscovery;
    private roomDiscoveries;
    private peers;
    private connectionHandlers;
    private disconnectHandlers;
    private destroyed;
    constructor(config: DiscoveryConfig);
    /** Join the board topic for public discovery */
    joinBoard(): Promise<void>;
    /** Join a room topic for private negotiation */
    joinRoom(announcementId: string, creatorPubkey: Buffer): Promise<void>;
    /** Leave a room topic */
    leaveRoom(announcementId: string): Promise<void>;
    /** Register connection handler */
    onConnection(handler: ConnectionHandler): void;
    /** Register disconnect handler */
    onDisconnect(handler: DisconnectHandler): void;
    /**
     * Explicitly connect to a peer by Noise public key.
     * Bypasses topic-based DHT discovery — uses DHT routing to find a direct path.
     * Auto-reconnects on failure. Use leavePeer() to stop.
     *
     * Use case: when you learn a peer's pubkey (from a board announcement, config, etc.)
     * and want a guaranteed connection attempt regardless of topic membership.
     */
    joinPeer(pubkeyHex: string): void;
    /** Stop explicitly connecting to a peer. Does NOT close existing connection. */
    leavePeer(pubkeyHex: string): void;
    /** Get all connected peer pubkeys */
    getPeers(): Map<string, PeerConnection>;
    /** Graceful shutdown */
    destroy(): Promise<void>;
    /** Handle new peer connection */
    private _onConnection;
}
export {};
//# sourceMappingURL=discovery.d.ts.map