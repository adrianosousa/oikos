/**
 * Pricing Service — Real-time market prices via WDK Bitfinex pricing.
 *
 * Provides USD valuations for all portfolio assets.
 * Uses PricingProvider for 1-hour TTL caching.
 * Falls back to hardcoded estimates if Bitfinex is unreachable.
 */
/** Token symbol to Bitfinex trading pair mapping */
const BITFINEX_PAIRS = {
    BTC: { from: 'BTC', to: 'USD' },
    ETH: { from: 'ETH', to: 'USD' },
    USDT: { from: 'UST', to: 'USD' },
    XAUT: { from: 'XAUT', to: 'USD' },
};
/** Fallback prices when Bitfinex is unreachable */
const FALLBACK_PRICES = {
    USDT: 1.0,
    USAT: 1.0,
    XAUT: 2650,
    BTC: 85000,
    ETH: 3200,
};
/** Token decimals for human-readable conversion */
const DECIMALS = {
    USDT: 6,
    USAT: 6,
    XAUT: 6,
    BTC: 8,
    ETH: 18,
};
export class PricingService {
    provider = null;
    initialized = false;
    cachedPrices = new Map();
    /** Initialize the Bitfinex pricing client with caching */
    async initialize() {
        try {
            const { BitfinexPricingClient } = await import('@tetherto/wdk-pricing-bitfinex-http');
            const { PricingProvider } = await import('@tetherto/wdk-pricing-provider');
            const client = new BitfinexPricingClient();
            this.provider = new PricingProvider({
                client,
                priceCacheDurationMs: 5 * 60 * 1000, // 5-min cache for agent responsiveness
            });
            this.initialized = true;
            console.error('[pricing] Bitfinex pricing client initialized (5-min cache)');
        }
        catch (err) {
            console.error(`[pricing] Failed to initialize Bitfinex client: ${err instanceof Error ? err.message : 'unknown'}`);
            console.error('[pricing] Using fallback prices only');
        }
    }
    /** Get current USD price for a token symbol */
    async getPrice(symbol) {
        const cached = this.cachedPrices.get(symbol);
        if (cached && Date.now() - cached.updatedAt < 60_000) {
            return cached;
        }
        const pair = BITFINEX_PAIRS[symbol];
        if (pair && this.initialized && this.provider) {
            try {
                const typedProvider = this.provider;
                const price = await typedProvider.getLastPrice(pair.from, pair.to);
                if (price > 0) {
                    const asset = { symbol, priceUsd: price, source: 'live', updatedAt: Date.now() };
                    this.cachedPrices.set(symbol, asset);
                    return asset;
                }
            }
            catch {
                // Fall through to fallback
            }
        }
        // Stablecoins and tokens without Bitfinex pairs use fallback
        const fallbackPrice = FALLBACK_PRICES[symbol] ?? 0;
        const asset = { symbol, priceUsd: fallbackPrice, source: 'fallback', updatedAt: Date.now() };
        this.cachedPrices.set(symbol, asset);
        return asset;
    }
    /** Get prices for all known tokens */
    async getAllPrices() {
        const symbols = Object.keys({ ...BITFINEX_PAIRS, ...FALLBACK_PRICES });
        const unique = [...new Set(symbols)];
        return Promise.all(unique.map(s => this.getPrice(s)));
    }
    /** Compute portfolio valuation from raw balance data */
    async valuatePortfolio(balances) {
        const prices = await this.getAllPrices();
        const priceMap = new Map(prices.map(p => [p.symbol, p]));
        let totalUsd = 0;
        const assets = [];
        for (const b of balances) {
            const rawBalance = BigInt(b.balance || '0');
            const dec = DECIMALS[b.symbol] ?? 18;
            const humanBalance = Number(rawBalance) / Math.pow(10, dec);
            const priceUsd = priceMap.get(b.symbol)?.priceUsd ?? 0;
            const valueUsd = humanBalance * priceUsd;
            assets.push({
                symbol: b.symbol,
                balance: b.balance,
                humanBalance,
                priceUsd,
                valueUsd,
                allocation: 0, // computed below
            });
            totalUsd += valueUsd;
        }
        // Compute allocations
        for (const a of assets) {
            a.allocation = totalUsd > 0 ? a.valueUsd / totalUsd : 0;
        }
        return {
            totalUsd,
            assets,
            prices,
            updatedAt: Date.now(),
        };
    }
    /** Get historical prices for a token (max 100 data points) */
    async getHistoricalPrices(symbol, startMs, endMs) {
        const pair = BITFINEX_PAIRS[symbol];
        if (!pair || !this.initialized || !this.provider) {
            return [];
        }
        try {
            const typedProvider = this.provider;
            const now = Date.now();
            return await typedProvider.getHistoricalPrice({
                from: pair.from,
                to: pair.to,
                start: startMs ?? now - 7 * 24 * 60 * 60 * 1000, // default: last 7 days
                end: endMs ?? now,
            });
        }
        catch (err) {
            console.error(`[pricing] Historical prices error for ${symbol}: ${err instanceof Error ? err.message : 'unknown'}`);
            return [];
        }
    }
}
//# sourceMappingURL=client.js.map