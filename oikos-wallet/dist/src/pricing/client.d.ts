/**
 * Pricing Service — Real-time market prices via WDK Bitfinex pricing.
 *
 * Provides USD valuations for all portfolio assets.
 * Uses PricingProvider for 1-hour TTL caching.
 * Falls back to hardcoded estimates if Bitfinex is unreachable.
 */
/** Price data for a single asset */
export interface AssetPrice {
    symbol: string;
    priceUsd: number;
    source: 'live' | 'fallback';
    updatedAt: number;
}
/** Portfolio valuation result */
export interface PortfolioValuation {
    totalUsd: number;
    assets: Array<{
        symbol: string;
        balance: string;
        humanBalance: number;
        priceUsd: number;
        valueUsd: number;
        allocation: number;
    }>;
    prices: AssetPrice[];
    updatedAt: number;
}
/** Historical price point */
export interface PricePoint {
    price: number;
    ts: number;
}
export declare class PricingService {
    private provider;
    private initialized;
    private cachedPrices;
    /** Initialize the Bitfinex pricing client with caching */
    initialize(): Promise<void>;
    /** Get current USD price for a token symbol */
    getPrice(symbol: string): Promise<AssetPrice>;
    /** Get prices for all known tokens */
    getAllPrices(): Promise<AssetPrice[]>;
    /** Compute portfolio valuation from raw balance data */
    valuatePortfolio(balances: Array<{
        symbol: string;
        balance: string;
    }>): Promise<PortfolioValuation>;
    /** Get historical prices for a token (max 100 data points) */
    getHistoricalPrices(symbol: string, startMs?: number, endMs?: number): Promise<PricePoint[]>;
}
//# sourceMappingURL=client.d.ts.map