# Oikos Protocol -- Payment Policy Reference

Declarative, deterministic spending controls for autonomous agent wallets.
Policies are loaded at startup and immutable for the lifetime of the process.

## Overview

The PolicyEngine evaluates every proposal against all loaded rules before any funds move.
If ANY rule in ANY policy is violated, the proposal is rejected. Rules apply to ALL proposal
types: payment, swap, bridge, yield, and feedback.

All amounts are in the token's smallest unit as strings (BigInt serialization).
For ERC-20 tokens with 6 decimals: 1 USDT = `"1000000"`, 5 USDT = `"5000000"`.

## Rule Types

### `max_per_tx`

Maximum amount allowed in a single transaction, scoped by token symbol.

```json
{ "type": "max_per_tx", "amount": "5000000", "symbol": "USDT" }
```

**Behavior:** Rejects any proposal where `proposal.amount > rule.amount` for the matching symbol.
Only evaluated when `proposal.symbol === rule.symbol`.

### `max_per_session`

Cumulative spending limit for the entire session (process lifetime), scoped by token symbol.

```json
{ "type": "max_per_session", "amount": "20000000", "symbol": "USDT" }
```

**Behavior:** Tracks total spent per symbol across all executed proposals. Rejects if
`sessionTotal + proposal.amount > rule.amount`. Resets only when the Wallet Isolate restarts.

### `max_per_day`

Daily spending cap, scoped by token symbol. Resets at midnight UTC.

```json
{ "type": "max_per_day", "amount": "50000000", "symbol": "USDT" }
```

**Behavior:** Tracks daily total per symbol. Rejects if `dayTotal + proposal.amount > rule.amount`.
Day boundary detection uses ISO date comparison (YYYY-MM-DD). Totals reset when the day rolls over.

### `max_per_recipient_per_day`

Daily spending cap per counterparty, scoped by token symbol.

```json
{ "type": "max_per_recipient_per_day", "amount": "10000000", "symbol": "USDT" }
```

**Behavior:** Tracks daily spending per counterparty per symbol. The counterparty is:
- For payments: the `to` address.
- For yield: the `protocol` name.
- For swaps/bridges: not applicable (rule is skipped -- no specific counterparty).

### `cooldown_seconds`

Minimum time between consecutive executed transactions. Applies to all symbols.

```json
{ "type": "cooldown_seconds", "seconds": 30 }
```

**Behavior:** Rejects if `elapsed < rule.seconds` since the last successful execution.
The timer starts at 0 (first transaction is always allowed). Only successful executions
reset the timer.

### `require_confidence`

Minimum LLM confidence score required for approval. Applies to all symbols.

```json
{ "type": "require_confidence", "min": 0.7 }
```

**Behavior:** Rejects if `proposal.confidence < rule.min`. Confidence is a 0.0-1.0 float
set by the LLM or the proposal source (MCP, companion, x402). Forces the agent to express
meaningful certainty before spending.

### `whitelist_recipients`

Restrict transfers to approved addresses only. Applies to all symbols.

```json
{ "type": "whitelist_recipients", "addresses": ["0xabc...", "0xdef..."] }
```

**Behavior:** Rejects if the counterparty is not in the whitelist. Address comparison is
case-insensitive. Only applies to proposals with a counterparty (payments, yield).
Swaps and bridges have no counterparty and skip this rule.

### `time_window`

Restrict transactions to specific hours. Applies to all symbols.

```json
{ "type": "time_window", "start_hour": 8, "end_hour": 22, "timezone": "UTC" }
```

**Behavior:** Rejects if the current hour (in the specified timezone) falls outside the window.
Supports both normal windows (8-22 = daytime) and overnight windows (22-8 = nighttime).
If the timezone string is invalid, the engine returns hour -1, which fails closed against
most windows.

## Multi-Asset Scoping

Amount-based rules (`max_per_tx`, `max_per_session`, `max_per_day`, `max_per_recipient_per_day`)
are scoped by token symbol. Each asset has independent spending limits:

```json
{ "type": "max_per_tx", "amount": "5000000", "symbol": "USDT" },
{ "type": "max_per_tx", "amount": "500000", "symbol": "XAUT" },
{ "type": "max_per_tx", "amount": "5000000", "symbol": "USAT" }
```

Cross-asset rules (`cooldown_seconds`, `require_confidence`, `time_window`, `whitelist_recipients`)
apply to ALL operations regardless of asset.

## Presets

### Conservative (production)

Low limits, strict confidence, 60-second cooldown, daytime-only.

| Rule | USDT | XAUT | USAT |
|------|------|------|------|
| max_per_tx | 2 | 0.2 | 2 |
| max_per_session | 10 | 1 | 10 |

Plus: `cooldown_seconds: 60`, `require_confidence: 0.8`, `time_window: 08-22 UTC`.

### Moderate (everyday)

Balanced limits, moderate confidence, 30-second cooldown, no time restriction.

| Rule | USDT | XAUT | USAT |
|------|------|------|------|
| max_per_tx | 5 | 0.5 | 5 |
| max_per_session | 25 | 2 | 15 |
| max_per_day | 50 | -- | -- |

Plus: `cooldown_seconds: 30`, `require_confidence: 0.65`.

### Demo (5-minute showcase)

Low limits so the agent hits them quickly during a hackathon demo.

| Rule | USDT | XAUT | USAT |
|------|------|------|------|
| max_per_tx | 5 | 0.5 | 5 |
| max_per_session | 15 | 2 | 15 |
| max_per_day | 50 | -- | -- |

Plus: `cooldown_seconds: 15`, `require_confidence: 0.6`.

## Example policies.json

```json
{
  "policies": [
    {
      "id": "production-agent",
      "name": "Production Agent Policy",
      "rules": [
        { "type": "max_per_tx", "amount": "5000000", "symbol": "USDT" },
        { "type": "max_per_tx", "amount": "500000", "symbol": "XAUT" },
        { "type": "max_per_tx", "amount": "5000000", "symbol": "USAT" },
        { "type": "max_per_session", "amount": "20000000", "symbol": "USDT" },
        { "type": "max_per_day", "amount": "50000000", "symbol": "USDT" },
        { "type": "max_per_recipient_per_day", "amount": "10000000", "symbol": "USDT" },
        { "type": "cooldown_seconds", "seconds": 30 },
        { "type": "require_confidence", "min": 0.7 },
        { "type": "whitelist_recipients", "addresses": [
          "0x1234567890abcdef1234567890abcdef12345678"
        ]},
        { "type": "time_window", "start_hour": 8, "end_hour": 22, "timezone": "UTC" }
      ]
    }
  ]
}
```

## Policy Evaluation Flow

```
Proposal arrives via IPC
  |
  v
For each policy in config:
  For each rule in policy:
    Evaluate rule against proposal
    If violation: collect violation string
  |
  v
If any violations exist:
  Result: { approved: false, violations: [...] }
  Audit: logged as 'policy_enforcement'
  Fund movement: BLOCKED
Else:
  Result: { approved: true, violations: [] }
  Proceed to execution
```

Violation strings include the policy ID, rule type, current values, and limits.
Example: `[production-agent] max_per_tx: 10000000 exceeds limit 5000000 USDT`.
These are returned to the Brain in the `ExecutionResult` and displayed on the dashboard.
