/**
 * Event source types — platform-agnostic.
 *
 * Designed to work with any live streaming/content platform.
 * Events are ephemeral — used for real-time reasoning only,
 * never persisted beyond the current reasoning cycle.
 */
/** A single event from any content platform */
export interface StreamEvent {
    /** Unique event ID */
    id: string;
    /** ISO 8601 timestamp */
    timestamp: string;
    /** Event type */
    type: 'chat_message' | 'viewer_count' | 'donation' | 'milestone' | 'engagement_spike' | 'stream_status' | 'swarm';
    /** Platform-agnostic event data */
    data: ChatMessageData | ViewerCountData | DonationData | MilestoneData | EngagementData | StreamStatusData | SwarmEventData;
}
export interface ChatMessageData {
    type: 'chat_message';
    username: string;
    message: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
}
export interface ViewerCountData {
    type: 'viewer_count';
    count: number;
    delta: number;
}
export interface DonationData {
    type: 'donation';
    username: string;
    amount: number;
    currency: string;
    message?: string;
}
export interface MilestoneData {
    type: 'milestone';
    name: string;
    value: number;
    threshold: number;
}
export interface EngagementData {
    type: 'engagement_spike';
    chatRate: number;
    previousChatRate: number;
    multiplier: number;
}
export interface StreamStatusData {
    type: 'stream_status';
    status: 'live' | 'offline' | 'starting' | 'ending';
}
export interface SwarmEventData {
    type: 'swarm';
    kind: string;
    summary: string;
    /** Full event details (roomId, message, fromPubkey, etc.) */
    details?: Record<string, unknown>;
}
/** Interface for event sources */
export interface EventSource {
    /** Start polling/listening for events */
    start(): void;
    /** Stop polling/listening */
    stop(): void;
    /** Register event handler */
    onEvents(handler: (events: StreamEvent[]) => void): void;
}
//# sourceMappingURL=types.d.ts.map