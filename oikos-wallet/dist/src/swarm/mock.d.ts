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
import type { WalletIPCClient } from '../ipc/client.js';
import type { SwarmState, RoomAccept, SwarmEvent, SwarmCoordinatorInterface, AgentCapability } from './types.js';
export interface MockSwarmConfig {
    agentName: string;
    capabilities: AgentCapability[];
    announcementTtlMs?: number;
}
export declare class MockSwarmCoordinator implements SwarmCoordinatorInterface {
    private wallet;
    private config;
    private marketplace;
    private eventHandlers;
    private timers;
    private peers;
    private announcements;
    private identity;
    private started;
    constructor(wallet: WalletIPCClient, config: MockSwarmConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    getState(): SwarmState;
    onEvent(handler: (event: SwarmEvent) => void): void;
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
    bidOnAnnouncement(announcementId: string, price: string, symbol: string, _reason: string): Promise<void>;
    acceptBestBid(announcementId: string): Promise<RoomAccept | undefined>;
    submitPayment(announcementId: string): Promise<void>;
    confirmPayment(announcementId: string, txHash: string): void;
    cancelRoom(announcementId: string): boolean;
    removeAnnouncement(announcementId: string): boolean;
    private _createMockPeer;
    private _schedule;
    private _emit;
    private _peerConnects;
    private _peerAnnounces;
    private _mockPeersBidOnOurAnnouncements;
    private _mockPeerBidsOnAnnouncement;
    private _mockPeerBid;
}
//# sourceMappingURL=mock.d.ts.map