# WDK Indexer API — Oikos Policy Engine Skill

## Overview

The **WDK Indexer API** (`https://wdk-api.tether.io/api/v1/`) is Tether's blockchain indexer service. It provides fast REST access to on-chain balances, token transfers, and transaction history across multiple chains.

Use this when you need to:
- Verify on-chain balances independently (cross-check wallet state)
- Look up transfer history for an address
- Check if a payment was received on-chain
- Audit cross-chain portfolio positions
- Verify counterparty balances before large swarm deals

## Authentication

All requests require an API key header:
```
x-api-key: your-api-key-here
```

Configure via `WDK_INDEXER_API_KEY` environment variable.

## Base URL

```
https://wdk-api.tether.io/api/v1/
```

## Endpoints

### Health Check
```
GET /api/v1/health
Rate limit: 10 req/hour
```

### Token Balances (single address)
```
GET /api/v1/{blockchain}/{token}/{address}/token-balances
Rate limit: 4 req/10s
```

**Path parameters:**
- `blockchain`: `ethereum`, `arbitrum`, `polygon`, `bitcoin`, `tron`, `ton`, `avalanche`, `optimism`, `base`
- `token`: `usdt`, `xaut`, `usat`, `btc`, `eth` (lowercase)
- `address`: wallet address on that chain

**Example:**
```
GET /api/v1/ethereum/usdt/0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18/token-balances
→ { tokenBalance: { amount: "100000000", token: "USDT" } }
```

### Token Transfers (single address)
```
GET /api/v1/{blockchain}/{token}/{address}/token-transfers
Rate limit: 8 req/10s
```

Returns historical transfers (sends + receives) for a specific address and token on a given chain.

### Batch Token Balances
```
POST /api/v1/batch/token-balances
Rate limit: 4 req/10s
Body: { queries: [{ blockchain, token, address }] }
```

Query multiple address/token/chain combinations in one call. Use for full portfolio verification.

### Batch Token Transfers
```
POST /api/v1/batch/token-transfers
Rate limit: 8 req/10s
Body: { queries: [{ blockchain, token, address }] }
```

## Supported Networks & Tokens

| Blockchain | Tokens | Address Format |
|-----------|--------|----------------|
| `ethereum` | usdt, xaut, usat, eth | 0x... (EVM) |
| `arbitrum` | usdt, xaut, usat, eth | 0x... (EVM, same address) |
| `polygon` | usdt, xaut, usat, eth | 0x... (EVM, same address) |
| `bitcoin` | btc | bc1.../tb1... (bech32) |
| `tron` | usdt | T... (base58check) |
| `ton` | usdt | UQ... (TON format) |
| `avalanche` | usdt | 0x... (EVM) |
| `optimism` | usdt | 0x... (EVM) |
| `base` | usdt | 0x... (EVM) |

## Error Handling

| Code | Meaning |
|------|---------|
| 400 | Bad request — check path parameters |
| 401 | Invalid or missing API key |
| 404 | Address/chain/token not found |
| 429 | Rate limited — back off |
| 500 | Server error — retry later |

## Use Cases for Oikos Agent

### 1. Verify Payment Received
After a swarm deal settles, verify the payment arrived on-chain:
```
GET /api/v1/ethereum/usdt/{your-address}/token-transfers
→ Check for incoming transfer matching the deal amount + txHash
```

### 2. Cross-Check Portfolio
Independent verification of wallet balances (don't just trust local state):
```
POST /api/v1/batch/token-balances
Body: { queries: [
  { blockchain: "ethereum", token: "usdt", address: "0x..." },
  { blockchain: "ethereum", token: "xaut", address: "0x..." },
  { blockchain: "arbitrum", token: "usdt", address: "0x..." },
  { blockchain: "bitcoin", token: "btc", address: "tb1..." }
]}
```

### 3. Counterparty Due Diligence
Before accepting a large swarm bid, check if the counterparty actually has the funds:
```
GET /api/v1/ethereum/usdt/{counterparty-address}/token-balances
```

### 4. Transfer History Audit
Export transaction history for accounting or compliance:
```
GET /api/v1/ethereum/usdt/{address}/token-transfers
```

## Rate Limit Strategy

- Balance queries: max 4 per 10 seconds
- Transfer queries: max 8 per 10 seconds
- Health check: max 10 per hour
- For batch operations: use the POST batch endpoints instead of multiple individual GETs
- Cache results locally for 30-60 seconds to avoid rate limiting

## Integration with Oikos

The Indexer API complements the wallet's local balance tracking:
- **Local balances** (`wallet_balance_all`): instant, from WDK wallet state
- **Indexer balances** (`indexer API`): on-chain verification, independent source

Use local for speed, indexer for verification. Especially useful after bridges (verify funds arrived on destination chain) and after swarm payments (verify on-chain settlement).
