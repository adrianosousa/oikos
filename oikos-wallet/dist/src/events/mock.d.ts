/**
 * Mock Event Source — 90-second agent-wallet demo.
 *
 * Generates a realistic sequence of wallet events for demo/testing:
 * T+0s:  Agent comes online, checks chains
 * T+10s: Incoming transfer from peer agent
 * T+15s: Market signal — XAUt price surge
 * T+20s: Agent reasons about rebalancing
 * T+30s: Portfolio milestone reached
 * T+40s: Swarm deal settlement payment
 * T+50s: Market signal — gas spike, defer bridge
 * T+60s: Budget warning — 80% daily used
 * T+75s: Policy enforcement — session limit hit
 * T+90s: Cycle complete
 */
import type { EventSource, StreamEvent } from './types.js';
export declare class MockEventSource implements EventSource {
    private timeline;
    private timelineIndex;
    private timer;
    private handler;
    private startTime;
    constructor();
    onEvents(handler: (events: StreamEvent[]) => void): void;
    start(): void;
    stop(): void;
    private scheduleNext;
}
//# sourceMappingURL=mock.d.ts.map