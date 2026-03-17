---
name: oikos-lending-aave
description: "Aave V3 lending and borrowing on EVM chains. Use for supplying assets to earn yield, borrowing against collateral, or managing DeFi positions."
metadata:
  author: reshimu-labs
  version: "0.1.0"
---

# AAVE V3 LENDING — Oikos Policy Engine Skill

## IDENTITY
- **WDK Package:** `@tetherto/wdk-protocol-lending-aave-evm`
- **Actions:** GET_ACCOUNT_DATA, QUOTE_SUPPLY, SUPPLY, WITHDRAW, QUOTE_BORROW, BORROW, REPAY
- **Confirmation Tier:** GET_ACCOUNT_DATA/QUOTE_* = Tier 0, all writes = Tier 2

## WHAT IT DOES
Interacts with Aave V3 lending pools on EVM chains. Lets the agent supply assets to earn yield, withdraw supplied assets, borrow against collateral, and repay debt. Reads position data including health factor, total collateral, total debt, and available borrows. Works with standard EVM and ERC-4337 smart accounts.

## WHAT IT DOES NOT DO
- Does NOT support Aave V2 (only V3)
- Does NOT manage flash loans
- Does NOT provide yield farming or staking beyond basic supply
- Does NOT automatically rebalance positions
- Does NOT support governance voting
- Does NOT liquidate other users' positions

## SUPPORTED NETWORKS
Ethereum, Arbitrum, Base, Optimism, Polygon, Avalanche, BNB Chain, Celo, Gnosis, Linea, Scroll, Sonic, ZkSync, Metis, Soneium. Requires correct RPC provider and Aave V3 pool addresses for the target chain.

## ACTION SCHEMAS

### GET_ACCOUNT_DATA (Tier 0)

```json
{
  "action": "GET_ACCOUNT_DATA",
  "module": "lending-aave-evm",
  "params": {
    "chain": "ethereum",
    "account_index": 0
  }
}
```

**Result:**

```json
{
  "total_collateral_usd": "5,000.00",
  "total_debt_usd": "1,200.00",
  "available_borrow_usd": "2,550.00",
  "health_factor": "3.12",
  "ltv_current_pct": "24.0",
  "ltv_max_pct": "80.0",
  "supplied_assets": [
    { "token": "WETH", "amount": "1.5", "apy": "2.1%" },
    { "token": "USDT", "amount": "2000", "apy": "4.8%" }
  ],
  "borrowed_assets": [
    { "token": "USDC", "amount": "1200", "apy": "5.2%" }
  ]
}
```

### SUPPLY (Tier 2)

```json
{
  "action": "SUPPLY",
  "module": "lending-aave-evm",
  "params": {
    "chain": "ethereum",
    "account_index": 0,
    "token_address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "amount": "1000000000000000000",
    "use_as_collateral": true
  },
  "confirmation_required": true
}
```

### WITHDRAW (Tier 2)

```json
{
  "action": "WITHDRAW",
  "module": "lending-aave-evm",
  "params": {
    "chain": "ethereum",
    "account_index": 0,
    "token_address": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    "amount": "500000000000000000"
  },
  "confirmation_required": true
}
```

- Use `amount = "MAX"` to withdraw all of a supplied asset

### BORROW (Tier 2)

```json
{
  "action": "BORROW",
  "module": "lending-aave-evm",
  "params": {
    "chain": "ethereum",
    "account_index": 0,
    "token_address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "amount": "500000000",
    "interest_rate_mode": 2
  },
  "confirmation_required": true
}
```

- `interest_rate_mode`: 1 = stable (if available), 2 = variable (default and recommended)

### REPAY (Tier 2)

```json
{
  "action": "REPAY",
  "module": "lending-aave-evm",
  "params": {
    "chain": "ethereum",
    "account_index": 0,
    "token_address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "amount": "500000000",
    "interest_rate_mode": 2
  },
  "confirmation_required": true
}
```

- Use `amount = "MAX"` to repay full debt for a token

## DETERMINISTIC FLOW — BORROW (highest risk, most guardrails)

```
1. VALIDATE schema
2. CHECK chain is registered
3. CHECK role permission
4. GET_ACCOUNT_DATA to read current position
5. CHECK total_collateral > 0 (cannot borrow without collateral)
6. SIMULATE: Calculate projected health factor after borrow
   projected_hf = (total_collateral * avg_liquidation_threshold) / (total_debt + new_borrow_usd)
7. CHECK projected_hf >= MIN_HEALTH_FACTOR (Guardrail 08, default 1.5)
   If below: REJECT with ERROR_AAVE_HEALTH_FACTOR
8. QUOTE_BORROW to get gas estimate
9. CHECK native balance >= gas
10. CHECK borrow amount <= available_borrow (from Aave pool)
11. CHECK amount limits
12. CHECK rate limit
13. REQUIRE human confirmation (always Tier 2)
    Show: "Borrow {amount_display} {token} on {chain}. Current HF: {current_hf} → Projected: {projected_hf}. Gas: {gas_display}."
14. EXECUTE borrow
15. RETURN { tx_hash, amount_borrowed, new_health_factor, gas_used }
```

## DETERMINISTIC FLOW — WITHDRAW (can affect health factor)

```
1-3. Standard validation
4. GET_ACCOUNT_DATA
5. CHECK supplied_amount >= withdraw_amount for the target token
6. IF the user has outstanding debt:
   SIMULATE: projected_hf after withdrawal
   CHECK projected_hf >= MIN_HEALTH_FACTOR
   If below: REJECT with ERROR_AAVE_HEALTH_FACTOR
7. If no debt: no health factor check needed
8-13. Standard flow
14. EXECUTE withdraw
15. RETURN { tx_hash, amount_withdrawn, new_health_factor, gas_used }
```

## CRITICAL: HEALTH FACTOR PROTECTION

```
Health Factor = Total Collateral x Weighted Liquidation Threshold / Total Debt

HF > 1.0 = Safe (no liquidation risk)
HF = 1.0 = Liquidation threshold (partial liquidation can occur)
HF < 1.0 = Underwater (liquidation will occur)

The engine enforces MIN_HEALTH_FACTOR (default 1.5) for ALL operations that could
reduce the health factor (BORROW, WITHDRAW with debt).

The agent CANNOT override this. Only the wallet owner can change MIN_HEALTH_FACTOR
in the configuration.

For SUPPLY: no health factor risk (increases collateral)
For REPAY: no health factor risk (decreases debt)
For BORROW: simulated check BEFORE execution
For WITHDRAW: simulated check BEFORE execution IF debt > 0
```

## ERROR CODES

```
ERROR_AAVE_HEALTH_FACTOR — projected HF < MIN_HEALTH_FACTOR
ERROR_AAVE_NO_COLLATERAL — trying to borrow with no supplied collateral
ERROR_INSUFFICIENT_BALANCE — not enough token to supply/repay, or native for gas
ERROR_AMOUNT_EXCEEDS_LIMIT — beyond configured limits
ERROR_TX_FAILED — Aave pool revert (insufficient liquidity, etc.)
ERROR_COOLDOWN_ACTIVE — rate limit between lending operations
```

## RESPONSE TEMPLATES

```
ACCOUNT_DATA:
  "Aave position on {chain}: Collateral: ${collateral_usd} | Debt: ${debt_usd} | Health Factor: {hf} | Available to borrow: ${available_usd}."

CONFIRM_SUPPLY:
  "Supply {amount_display} {token} to Aave on {chain}? Use as collateral: {yes/no}. Current APY: {apy}%. Gas: {gas_display}. Confirm?"

CONFIRM_BORROW:
  "Borrow {amount_display} {token} on {chain}? Health factor: {current_hf} → {projected_hf}. Gas: {gas_display}. Confirm?"

CONFIRM_WITHDRAW:
  "Withdraw {amount_display} {token} from Aave on {chain}? {hf_warning_if_applicable} Gas: {gas_display}. Confirm?"

HEALTH_FACTOR_REJECTION:
  "Cannot {action}: would reduce health factor to {projected_hf} (minimum: {min_hf}). Reduce amount or add collateral."

SUCCESS_SUPPLY:
  "Supplied {amount_display} {token} to Aave on {chain}. Earning {apy}% APY. Gas: {gas_display}. Tx: {tx_hash_short}."

SUCCESS_BORROW:
  "Borrowed {amount_display} {token} on {chain}. New health factor: {new_hf}. Gas: {gas_display}. Tx: {tx_hash_short}."
```

## EXAMPLES

```
User: "What's my Aave position?"
→ ActionRequest: { action: "GET_ACCOUNT_DATA", module: "lending-aave-evm", params: { chain: "ethereum" } }
→ Agent: "Aave position on Ethereum: Collateral: $5,000 | Debt: $1,200 | Health Factor: 3.12 | Available to borrow: $2,550."

User: "Supply 1000 USDT to Aave on Arbitrum"
→ Engine: Resolves USDT on Arbitrum, runs QUOTE_SUPPLY
→ Agent: "Supply 1,000 USDT to Aave on Arbitrum? Use as collateral: yes. Current APY: 4.8%. Gas: ~0.00008 ETH. Confirm?"
→ Human: "yes"
→ Agent: "Supplied 1,000 USDT to Aave on Arbitrum. Earning 4.8% APY. Gas: 0.00008 ETH. Tx: 0x..."

User: "Borrow 2000 USDC" (with HF too low)
→ Engine: Simulates → projected HF = 1.1 (below 1.5 minimum)
→ Agent: "Cannot borrow: would reduce health factor to 1.10 (minimum: 1.50). Reduce amount or add more collateral."
```
