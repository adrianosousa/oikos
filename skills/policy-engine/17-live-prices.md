# Live Market Prices — Oikos Policy Engine Skill

## Overview

The Oikos agent receives **live market prices** injected into every LLM context call. Prices are sourced from the Bitfinex API via the wallet's PricingService and refreshed every 10 seconds.

## How It Works

The brain adapter (`adapter.ts`) builds a context string injected into every system prompt:

```
Prices: BTC=$73,928, ETH=$2,310, XAUT=$4,950, USDT=$1.00, USAT=$1.00
```

This means:
- The agent ALWAYS has access to current prices
- No tool call needed for price checks — prices are in the context
- Prices update every 10 seconds (Bitfinex feed with 5-min cache)
- The agent should USE these prices for calculations, never say "I don't have real-time data"

## Supported Assets (Bitfinex Feed)

| Symbol | Name | Bitfinex Pair |
|--------|------|---------------|
| BTC | Bitcoin | tBTCUSD |
| ETH | Ethereum | tETHUSD |
| XAUT | Tether Gold | tXAUTUSD |
| USDT | Tether USD | tUSTUSD |
| USAT | Tether US | Fallback $1.00 |
| SOL | Solana | tSOLUSD |
| XRP | Ripple | tXRPUSD |
| ADA | Cardano | tADAUSD |
| DOGE | Dogecoin | tDOGEUSD |
| DOT | Polkadot | tDOTUSD |
| AVAX | Avalanche | tAVAXUSD |
| LINK | Chainlink | tLINKUSD |
| LTC | Litecoin | tLTCUSD |
| UNI | Uniswap | tUNIUSD |
| AAVE | Aave | tAAVEUSD |
| NEAR | NEAR | tNEARUSD |
| ARB | Arbitrum | tARBUSD |
| TON | Toncoin | tTONUSD |
| TRX | TRON | tTRXUSD |
| SUI | Sui | tSUIUSD |
| APT | Aptos | tAPTUSD |

## Agent Behavior Rules

1. **Never say "I don't have access to live prices"** — you do, they're in your context
2. **Use prices for calculations**: swap estimates, portfolio value, rebalancing math
3. **Mention the source**: "at current price of $X (Bitfinex)" for transparency
4. **Cross-asset conversions**: "1 BTC = X XAUT" using both prices
5. **Portfolio valuation**: multiply each holding by its current price
6. **Scenario modeling**: "if ETH reaches $X, your portfolio would be worth..."

## Price Freshness

- **Live** (source: "live"): Fetched from Bitfinex within last 5 minutes
- **Fallback** (source: "fallback"): Hardcoded defaults when Bitfinex is unreachable
  - USDT: $1.00, USAT: $1.00, XAUT: $2,400, BTC: $60,000, ETH: $3,000

The Pear app's Wealth tab shows a green pulsing dot next to "by Bitfinex" when prices are live.

## API Endpoints

The wallet dashboard exposes prices via REST:

```
GET /api/prices
→ { prices: [{ symbol, priceUsd, source, updatedAt }] }

GET /api/valuation
→ { totalUsd, assets: [{ symbol, chain, humanBalance, usdValue }] }
```

These are used by both the Pear app and the brain's context builder.
