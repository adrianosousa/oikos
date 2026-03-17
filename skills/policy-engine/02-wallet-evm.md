---
name: oikos-wallet-evm
description: "EVM wallet operations via WDK. Use for ETH/ERC-20 balance checks, token transfers on Ethereum, Arbitrum, Polygon, and other EVM chains."
metadata:
  author: reshimu-labs
  version: "0.1.0"
---

# EVM WALLET — Oikos Policy Engine Skill

## IDENTITY
- **WDK Package:** `@tetherto/wdk-wallet-evm`
- **Actions:** GET_BALANCE, GET_ADDRESS, SEND_TRANSACTION, GET_TX_HISTORY
- **Confirmation Tier:** Reads = Tier 0, Writes = Tier 1 or 2

## WHAT IT DOES
Manages Ethereum and EVM-compatible chain wallets. Derives addresses from seed via BIP-44 (m/44'/60'/0'/0/{index}). Handles native token and ERC-20 token transfers, gas estimation, and transaction broadcasting.

## WHAT IT DOES NOT DO
- Does NOT handle swaps (use swap-velora-evm)
- Does NOT handle bridges (use bridge-usdt0-evm)
- Does NOT handle lending (use lending-aave-evm)
- Does NOT handle account abstraction (use wallet-evm-erc-4337)
- Does NOT interact with arbitrary smart contracts (only transfer operations)

## SUPPORTED CHAINS

Any EVM-compatible chain. Common registrations:
- `ethereum` — Chain ID 1
- `arbitrum` — Chain ID 42161
- `optimism` — Chain ID 10
- `polygon` — Chain ID 137
- `base` — Chain ID 8453
- `avalanche` — Chain ID 43114

Each chain requires its own `registerWallet` call with a valid RPC provider.

## ACTION SCHEMAS

### GET_BALANCE

```json
{
  "action": "GET_BALANCE",
  "module": "wallet-evm",
  "params": {
    "chain": "ethereum",
    "account_index": 0,
    "token_address": "NATIVE"
  }
}
```

- `token_address`: Use `"NATIVE"` for ETH/MATIC/etc, or the ERC-20 contract address for tokens.
- **Result:** `{ "balance_raw": "1000000000000000000", "balance_display": "1.0 ETH", "balance_usd": "3,245.00" }`

### GET_ADDRESS

```json
{
  "action": "GET_ADDRESS",
  "module": "wallet-evm",
  "params": {
    "chain": "ethereum",
    "account_index": 0
  }
}
```

**Result:** `{ "address": "0x...", "chain": "ethereum", "chain_id": 1 }`

### SEND_TRANSACTION (native token)

```json
{
  "action": "SEND_TRANSACTION",
  "module": "wallet-evm",
  "params": {
    "chain": "ethereum",
    "account_index": 0,
    "to": "0x...",
    "amount": "1000000000000000000",
    "token_address": "NATIVE"
  },
  "confirmation_required": true
}
```

### SEND_TRANSACTION (ERC-20 token)

```json
{
  "action": "SEND_TRANSACTION",
  "module": "wallet-evm",
  "params": {
    "chain": "ethereum",
    "account_index": 0,
    "to": "0x...",
    "amount": "1000000",
    "token_address": "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  },
  "confirmation_required": true
}
```

## DETERMINISTIC FLOW — SEND_TRANSACTION

```
1. VALIDATE schema
2. CHECK chain is registered
3. CHECK role permission
4. RESOLVE token:
   - If NATIVE: use sendTransaction({ to, value })
   - If ERC-20: use sendTransaction({ to, tokenAddress, value })
5. ESTIMATE gas via estimateTransaction()
6. CHECK balance >= amount + gas (for NATIVE, both come from same balance)
   CHECK token_balance >= amount AND native_balance >= gas (for ERC-20)
7. CHECK amount limits
8. CHECK rate limit
9. CHECK confirmation tier
10. EXECUTE transaction
11. RETURN { tx_hash, gas_used, gas_display, gas_usd }
```

## CRITICAL: TOKEN ADDRESS HANDLING

```
The agent NEVER uses token symbols ("USDT", "USDC") in ActionRequests.
The engine maintains a TOKEN_REGISTRY per chain mapping common names to addresses:

ethereum:
  USDT  → 0xdAC17F958D2ee523a2206206994597C13D831ec7
  USDC  → 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
  WETH  → 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
  USDT0 → [USDT0 contract address on Ethereum]

arbitrum:
  USDT  → 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9
  USDC  → 0xaf88d065e77c8cC2239327C5EDb3A432268e5831
  USDT0 → [USDT0 contract address on Arbitrum]

The agent says "send USDT" → engine resolves to the correct address for the target chain.
If the token is not in the registry, the agent must provide the full contract address.
```

## ERROR CODES

```
ERROR_INSUFFICIENT_BALANCE — native balance < gas, or token balance < amount
ERROR_AMOUNT_EXCEEDS_LIMIT — per-tx or daily limit exceeded
ERROR_COOLDOWN_ACTIVE — rate limit
ERROR_CONFIRMATION_TIMEOUT — human confirmation timeout
ERROR_TX_FAILED — revert, out of gas, nonce conflict
ERROR_CHAIN_NOT_REGISTERED — target chain not in wallet config
```

## RESPONSE TEMPLATES

```
SUCCESS_SEND_NATIVE:
  "Sent {amount_display} {native_symbol} to {to_short} on {chain}. Gas: {gas_display}. Tx: {tx_hash_short}."

SUCCESS_SEND_TOKEN:
  "Sent {amount_display} {token_symbol} to {to_short} on {chain}. Gas: {gas_display} {native_symbol}. Tx: {tx_hash_short}."

CONFIRM_PROMPT:
  "Send {amount_display} {symbol} to {to_short} on {chain}? Estimated gas: {gas_display} (~${gas_usd}). Confirm?"
```

## EXAMPLES

```
User: "Send 100 USDT to 0xABC...123 on Arbitrum"
→ Engine resolves "USDT" + "arbitrum" → token_address = 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9
→ ActionRequest: { action: "SEND_TRANSACTION", module: "wallet-evm", params: { chain: "arbitrum", to: "0xABC...123", amount: "100000000", token_address: "0xFd086..." } }
→ Agent: "Send 100 USDT to 0xABC...123 on Arbitrum? Estimated gas: 0.0001 ETH (~$0.32). Confirm?"

User: "How much ETH do I have?"
→ ActionRequest: { action: "GET_BALANCE", module: "wallet-evm", params: { chain: "ethereum", token_address: "NATIVE" } }
→ Agent: "Ethereum balance: 1.234 ETH (~$4,003.10)."
```

## EVM-SPECIFIC NOTES
- Gas estimation uses the RPC provider's eth_estimateGas + a 20% buffer.
- USDT on Ethereum mainnet requires allowance reset to 0 before new approve (handled by swap/bridge modules, not send).
- All amounts are in the token's smallest unit (wei for ETH, 6 decimals for USDT/USDC).
- The same EVM address works across all EVM chains (derived from same seed + path).
