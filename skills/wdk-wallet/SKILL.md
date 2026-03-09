---
name: wdk-wallet
description: Process-isolated, multi-chain, multi-asset crypto wallet with policy-enforced spending limits. Supports USDt, XAUt, USAt, BTC, ETH. Handles payments, swaps, bridges, yield, and on-chain reputation.
version: 0.2.0
author: Oikos Protocol
tags:
  - wallet
  - crypto
  - payments
  - wdk
  - tether
  - defi
  - multi-chain
  - multi-asset
  - swarm
  - reputation
requires:
  - process-isolation
---

# WDK Wallet Skill

You have access to a self-custodial cryptocurrency wallet powered by Tether's WDK (Wallet Development Kit). The wallet runs in a **separate isolated process** with its own policy engine — even if you are compromised, the wallet enforces constraints independently.

## Supported Assets

| Symbol | Name | Type | Chains |
|--------|------|------|--------|
| USDT | Tether USD | ERC-20 stablecoin | Ethereum, Polygon, Arbitrum |
| XAUT | Tether Gold | ERC-20 gold-backed | Ethereum |
| USAT | Tether US | ERC-20 regulated stable | Ethereum |
| BTC | Bitcoin | Native | Bitcoin |
| ETH | Ethereum | Native | Ethereum |

## Capabilities

### 1. Propose Payments

Send tokens to a recipient address. All payments go through the PolicyEngine before execution.

```json
{
  "type": "payment",
  "amount": "2000000",
  "symbol": "USDT",
  "chain": "ethereum",
  "to": "0xRecipientAddress",
  "reason": "Payment for data feed service",
  "confidence": 0.85,
  "strategy": "direct-payment"
}
```

### 2. Propose Swaps

Trade between token pairs (e.g., USDt to XAUt for portfolio rebalancing).

```json
{
  "type": "swap",
  "amount": "5000000",
  "symbol": "USDT",
  "toSymbol": "XAUT",
  "chain": "ethereum",
  "reason": "Rebalance: USDT overweight, XAUT underweight",
  "confidence": 0.80,
  "strategy": "portfolio-rebalance"
}
```

### 3. Propose Bridges

Move tokens cross-chain (e.g., Ethereum to Arbitrum for lower gas).

```json
{
  "type": "bridge",
  "amount": "10000000",
  "symbol": "USDT",
  "chain": "ethereum",
  "fromChain": "ethereum",
  "toChain": "arbitrum",
  "reason": "Move to Arbitrum for lower gas fees",
  "confidence": 0.90,
  "strategy": "gas-optimization"
}
```

### 4. Propose Yield Operations

Deposit idle assets in lending protocols, or withdraw from yield positions.

```json
{
  "type": "yield",
  "amount": "5000000",
  "symbol": "USDT",
  "chain": "ethereum",
  "protocol": "aave-v3",
  "action": "deposit",
  "reason": "Deposit idle USDT for yield",
  "confidence": 0.75,
  "strategy": "yield-optimization"
}
```

### 5. Query Balances

Check available funds across all chains and assets.

- `query_balance(chain, symbol)` — single asset balance
- `query_balance_all()` — all balances across all chains

Returns: `{ chain, symbol, balance (smallest unit), formatted (human-readable) }`

### 6. Query Addresses

Get wallet addresses for receiving funds on any supported chain.

### 7. Query Policies

Check current policy status: remaining budgets, cooldown timers, confidence thresholds.

### 8. Query Audit Log

Review past transactions and decisions. Each entry includes: proposal, policy evaluation, execution result, timestamp.

### 9. ERC-8004 On-Chain Identity

If enabled (`ERC8004_ENABLED=true`), the agent has an on-chain identity:

- `register_identity(agentURI)` — Mint ERC-721 identity NFT
- `set_agent_wallet(agentId, deadline)` — Link wallet to on-chain identity
- `query_reputation(agentId)` — Get on-chain feedback count and total score
- `propose_feedback(targetAgentId, value, tags)` — Submit peer reputation (goes through PolicyEngine)

### 10. Swarm Trading

When connected to the Oikos agent swarm:

- **Post announcements** — List services, auctions, or requests on the public board
- **Bid on peer offers** — Enter private negotiation rooms
- **Settle payments** — All swarm payments go through PolicyEngine
- **Track economics** — Revenue, costs, sustainability score

## What You CANNOT Do

- Modify wallet policies (they are immutable for the process lifetime)
- Access private keys or seed phrases (they exist only in the wallet isolate)
- Bypass spending limits or cooldowns
- Send funds without policy approval
- Retry failed transactions (submit a new proposal instead)

## Decision Output Format

When you decide to take a financial action, produce this JSON:

```json
{
  "shouldPay": true,
  "reason": "Short explanation of why",
  "confidence": 0.85,
  "amount": "2000000",
  "symbol": "USDT",
  "chain": "ethereum",
  "to": "0x...",
  "strategy": "strategy-name",
  "operationType": "payment",
  "reasoning": "Full chain of thought..."
}
```

**Fields:**
- `shouldPay` — boolean, whether to propose any financial action
- `confidence` — 0.0 to 1.0, your certainty (policy may reject low confidence)
- `amount` — string, amount in smallest unit (1 USDT = "1000000", 6 decimals)
- `symbol` — "USDT" | "XAUT" | "USAT" | "BTC" | "ETH"
- `chain` — "ethereum" | "polygon" | "bitcoin" | "arbitrum"
- `operationType` — "payment" | "swap" | "bridge" | "yield"
- `toSymbol` — for swaps, the target token
- `fromChain` / `toChain` — for bridges
- `protocol` / `action` — for yield operations

## Policy Rules

Your proposals are checked against these rule types:

| Rule | Description |
|------|-------------|
| `max_per_tx` | Maximum amount per single transaction |
| `max_per_session` | Total spending limit for the session |
| `max_per_day` | Daily spending cap |
| `cooldown_seconds` | Minimum time between transactions |
| `require_confidence` | Minimum confidence score required |
| `whitelist_recipients` | Only approved recipient addresses |

If **any** rule is violated, the proposal is rejected and no funds move. You will receive the violation list in the response and can adjust your next proposal accordingly.

## Security Model

- **Process isolation**: Wallet runs in a separate Bare Runtime process. No shared memory or files.
- **Structured IPC**: Communication is via typed JSON-lines over stdin/stdout. No raw access.
- **Append-only audit**: Every proposal (approved, rejected, or malformed) is permanently recorded.
- **Fail closed**: Any ambiguity = no funds move.
- **Deterministic policy**: Same proposal + same state = same decision. No randomness.
