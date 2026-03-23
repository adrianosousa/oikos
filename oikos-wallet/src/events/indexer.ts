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

import type { EventSource, StreamEvent, IncomingTransferData } from './types.js';

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

/** Raw transfer from the Indexer API */
interface IndexerTransfer {
  txHash?: string;
  hash?: string;
  from?: string;
  to?: string;
  amount?: string;
  value?: string;
  token?: string;
  timestamp?: number;
  blockNumber?: number;
}

/** Chain+token combinations to poll */
const MONITOR_PAIRS: Array<{ chain: string; token: string; symbol: string }> = [
  { chain: 'sepolia', token: 'usdt', symbol: 'USDT' },
  { chain: 'ethereum', token: 'usdt', symbol: 'USDT' },
  { chain: 'ethereum', token: 'xaut', symbol: 'XAUT' },
  { chain: 'ethereum', token: 'usat', symbol: 'USAT' },
];

export class IndexerEventSource implements EventSource {
  private config: IndexerConfig;
  private baseUrl: string;
  private handler: ((events: StreamEvent[]) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private seenTxHashes: Set<string> = new Set();
  private pollIntervalMs: number;

  constructor(config: IndexerConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'https://wdk-api.tether.io/api/v1';
    this.pollIntervalMs = config.pollIntervalMs ?? 15000;
  }

  onEvents(handler: (events: StreamEvent[]) => void): void {
    this.handler = handler;
  }

  start(): void {
    console.error(`[indexer] Starting live event source (poll: ${this.pollIntervalMs}ms)`);
    console.error(`[indexer] Monitoring addresses: ${JSON.stringify(this.config.addresses)}`);

    // Initial poll after a short delay
    setTimeout(() => { void this.poll(); }, 2000);

    // Recurring poll
    this.timer = setInterval(() => { void this.poll(); }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.error('[indexer] Stopped');
  }

  /** Poll all monitored chain/token pairs for new transfers */
  private async poll(): Promise<void> {
    const allEvents: StreamEvent[] = [];

    for (const pair of MONITOR_PAIRS) {
      const address = this.config.addresses[pair.chain] ?? this.config.addresses['ethereum'];
      if (!address) continue;

      try {
        const transfers = await this.fetchTransfers(pair.chain, pair.token, address);
        const events = this.convertTransfers(transfers, pair.symbol, pair.chain, address);
        allEvents.push(...events);
      } catch (err) {
        // Don't spam logs — indexer may rate-limit us
        if (err instanceof Error && !err.message.includes('429')) {
          console.error(`[indexer] Poll error for ${pair.chain}/${pair.token}: ${err.message}`);
        }
      }
    }

    if (allEvents.length > 0 && this.handler) {
      console.error(`[indexer] ${allEvents.length} new transfer(s) detected`);
      this.handler(allEvents);
    }
  }

  /** Fetch token transfers from the Indexer API */
  private async fetchTransfers(chain: string, token: string, address: string): Promise<IndexerTransfer[]> {
    const url = `${this.baseUrl}/${chain}/${token}/${address}/token-transfers`;

    const response = await fetch(url, {
      headers: {
        'x-api-key': this.config.apiKey,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Indexer API ${response.status}: ${response.statusText}`);
    }

    const data: unknown = await response.json();

    // Handle various response shapes
    if (Array.isArray(data)) return data as IndexerTransfer[];
    if (data && typeof data === 'object' && 'transfers' in data) {
      return (data as { transfers: IndexerTransfer[] }).transfers;
    }
    if (data && typeof data === 'object' && 'tokenTransfers' in data) {
      return (data as { tokenTransfers: IndexerTransfer[] }).tokenTransfers;
    }
    return [];
  }

  /** Convert raw indexer transfers to StreamEvents, filtering out already-seen */
  private convertTransfers(
    transfers: IndexerTransfer[],
    symbol: string,
    chain: string,
    ourAddress: string,
  ): StreamEvent[] {
    const events: StreamEvent[] = [];

    for (const tx of transfers) {
      const hash = tx.txHash ?? tx.hash ?? '';
      if (!hash || this.seenTxHashes.has(hash)) continue;
      this.seenTxHashes.add(hash);

      // Keep seen set bounded (last 1000 txs)
      if (this.seenTxHashes.size > 1000) {
        const first = this.seenTxHashes.values().next().value;
        if (first) this.seenTxHashes.delete(first);
      }

      const to = (tx.to ?? '').toLowerCase();
      const from = (tx.from ?? '').toLowerCase();
      const isIncoming = to === ourAddress.toLowerCase();

      // Only emit events for incoming transfers
      if (!isIncoming) continue;

      const amount = tx.amount ?? tx.value ?? '0';
      const data: IncomingTransferData = {
        type: 'incoming_transfer',
        from: from.slice(0, 10) + '...',
        amount: parseFloat(amount) || 0,
        symbol,
        chain,
        txHash: hash,
      };

      events.push({
        id: `indexer-${hash}`,
        timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString(),
        type: 'incoming_transfer',
        data,
      });
    }

    return events;
  }
}
