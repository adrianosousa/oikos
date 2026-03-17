/**
 * Indexer Event Source — Live blockchain events via WDK Indexer API.
 *
 * Polls the WDK Indexer API for token transfers to the agent's wallet.
 * Converts on-chain transfers into StreamEvent format for the Brain's
 * reasoning loop.
 *
 * Base URL: https://wdk-api.tether.io/api/v1
 * Auth: x-api-key header
 *
 * Supported chains/tokens:
 *   ethereum: USDT, XAUT, USAT
 *   sepolia: USDT
 *   arbitrum: USDT
 *   polygon: USDT
 *   bitcoin: BTC
 */
import type { EventSource, StreamEvent } from './types.js';
/** Indexer API configuration */
export interface IndexerConfig {
    /** API key for wdk-api.tether.io */
    apiKey: string;
    /** Base URL (default: https://wdk-api.tether.io/api/v1) */
    baseUrl?: string;
    /** Poll interval in ms (default: 15000) */
    pollIntervalMs?: number;
    /** Wallet addresses to monitor: { chain: address } */
    addresses: Record<string, string>;
}
export declare class IndexerEventSource implements EventSource {
    private config;
    private baseUrl;
    private handler;
    private timer;
    private seenTxHashes;
    private pollIntervalMs;
    constructor(config: IndexerConfig);
    onEvents(handler: (events: StreamEvent[]) => void): void;
    start(): void;
    stop(): void;
    /** Poll all monitored chain/token pairs for new transfers */
    private poll;
    /** Fetch token transfers from the Indexer API */
    private fetchTransfers;
    /** Convert raw indexer transfers to StreamEvents, filtering out already-seen */
    private convertTransfers;
}
//# sourceMappingURL=indexer.d.ts.map