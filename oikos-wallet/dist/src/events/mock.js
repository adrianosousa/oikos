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
function makeEvent(offsetSeconds, type, data) {
    const timestamp = new Date(Date.now() + offsetSeconds * 1000).toISOString();
    return {
        id: `mock-${offsetSeconds}-${type}`,
        timestamp,
        type,
        data,
    };
}
function buildTimeline() {
    return [
        // T+0s: Agent starts
        {
            offsetSeconds: 0,
            events: [
                makeEvent(0, 'agent_status', { type: 'agent_status', status: 'active' }),
                makeEvent(0, 'network_activity', { type: 'network_activity', chain: 'sepolia', txCount: 142, gasPrice: '3.2 gwei' }),
            ],
        },
        // T+5s: Agent checking portfolio
        {
            offsetSeconds: 5,
            events: [
                makeEvent(5, 'agent_message', { type: 'agent_message', agentName: 'oikos-demo-agent', message: 'Checking portfolio balances across chains...', intent: 'info' }),
                makeEvent(5, 'network_activity', { type: 'network_activity', chain: 'bitcoin-testnet', txCount: 8, gasPrice: '12 sat/vB' }),
            ],
        },
        // T+10s: Incoming transfer
        {
            offsetSeconds: 10,
            events: [
                makeEvent(10, 'incoming_transfer', { type: 'incoming_transfer', from: 'AlphaBot', amount: 100, symbol: 'USDT', chain: 'sepolia', txHash: '0xa1b2...c3d4' }),
                makeEvent(10, 'agent_message', { type: 'agent_message', agentName: 'oikos-demo-agent', message: 'Received 100 USDT from AlphaBot (price feed payment).', intent: 'info' }),
            ],
        },
        // T+15s: Market signal
        {
            offsetSeconds: 15,
            events: [
                makeEvent(15, 'market_signal', { type: 'market_signal', signal: 'XAUt price surge', magnitude: 3.2, source: 'bitfinex' }),
                makeEvent(15, 'agent_message', { type: 'agent_message', agentName: 'oikos-demo-agent', message: 'XAUt up 3.2% — evaluating rebalancing opportunity.', intent: 'action' }),
            ],
        },
        // T+20s: Agent reasoning
        {
            offsetSeconds: 20,
            events: [
                makeEvent(20, 'agent_message', { type: 'agent_message', agentName: 'oikos-demo-agent', message: 'Analyzing swap: 50 USDt -> XAUt at current rate. PolicyEngine: within limits.', intent: 'action' }),
            ],
        },
        // T+30s: Portfolio milestone
        {
            offsetSeconds: 30,
            events: [
                makeEvent(30, 'threshold_reached', { type: 'threshold_reached', name: 'portfolio_1k', value: 1047, threshold: 1000 }),
                makeEvent(30, 'agent_message', { type: 'agent_message', agentName: 'oikos-demo-agent', message: 'Portfolio crossed $1,000 USD. Multi-asset allocation: 60% USDt, 25% XAUt, 15% USAt.', intent: 'info' }),
            ],
        },
        // T+40s: Swarm deal settlement
        {
            offsetSeconds: 40,
            events: [
                makeEvent(40, 'incoming_transfer', { type: 'incoming_transfer', from: 'BetaBot', amount: 25, symbol: 'USDT', chain: 'sepolia', txHash: '0xf5e6...a7b8' }),
                makeEvent(40, 'agent_message', { type: 'agent_message', agentName: 'oikos-demo-agent', message: 'Swarm deal settled: received 25 USDT from BetaBot for yield analysis.', intent: 'info' }),
            ],
        },
        // T+50s: Gas spike signal
        {
            offsetSeconds: 50,
            events: [
                makeEvent(50, 'market_signal', { type: 'market_signal', signal: 'ETH gas spike', magnitude: 4.5, source: 'network' }),
                makeEvent(50, 'agent_message', { type: 'agent_message', agentName: 'oikos-demo-agent', message: 'Gas spike detected (4.5x normal). Deferring cross-chain bridge operation.', intent: 'warning' }),
                makeEvent(50, 'network_activity', { type: 'network_activity', chain: 'sepolia', txCount: 287, gasPrice: '14.4 gwei' }),
            ],
        },
        // T+60s: Budget warning
        {
            offsetSeconds: 60,
            events: [
                makeEvent(60, 'agent_message', { type: 'agent_message', agentName: 'oikos-demo-agent', message: 'Daily budget 80% used ($160/$200). Switching to conservative mode.', intent: 'warning' }),
            ],
        },
        // T+75s: Policy enforcement
        {
            offsetSeconds: 75,
            events: [
                makeEvent(75, 'threshold_reached', { type: 'threshold_reached', name: 'session_budget_limit', value: 200, threshold: 200 }),
                makeEvent(75, 'agent_message', { type: 'agent_message', agentName: 'oikos-demo-agent', message: 'Session budget exhausted. PolicyEngine rejected swap proposal. Waiting for next cycle.', intent: 'warning' }),
            ],
        },
        // T+90s: Cycle complete
        {
            offsetSeconds: 90,
            events: [
                makeEvent(90, 'agent_status', { type: 'agent_status', status: 'idle' }),
            ],
        },
    ];
}
export class MockEventSource {
    timeline;
    timelineIndex = 0;
    timer = null;
    handler = null;
    startTime = 0;
    constructor() {
        this.timeline = buildTimeline();
    }
    onEvents(handler) {
        this.handler = handler;
    }
    start() {
        this.startTime = Date.now();
        this.timelineIndex = 0;
        this.scheduleNext();
        console.error('[events] Mock event source started (90-second agent-wallet demo)');
    }
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        console.error('[events] Mock event source stopped');
    }
    scheduleNext() {
        const entry = this.timeline[this.timelineIndex];
        if (!entry) {
            console.error('[events] Mock timeline complete');
            return;
        }
        const elapsed = Date.now() - this.startTime;
        const targetMs = entry.offsetSeconds * 1000;
        const delay = Math.max(0, targetMs - elapsed);
        this.timer = setTimeout(() => {
            if (this.handler) {
                // Update timestamps to real time
                const events = entry.events.map(e => ({
                    ...e,
                    timestamp: new Date().toISOString(),
                }));
                this.handler(events);
            }
            this.timelineIndex++;
            this.scheduleNext();
        }, delay);
    }
}
//# sourceMappingURL=mock.js.map