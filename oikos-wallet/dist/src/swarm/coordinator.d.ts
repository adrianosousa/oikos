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
import type { SwarmState, SwarmEvent, RoomAccept, SwarmCoordinatorInterface } from './types.js';
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
    /** Directory for persisting coordinator state (announcements). Defaults to cwd. */
    dataDir?: string;
    /** How long a room can stay in negotiating/accepted/executing before auto-cancel (default: 30 min) */
    staleRoomTimeoutMs?: number;
}
export declare class SwarmCoordinator implements SwarmCoordinatorInterface {
    private wallet;
    private config;
    private keypair;
    private identity;
    private discovery;
    private channels;
    private marketplace;
    private eventHandlers;
    private knownPeers;
    private announcements;
    private heartbeatInterval;
    private started;
    constructor(wallet: WalletIPCClient, config: SwarmConfig);
    /** Expose underlying Hyperswarm instance for companion to reuse */
    getHyperswarm(): unknown;
    /** Start the swarm: generate identity, join board, begin heartbeat */
    start(): Promise<void>;
    /** Post an announcement to the board */
    postAnnouncement(opts: {
        category: import('./types.js').AnnouncementCategory;
        title: string;
        description: string;
        priceRange: {
            min: string;
            max: string;
            symbol: string;
        };
        tags?: string[];
    }): string;
    /** Remove own announcement from the board. Only the creator can remove. */
    removeAnnouncement(announcementId: string): boolean;
    /** Deliver task result or file content to a room */
    deliverTaskResult(announcementId: string, result: string, opts?: {
        contentHash?: string;
        contentType?: string;
        filename?: string;
        deliveryMethod?: 'inline' | 'url';
    }): boolean;
    /** Bid on a peer's announcement */
    bidOnAnnouncement(announcementId: string, price: string, symbol: string, reason: string): Promise<void>;
    /** Accept the best bid in a room I created */
    acceptBestBid(announcementId: string): Promise<RoomAccept | undefined>;
    /** Submit payment for an accepted task.
     *  Payment direction: the buyer always pays.
     *  - 'buyer': creator is buying → creator pays bidder
     *  - 'seller'/'auction': creator is selling → bidder pays creator
     *  Either party can call this — the system determines who should pay. */
    submitPayment(announcementId: string): Promise<void>;
    /** Confirm payment (called when we receive payment_confirm as bidder) */
    confirmPayment(announcementId: string, txHash: string): void;
    /** Cancel a negotiation room (creator only) */
    cancelRoom(announcementId: string): boolean;
    /** Explicitly connect to a peer by Noise public key */
    joinPeer(pubkeyHex: string): void;
    /** Stop explicitly connecting to a peer */
    leavePeer(pubkeyHex: string): void;
    /** Get current swarm state (for dashboard) */
    getState(): SwarmState;
    /** Update ERC-8004 on-chain identity after registration (called from main.ts). */
    updateErc8004AgentId(agentId: string): void;
    /** Register event handler */
    onEvent(handler: (event: SwarmEvent) => void): void;
    /** Graceful shutdown */
    stop(): Promise<void>;
    /** Emit an event to all registered handlers */
    private _emit;
    /** Send heartbeat + re-broadcast active announcements to all board peers.
     *  Re-broadcasting ensures late joiners (like the gateway) see our listings. */
    private _sendHeartbeat;
    /** Handle incoming board message */
    private _handleBoardMessage;
    /** Handle incoming room message */
    private _handleRoomMessage;
    /** Handle incoming feed message */
    private _handleFeedMessage;
    private get _announcementsPath();
    private _persistOwnAnnouncements;
    private _loadOwnAnnouncements;
    private _reapStaleRooms;
}
//# sourceMappingURL=coordinator.d.ts.map