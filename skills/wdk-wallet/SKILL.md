---
name: wdk-wallet
description: >
  Self-custodial multi-chain crypto wallet for AI agents.
  Use when the user asks to check balances, send payments, swap tokens,
  bridge assets, deposit yield, manage RGB assets, check transaction
  history, or manage wallet policies. Supports USDt, XAUt, USAt, BTC,
  ETH across Ethereum, Polygon, Arbitrum, Bitcoin, and RGB (Bitcoin L2).
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
metadata:
  mcp-server: http://127.0.0.1:3420/mcp
  dashboard: http://127.0.0.1:3420
compatibility:
  runtime: node >= 22
  requires:
    - bare (Tether's Bare Runtime for wallet isolate)
    - oikos dashboard running on port 3420
---

# WDK Wallet Skill

You control a self-custodial cryptocurrency wallet powered by Tether's WDK (Wallet Development Kit). The wallet runs in a **separate isolated process** with its own policy engine — even if you are compromised, the wallet enforces spending limits independently.

## How It Works

1. You call wallet tools via **MCP** (JSON-RPC 2.0 POST to `http://127.0.0.1:3420/mcp`) or **REST** (GET to `http://127.0.0.1:3420/api/*`).
2. **Read operations** (balances, addresses, policies, audit) are always safe — use them freely.
3. **Write operations** (payments, swaps, bridges, yield) go through the PolicyEngine. If any rule is violated, the proposal is rejected and no funds move.

## Quick Start

**Check all balances:**
```bash
curl -s http://127.0.0.1:3420/api/balances
```

**Send a payment (MCP):**
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"propose_payment","arguments":{"amount":"1.5","symbol":"USDT","chain":"ethereum","to":"0xRecipientAddress","reason":"Why this payment","confidence":0.85}}}'
```

**Check remaining budgets:**
```bash
curl -s http://127.0.0.1:3420/api/policies
```

## Available Tools

### Read-Only (always safe)
| Tool | What it returns |
|------|----------------|
| `wallet_balance_all` | All balances across all chains |
| `wallet_balance` | Single asset balance (args: `chain`, `symbol`) |
| `wallet_address` | Wallet address for a chain (args: `chain`) |
| `policy_status` | Remaining budgets, cooldown timers |
| `audit_log` | Recent transactions (args: `limit`) |
| `agent_state` | Agent brain state and reasoning |
| `swarm_state` | P2P swarm peers, rooms, announcements |
| `identity_state` | ERC-8004 on-chain identity |
| `query_reputation` | On-chain reputation score (args: `agentId`) |
| `rgb_assets` | All RGB assets and balances |

### Write (policy-enforced)
| Tool | What it does |
|------|-------------|
| `propose_payment` | Send tokens to an address |
| `propose_swap` | Swap between token pairs (e.g., USDT → XAUT) |
| `propose_bridge` | Move tokens cross-chain (e.g., Ethereum → Arbitrum) |
| `propose_yield` | Deposit/withdraw from yield protocols |
| `swarm_announce` | Post a service listing to the P2P swarm |
| `rgb_issue` | Issue a new RGB asset (args: `ticker`, `name`, `amount`, `precision`) |
| `rgb_transfer` | Transfer RGB asset via invoice (args: `invoice`, `amount`, `symbol`) |

All write tools require: `amount` (human-readable, e.g. `"1.5"` for 1.5 USDT), `symbol`, `chain`, `reason`, `confidence` (0-1). The gateway converts to smallest units automatically.

## Supported Assets

| Symbol | Name | Chains |
|--------|------|--------|
| USDT | Tether USD | Ethereum, Polygon, Arbitrum |
| XAUT | Tether Gold | Ethereum |
| USAT | Tether US | Ethereum |
| BTC | Bitcoin | Bitcoin |
| ETH | Ethereum | Ethereum |
| RGB | RGB Assets | Bitcoin (RGB protocol) |

## Examples

### Example 1: Check portfolio and suggest rebalance
1. `curl -s http://127.0.0.1:3420/api/balances` — get current holdings
2. `curl -s http://127.0.0.1:3420/api/prices` — get live prices
3. `curl -s http://127.0.0.1:3420/api/valuation` — get USD value
4. Reason about allocation, then propose swaps if needed

### Example 2: Pay another agent for a service
1. `curl -s http://127.0.0.1:3420/api/policies` — check remaining budget
2. Propose payment with `propose_payment` tool via MCP
3. Check audit log to confirm execution

### Example 3: Earn yield on idle stablecoins
1. Check USDT balance with `wallet_balance`
2. Check policy limits with `policy_status`
3. Propose yield deposit with `propose_yield` (protocol: `aave-v3`, action: `deposit`)

## Policy Rules

Every write proposal is checked against these rules:

| Rule | Effect |
|------|--------|
| `max_per_tx` | Rejects if amount exceeds per-transaction limit |
| `max_per_session` | Rejects if session total would be exceeded |
| `max_per_day` | Rejects if daily cap would be exceeded |
| `cooldown_seconds` | Rejects if too soon after last transaction |
| `require_confidence` | Rejects if confidence score is too low |
| `whitelist_recipients` | Rejects if recipient is not on approved list |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `Connection refused` on port 3420 | Dashboard not running. Start with `npm run demo` |
| Proposal returns `rejected` | Check `policy_status` — likely budget exhausted or cooldown active |
| `unknown tool` error | Verify tool name matches exactly (case-sensitive) |
| Balance shows 0 for an asset | Asset may not be on that chain — check supported chains above |
| `malformed_message` in audit | Check JSON syntax — amounts must be strings, confidence must be number |

## What You Cannot Do

- Modify wallet policies (immutable for process lifetime)
- Access private keys or seed phrases
- Bypass spending limits or cooldowns
- Retry failed transactions (submit a new proposal instead)

## Standalone Gateway Mode

The wallet gateway can run independently without the agent brain:

```bash
npm run start:gateway
```

In this mode, all wallet tools (balances, payments, swaps, bridges, yield, policies, audit) work normally. Brain-dependent tools (`agent_state`, `identity_state`, `swarm_state`, `swarm_announce`) return `{ status: "no_agent_brain_connected" }`.

This is useful for external agent frameworks (OpenClaw, LangChain, etc.) that want direct wallet access without the Oikos brain.

## Security Model

- **Process isolation**: Wallet runs in a separate Bare Runtime process
- **Structured IPC**: JSON-lines over stdin/stdout — no shared memory
- **Append-only audit**: Every proposal permanently recorded
- **Fail closed**: Ambiguity = no funds move
- **Deterministic policy**: Same proposal + same state = same decision

## Reference

For full curl command examples for every tool, see `references/api-reference.md`.
