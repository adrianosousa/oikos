---
name: oikos-swap-velora
description: "Token swaps on EVM chains via Velora DEX aggregator. Use when the agent needs to exchange tokens on Ethereum, Arbitrum, or other EVM networks."
metadata:
  author: reshimu-labs
  version: "0.1.0"
---

# VELORA SWAP — Oikos Policy Engine Skill

## IDENTITY
- **WDK Package:** `@tetherto/wdk-protocol-swap-velora-evm`
- **Actions:** QUOTE_SWAP, SWAP
- **Confirmation Tier:** QUOTE_SWAP = Tier 0, SWAP = Tier 2

## WHAT IT DOES
Executes token swaps on EVM chains via the Velora DEX aggregator. Velora routes through multiple DEXs to find the best price. Handles token approvals automatically (including the USDT approval reset pattern on Ethereum mainnet). Works with standard EVM wallets and ERC-4337 smart accounts.

## WHAT IT DOES NOT DO
- Does NOT provide limit orders or advanced order types
- Does NOT support cross-chain swaps (use bridge-usdt0 for cross-chain)
- Does NOT allow swapping on non-EVM chains (use chain-specific swap modules for TON/Solana)
- Does NOT provide liquidity or LP positions
- Does NOT guarantee execution at the quoted price (slippage may occur)

## SUPPORTED CHAINS
Any EVM chain supported by Velora: Ethereum, Arbitrum, Polygon, Optimism, Avalanche, Base, and others. A working RPC provider is required for the target chain.

## ACTION SCHEMAS

### QUOTE_SWAP (Tier 0 — no confirmation)

```json
{
  "action": "QUOTE_SWAP",
  "module": "swap-velora-evm",
  "params": {
    "chain": "ethereum",
    "account_index": 0,
    "from_token": "NATIVE",
    "to_token": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "amount": "1000000000000000000"
  }
}
```

**Result:**

```json
{
  "from_amount": "1000000000000000000",
  "from_display": "1.0 ETH",
  "to_amount": "3245120000",
  "to_display": "3,245.12 USDT",
  "price_impact_bps": 5,
  "estimated_gas": "210000",
  "gas_display": "0.0042 ETH",
  "gas_usd": "13.63",
  "route": "Uniswap V3 → USDT"
}
```

### SWAP (Tier 2 — always requires confirmation)

```json
{
  "action": "SWAP",
  "module": "swap-velora-evm",
  "params": {
    "chain": "ethereum",
    "account_index": 0,
    "from_token": "NATIVE",
    "to_token": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "amount": "1000000000000000000",
    "slippage_bps": 50
  },
  "confirmation_required": true
}
```

## DETERMINISTIC FLOW — SWAP

```
1. VALIDATE schema
2. CHECK chain is registered
3. CHECK role permission
4. EXECUTE QUOTE_SWAP internally (get current price + gas estimate)
5. CHECK from_token balance >= amount (+ gas if from_token is NATIVE)
6. CHECK native balance >= gas (if from_token is ERC-20)
7. CHECK slippage_bps is within [1, MAX_SLIPPAGE_BPS] (Guardrail 07)
8. CHECK amount limits (use USD equivalent from quote)
9. CHECK rate limit
10. REQUIRE human confirmation (swaps are always Tier 2)
    Show: "Swap {from_display} → ~{to_display} on {chain}. Slippage: {slippage_bps/100}%. Gas: ~{gas_display}."
11. HANDLE approval if needed:
    - If from_token is ERC-20 and allowance < amount:
      - If from_token is USDT on Ethereum mainnet: approve(0) first, then approve(amount)
      - Otherwise: approve(amount)
12. EXECUTE swap via Velora
13. RETURN { tx_hash, from_amount, to_amount_received, gas_used, gas_display }
```

## CRITICAL: SLIPPAGE HANDLING

```
The agent NEVER picks slippage values. The policy engine applies:

1. If user specifies slippage: validate within [1, MAX_SLIPPAGE_BPS], use it
2. If user says nothing about slippage: use DEFAULT_SLIPPAGE_BPS from config (typically 50 = 0.5%)
3. If quote shows price_impact_bps > slippage_bps: WARN user before proceeding
4. If actual execution exceeds slippage: tx reverts on-chain (funds safe, gas lost)

MAX_SLIPPAGE_BPS default: 300 (3%)
The agent can suggest but NEVER override the configured max.
```

## ERROR CODES

```
ERROR_INSUFFICIENT_BALANCE — not enough from_token or native for gas
ERROR_SLIPPAGE_EXCEEDED — quoted price moved beyond tolerance
ERROR_AMOUNT_EXCEEDS_LIMIT — swap amount > configured limit
ERROR_TX_FAILED — on-chain revert (usually slippage)
ERROR_CHAIN_NOT_REGISTERED — target chain not available
ERROR_COOLDOWN_ACTIVE — rate limit between swaps
```

## RESPONSE TEMPLATES

```
QUOTE_RESULT:
  "Swap estimate: {from_display} → ~{to_display} on {chain}. Price impact: {price_impact}%. Gas: ~{gas_display}."

CONFIRM_PROMPT:
  "Swap {from_display} for ~{to_display} on {chain}? Max slippage: {slippage}%. Gas: ~{gas_display}. Confirm?"

SUCCESS_SWAP:
  "Swapped {from_display} → {to_received_display} on {chain}. Gas: {gas_display}. Tx: {tx_hash_short}."

SLIPPAGE_WARNING:
  "Price impact ({impact}%) exceeds your slippage tolerance ({slippage}%). The swap would likely fail."
```

## EXAMPLES

```
User: "Swap 1 ETH for USDT on Arbitrum"
→ Engine: Resolves USDT on Arbitrum → 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9
→ Engine: Runs QUOTE_SWAP internally
→ Agent: "Swap 1.0 ETH for ~3,245 USDT on Arbitrum? Max slippage: 0.5%. Gas: ~0.0001 ETH (~$0.32). Confirm?"
→ Human: "yes"
→ Engine: Executes swap
→ Agent: "Swapped 1.0 ETH → 3,243.88 USDT on Arbitrum. Gas: 0.00008 ETH. Tx: 0xdef..."

User: "How much USDT would I get for 0.5 ETH?"
→ Engine: Runs QUOTE_SWAP only (Tier 0, no confirmation)
→ Agent: "Swap estimate: 0.5 ETH → ~1,622.56 USDT on Ethereum. Price impact: 0.01%. Gas: ~0.004 ETH."
```
