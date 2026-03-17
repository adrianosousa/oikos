---
name: oikos-policy-engine
description: >
  Deterministic policy engine for sovereign agent wallets built on Tether WDK.
  Use this skill when the agent needs to interact with any wallet, DeFi,
  P2P trade, or payment operation in Oikos. This is the master index —
  it loads per-module skill files from the references/ directory on demand.
  Covers: Bitcoin, EVM, Solana, Spark/Lightning, TON, TRON wallets;
  Velora swaps; USDT0 bridges; Aave lending; MoonPay fiat; RGB tokens;
  x402 HTTP payments; P2P marketplace trades.
  All write operations require typed ActionRequests validated by a deterministic engine.
  The LLM interprets user intent; the engine executes. The LLM never touches keys,
  constructs transactions, or makes financial decisions.
license: MIT
compatibility: Designed for OpenClaw, Claude Code, Cursor, or any agent with file-based skill loading.
  Requires Node.js or Bare Runtime for WDK execution.
metadata:
  author: reshimu-labs
  version: "0.1.0"
  wdk-version: "1.x"
  hackathon: tether-wdk-edition-2025
---

# OIKOS POLICY ENGINE — Master Architecture Document

> **Purpose**: This document defines the deterministic policy engine that governs all wallet and DeFi operations in Oikos. It is the single source of truth for how an agent — OpenClaw, Ollama, local quantized model, or Claude — interacts with the WDK layer. The agent's LLM is the *interpreter*, never the *decision-maker*. Every operation that touches funds follows a typed, validated, deterministic flow.

> **Design Principle**: Make the system so well-railed that even the dumbest model can use it safely.

## 0. RELATIONSHIP TO WDK AGENT SKILLS

```
IMPORTANT: This document defines the OIKOS POLICY ENGINE, which is a layer
ON TOP of the official WDK Agent Skill (https://github.com/tetherto/wdk-agent-skills).

The WDK official skill teaches an LLM to GENERATE JAVASCRIPT CODE that calls WDK's API.
This is useful for developer-facing tools like Cursor or Claude Code.

The Oikos policy engine takes a DIFFERENT APPROACH:
- The LLM does NOT write WDK JavaScript code
- The LLM constructs typed ActionRequest JSON objects
- The POLICY ENGINE (deterministic, no LLM) translates ActionRequests into WDK API calls
- The policy engine enforces guardrails, confirmation tiers, and role permissions

WHY: Because Oikos targets small, quantized, potentially local LLMs (Haiku 3.5, 7B QVAC)
that are NOT reliable code generators. They CAN reliably fill in JSON templates
from a constrained schema. The policy engine handles the rest.

The underlying WDK API calls in the engine implementation SHOULD use the official
WDK skill's patterns (or call WDK directly). These skill files document the
AGENT-FACING interface, not the WDK-internal implementation.

TO INSTALL the official WDK skill alongside this policy engine:
  npx skills add tetherto/wdk-agent-skills
```

## 1. ARCHITECTURE OVERVIEW

### 1.1 The Two Layers

```
┌─────────────────────────────────────────┐
│  AGENT BRAIN (any LLM — Haiku, Ollama, QVAC)  │
│  ─────────────────────────────────────  │
│  Job: Parse human intent → typed ActionRequest  │
│  Job: Format engine output → human-readable text │
│  Job: Ask clarifying questions when ambiguous     │
│  NEVER: Construct transactions, choose params,    │
│         decide gas, pick routes, or touch keys    │
└─────────────────────┬───────────────────┘
                      │ ActionRequest (typed JSON)
                      ▼
┌─────────────────────────────────────────┐
│  OIKOS POLICY ENGINE (deterministic, no LLM)     │
│  ─────────────────────────────────────  │
│  1. Validate ActionRequest against schema        │
│  2. Check guardrails (limits, role, cooldowns)   │
│  3. Execute via WDK module (typed API call)      │
│  4. Return ActionResult (typed JSON)             │
│  NEVER: Interpret natural language               │
│  NEVER: Make judgment calls                      │
└─────────────────────────────────────────┘
```

### 1.2 ActionRequest Schema

Every operation the agent can trigger is represented as a typed ActionRequest:

```json
{
  "action": "SWAP",
  "module": "swap-velora-evm",
  "params": {
    "from_token": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "to_token": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "amount": "1000000",
    "chain_id": 1,
    "slippage_bps": 50
  },
  "confirmation_required": true,
  "estimated_by": null
}
```

### 1.3 Action Enum — Complete List

These are ALL the actions the agent can request. There are no others. If the LLM tries to construct something outside this enum, the engine rejects it.

**Wallet Actions:**

| Action | Description |
|---|---|
| `GET_BALANCE` | Read balance for a chain/account |
| `GET_ADDRESS` | Get deposit address for a chain/account |
| `SEND_TRANSACTION` | Send native token or token transfer |
| `GET_TX_HISTORY` | Read transaction history |

**Swap Actions:**

| Action | Description |
|---|---|
| `QUOTE_SWAP` | Get swap quote (read-only, no confirmation needed) |
| `SWAP` | Execute token swap |

**Bridge Actions:**

| Action | Description |
|---|---|
| `QUOTE_BRIDGE` | Get bridge fee estimate (read-only) |
| `BRIDGE` | Execute cross-chain bridge |

**Lending Actions:**

| Action | Description |
|---|---|
| `GET_ACCOUNT_DATA` | Read Aave position (read-only) |
| `QUOTE_SUPPLY` | Estimate supply tx fee (read-only) |
| `SUPPLY` | Supply asset to Aave |
| `WITHDRAW` | Withdraw asset from Aave |
| `QUOTE_BORROW` | Estimate borrow tx fee (read-only) |
| `BORROW` | Borrow asset from Aave |
| `REPAY` | Repay Aave debt |

**Fiat Actions:**

| Action | Description |
|---|---|
| `GET_BUY_URL` | Generate MoonPay buy URL (read-only) |
| `GET_SELL_URL` | Generate MoonPay sell URL (read-only) |

**P2P Marketplace Actions (Oikos-specific):**

| Action | Description |
|---|---|
| `PUBLISH_LISTING` | Publish a buyer/seller listing to DHT |
| `REMOVE_LISTING` | Remove own listing from DHT |
| `BROWSE_LISTINGS` | Query DHT for available listings |
| `INITIATE_TRADE` | Start a trade with a counterparty |
| `CONFIRM_TRADE` | Confirm trade completion |
| `DISPUTE_TRADE` | Flag a trade dispute |

**x402 Payment Actions:**

| Action | Description |
|---|---|
| `X402_PAY_REQUEST` | Make an HTTP request, auto-paying 402 responses in USDT0 |
| `X402_CONFIGURE_SERVER` | Set up x402 payment middleware on agent's HTTP endpoints |
| `X402_GET_PAYMENT_STATUS` | Check settlement status of a past x402 payment |

### 1.4 Confirmation Tiers

**TIER 0 — NO CONFIRMATION (read-only):**

`GET_BALANCE`, `GET_ADDRESS`, `GET_TX_HISTORY`, `QUOTE_SWAP`, `QUOTE_BRIDGE`, `QUOTE_SUPPLY`, `QUOTE_BORROW`, `GET_ACCOUNT_DATA`, `GET_BUY_URL`, `GET_SELL_URL`, `BROWSE_LISTINGS`

**TIER 1 — AGENT AUTO-CONFIRM (below threshold):**

- `SEND_TRANSACTION` (< $1 equivalent)
- `SWAP` (< $1 equivalent)
- Configurable threshold per wallet owner

**TIER 2 — HUMAN CONFIRMATION REQUIRED:**

- `SEND_TRANSACTION` (>= threshold)
- `SWAP` (>= threshold)
- `BRIDGE` (always — cross-chain is irreversible)
- `SUPPLY`, `WITHDRAW`, `BORROW`, `REPAY` (always — DeFi position changes)
- `PUBLISH_LISTING`, `INITIATE_TRADE`, `CONFIRM_TRADE`

**TIER 3 — FORBIDDEN (engine rejects unconditionally):**

- Any action targeting the agent's own service endpoint as buyer
- Any action exceeding hard wallet limit
- Any action on a chain not registered in this wallet
- Borrowing above configured LTV ratio
- Bridging to an unsupported destination

## 2. ROLE IDENTITY — THE BUYER/SELLER FIX

### 2.1 The Problem You Solved

Ambiguous terms like "offer" caused agent confusion — "offer a service" vs "offer money". The solution: **role is a configuration, not an inference**.

### 2.2 Role Enum

```
BUYER  — This agent wants to acquire a service/asset. It sends payment.
SELLER — This agent provides a service/asset. It receives payment.
```

### 2.3 Role Enforcement Rules

```
IF role == BUYER:
  - CAN: BROWSE_LISTINGS, INITIATE_TRADE (as buyer), SEND_TRANSACTION (to seller)
  - CANNOT: PUBLISH_LISTING with role=SELLER
  - CANNOT: Receive payment for a trade it initiated

IF role == SELLER:
  - CAN: PUBLISH_LISTING, CONFIRM_TRADE, receive payment
  - CANNOT: INITIATE_TRADE (sellers wait for buyers)
  - CANNOT: Send payment within a trade context

CRITICAL: The agent's role is set in its config file, NOT inferred from conversation.
```

## 3. ERROR TAXONOMY — TEMPLATED RESPONSES

The LLM does NOT compose error messages. It selects from these templates and fills in the variables.

| Error Code | Template |
|---|---|
| `ERROR_INSUFFICIENT_BALANCE` | Insufficient {asset} balance on {chain}. Have: {have}. Need: {need}. |
| `ERROR_SLIPPAGE_EXCEEDED` | Swap price moved beyond your {slippage_bps/100}% limit. Expected: {expected}. Got: {actual}. |
| `ERROR_BRIDGE_UNSUPPORTED_ROUTE` | Cannot bridge {token} from {source_chain} to {dest_chain}. Supported: {supported_routes}. |
| `ERROR_AAVE_HEALTH_FACTOR` | This {action} would reduce your health factor to {projected_hf} (min: {min_hf}). Reduce amount or add collateral. |
| `ERROR_AAVE_NO_COLLATERAL` | No collateral supplied on {chain}. Supply assets before borrowing. |
| `ERROR_COOLDOWN_ACTIVE` | Rate limit: wait {seconds_remaining}s before next {action} on {chain}. |
| `ERROR_ROLE_VIOLATION` | Action '{action}' not permitted for role '{role}'. You are configured as {role}. |
| `ERROR_CHAIN_NOT_REGISTERED` | Chain '{chain}' is not registered in this wallet. Available chains: {chain_list}. |
| `ERROR_AMOUNT_EXCEEDS_LIMIT` | Amount {amount} exceeds your configured limit of {limit} for {action}. |
| `ERROR_CONFIRMATION_TIMEOUT` | Confirmation timed out after {timeout}s. Transaction not sent. |
| `ERROR_TX_FAILED` | Transaction failed on {chain}. Hash: {tx_hash}. Reason: {revert_reason}. |
| `ERROR_PEER_OFFLINE` | Counterparty {peer_id_short} is not reachable. They may be offline. |
| `ERROR_LISTING_EXPIRED` | Listing {listing_id_short} has expired or been removed by the seller. |

## 4. GUARDRAILS — DETERMINISTIC CHECKS

These run BEFORE any WDK call. The engine checks every one in order. First failure = reject.

| # | Guardrail | Description |
|---|---|---|
| 01 | Schema Validation | ActionRequest must match the JSON schema for its action type. Unknown fields are rejected (no model-invented parameters). |
| 02 | Chain Registration | The target chain must be registered via `wdk.registerWallet()`. Prevents agents from inventing chains. |
| 03 | Role Permission | The action must be permitted for the agent's configured role. See Section 2.3. |
| 04 | Balance Sufficiency | For write actions: check balance >= amount + estimated_fee. Use the `QUOTE_*` action first to get fee estimate. |
| 05 | Amount Limits | Per-action configurable limits (daily, per-tx, total exposure). Hard ceiling that cannot be overridden by the agent. |
| 06 | Rate Limiting | Minimum interval between write actions (configurable per action type). Prevents agent loops where it retries failed txs rapidly. |
| 07 | Slippage Bounds | Swap `slippage_bps` must be within [1, MAX_SLIPPAGE_BPS]. MAX_SLIPPAGE_BPS configured per wallet (default: 300 = 3%). |
| 08 | Health Factor Floor (Lending) | Before BORROW or WITHDRAW: simulate the resulting health factor. Reject if projected HF < MIN_HEALTH_FACTOR (default: 1.5). |
| 09 | Bridge Route Validation | Source chain + destination chain + token must be in the supported routes map. Prevents agents from attempting impossible bridges. |
| 10 | Confirmation Tier Enforcement | Match the action against its confirmation tier. If TIER 2: require explicit human confirmation object in the ActionRequest. If TIER 3: reject unconditionally. |
| 11 | Self-Trade Prevention | An agent CANNOT initiate a trade with itself. An agent CANNOT pay itself. Compare counterparty_id against own_agent_id. |
| 12 | Replay Protection | Each ActionRequest has a unique nonce. Engine rejects duplicate nonces within a configurable window. |

## 5. WDK MODULE REFERENCE — INDEX

Each module has a dedicated skill file with full details. The master file keeps context small; the agent loads only the skill file it needs for a given action.

### 5.1 Module to Skill File Map

| Module Category | WDK Package | Skill File | Actions Covered |
|---|---|---|---|
| Core | `@tetherto/wdk` | `skills/00-core.md` | Initialization, seed management, module registration |
| Bitcoin Wallet | `@tetherto/wdk-wallet-btc` | `skills/01-wallet-btc.md` | GET_BALANCE, GET_ADDRESS, SEND_TRANSACTION (BTC) |
| EVM Wallet | `@tetherto/wdk-wallet-evm` | `skills/02-wallet-evm.md` | GET_BALANCE, GET_ADDRESS, SEND_TRANSACTION (EVM) |
| EVM AA (4337) | `@tetherto/wdk-wallet-evm-erc-4337` | `skills/03-wallet-evm-aa.md` | Gasless transactions via bundler/paymaster |
| Solana Wallet | `@tetherto/wdk-wallet-solana` | `skills/04-wallet-solana.md` | GET_BALANCE, GET_ADDRESS, SEND_TRANSACTION (SOL) |
| Spark Wallet | `@tetherto/wdk-wallet-spark` | `skills/05-wallet-spark.md` | Lightning payments, L1-Spark bridge |
| TON Wallet | `@tetherto/wdk-wallet-ton` | `skills/06-wallet-ton.md` | TON native + Jetton transfers |
| TON Gasless | `@tetherto/wdk-wallet-ton-gasless` | `skills/07-wallet-ton-gasless.md` | Paymaster-based gasless TON transfers |
| TRON Wallet | `@tetherto/wdk-wallet-tron` | `skills/08-wallet-tron.md` | TRX + TRC20 transfers |
| TRON Gas-Free | `@tetherto/wdk-wallet-tron-gasfree` | `skills/09-wallet-tron-gasfree.md` | Gas-free TRC20 transfers |
| Velora Swap | `@tetherto/wdk-protocol-swap-velora-evm` | `skills/10-swap-velora.md` | QUOTE_SWAP, SWAP |
| StonFi Swap (TON) | `@tetherto/wdk-protocol-swap-stonfi-ton` | `skills/10b-swap-stonfi-ton.md` | QUOTE_SWAP_TON, SWAP_TON |
| USDT0 Bridge | `@tetherto/wdk-protocol-bridge-usdt0-evm` | `skills/11-bridge-usdt0.md` | QUOTE_BRIDGE, BRIDGE |
| Aave Lending | `@tetherto/wdk-protocol-lending-aave-evm` | `skills/12-lending-aave.md` | SUPPLY, WITHDRAW, BORROW, REPAY, GET_ACCOUNT_DATA |
| MoonPay Fiat | `@tetherto/wdk-protocol-fiat-moonpay` | `skills/13-fiat-moonpay.md` | GET_BUY_URL, GET_SELL_URL |
| P2P Marketplace | Oikos-native (Hyperswarm/Protomux) | `skills/14-p2p-marketplace.md` | PUBLISH_LISTING, BROWSE_LISTINGS, INITIATE_TRADE, etc. |
| RGB (Community) | `@utexo/wdk-wallet-rgb` | `skills/15-wallet-rgb.md` | RGB token issuance, transfer (future integration) |
| x402 Payments | `@x402/fetch`, `@x402/express`, `@x402/evm` | `skills/16-x402-payments.md` | X402_PAY_REQUEST, X402_CONFIGURE_SERVER |

### 5.2 How the Agent Loads Skills

```
1. Agent receives user message
2. Agent parses intent → identifies which action(s) are needed
3. Agent loads ONLY the relevant skill file(s) into context
4. Agent constructs ActionRequest using the skill file's schema
5. Engine validates and executes
6. Agent formats ActionResult for the user using the skill file's response templates
```

This keeps context small. A swap operation loads `10-swap-velora.md` (and maybe `02-wallet-evm.md` for balance check). It never loads lending or bridge docs.

## 6. CONFIGURATION SCHEMA

The wallet owner (human) sets these. The agent cannot modify them.

```json
{
  "wallet_config": {
    "seed_phrase_words": 24,
    "registered_chains": ["ethereum", "bitcoin", "arbitrum", "spark"],
    "default_chain": "ethereum"
  },
  "agent_config": {
    "role": "BUYER",
    "auto_confirm_threshold_usd": 1.00,
    "max_per_tx_usd": 500.00,
    "max_daily_usd": 2000.00,
    "max_slippage_bps": 300,
    "min_health_factor": 1.5,
    "rate_limit_seconds": {
      "SEND_TRANSACTION": 10,
      "SWAP": 30,
      "BRIDGE": 60,
      "SUPPLY": 30,
      "BORROW": 60
    },
    "confirmation_timeout_seconds": 120
  },
  "p2p_config": {
    "dht_announce": true,
    "listing_ttl_seconds": 3600,
    "max_concurrent_trades": 3
  }
}
```
