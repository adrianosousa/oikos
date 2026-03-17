---
name: oikos-wallet-btc
description: "Bitcoin wallet operations via WDK. Use for BTC balance checks, address generation, and Bitcoin L1 transactions."
metadata:
  author: reshimu-labs
  version: "0.1.0"
---

# BITCOIN WALLET — Oikos Policy Engine Skill

## IDENTITY
- **WDK Package:** `@tetherto/wdk-wallet-btc`
- **Actions:** GET_BALANCE, GET_ADDRESS, SEND_TRANSACTION, GET_TX_HISTORY
- **Confirmation Tier:** GET_BALANCE/GET_ADDRESS/GET_TX_HISTORY = Tier 0, SEND_TRANSACTION = Tier 1 or 2

## WHAT IT DOES
Manages BIP-84 (Native SegWit) Bitcoin wallets. Derives addresses from the seed phrase, tracks UTXOs, estimates fees via mempool.space, creates and broadcasts signed transactions. Supports mainnet, testnet, and regtest.

## WHAT IT DOES NOT DO
- Does NOT support multi-recipient transactions (one recipient per tx)
- Does NOT support OP_RETURN or arbitrary script outputs
- Does NOT manage Lightning payments (use wallet-spark for that)
- Does NOT support Taproot (BIP-86) — only SegWit (BIP-84) and Legacy (BIP-44)
- Does NOT interact with RGB protocol (use wallet-rgb for that)

## SUPPORTED NETWORKS
- `bitcoin` — Mainnet (default Electrum: `electrum.blockstream.info:50001`)
- `testnet` — Testnet
- `regtest` — Local regtest

## ACTION SCHEMAS

### GET_BALANCE

```json
{
  "action": "GET_BALANCE",
  "module": "wallet-btc",
  "params": {
    "account_index": 0,
    "network": "bitcoin"
  }
}
```

**Result:** `{ "balance_sats": "1500000", "balance_display": "0.015 BTC", "balance_usd": "1,543.50" }`

### GET_ADDRESS

```json
{
  "action": "GET_ADDRESS",
  "module": "wallet-btc",
  "params": {
    "account_index": 0,
    "network": "bitcoin"
  }
}
```

**Result:** `{ "address": "bc1q...", "address_type": "P2WPKH", "derivation_path": "m/84'/0'/0'/0/0" }`

### SEND_TRANSACTION

```json
{
  "action": "SEND_TRANSACTION",
  "module": "wallet-btc",
  "params": {
    "account_index": 0,
    "to": "bc1q...",
    "amount_sats": "100000",
    "fee_rate": "auto",
    "network": "bitcoin"
  },
  "confirmation_required": true
}
```

**Result:** `{ "tx_hash": "abc123...", "fee_sats": "2100", "fee_display": "0.000021 BTC" }`

### GET_TX_HISTORY

```json
{
  "action": "GET_TX_HISTORY",
  "module": "wallet-btc",
  "params": {
    "account_index": 0,
    "limit": 10,
    "network": "bitcoin"
  }
}
```

## DETERMINISTIC FLOW — SEND_TRANSACTION

```
1. VALIDATE schema (Guardrail 01)
2. CHECK chain "bitcoin" is registered (Guardrail 02)
3. CHECK role permits SEND_TRANSACTION (Guardrail 03)
4. FETCH current balance via getBalance()
5. ESTIMATE fee via estimateTransaction()
6. CHECK balance >= amount_sats + estimated_fee (Guardrail 04)
7. CHECK amount_sats <= max_per_tx (Guardrail 05)
8. CHECK rate limit not active (Guardrail 06)
9. CHECK confirmation tier:
   - If amount < auto_confirm_threshold: proceed
   - If amount >= threshold: require human confirmation object
10. EXECUTE sendTransaction({ to, value: amount_sats })
11. RETURN { tx_hash, fee_sats, fee_display }
```

## ERROR CODES

```
ERROR_INSUFFICIENT_BALANCE — balance < amount + fee
ERROR_AMOUNT_EXCEEDS_LIMIT — amount > configured max
ERROR_COOLDOWN_ACTIVE — rate limit window active
ERROR_CONFIRMATION_TIMEOUT — human didn't confirm in time
ERROR_TX_FAILED — broadcast failure or rejection
ERROR_CHAIN_NOT_REGISTERED — "bitcoin" not in wallet config
```

## RESPONSE TEMPLATES

```
SUCCESS_SEND:
  "Sent {amount_display} BTC to {to_short}. Fee: {fee_display}. Tx: {tx_hash_short}."

SUCCESS_BALANCE:
  "Bitcoin balance: {balance_display} (~${balance_usd})."

SUCCESS_ADDRESS:
  "Your Bitcoin deposit address: {address}"

CONFIRM_PROMPT:
  "Send {amount_display} BTC to {to_short}? Estimated fee: {fee_display} (~${fee_usd}). Confirm?"
```

## EXAMPLES

```
User: "What's my BTC balance?"
→ ActionRequest: { action: "GET_BALANCE", module: "wallet-btc", params: { account_index: 0 } }
→ ActionResult: { balance_sats: "1500000", balance_display: "0.015 BTC", balance_usd: "1,543.50" }
→ Agent: "Bitcoin balance: 0.015 BTC (~$1,543.50)."

User: "Send 0.001 BTC to bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
→ ActionRequest: { action: "SEND_TRANSACTION", module: "wallet-btc", params: { to: "bc1qxy2kg...", amount_sats: "100000" } }
→ Engine: Runs guardrails 01-10, requests human confirmation
→ Agent: "Send 0.001 BTC to bc1qxy...0wlh? Estimated fee: 0.000015 BTC (~$1.54). Confirm?"
→ Human: "yes"
→ ActionResult: { tx_hash: "a1b2c3...", fee_sats: "1500" }
→ Agent: "Sent 0.001 BTC to bc1qxy...0wlh. Fee: 0.000015 BTC. Tx: a1b2c3..."
```

## BITCOIN-SPECIFIC NOTES
- Fee rates: "auto" uses mempool.space fastest fee estimate. Can also pass sat/vB integer.
- UTXO selection is handled by the module — the agent does NOT pick UTXOs.
- Address validation: the engine validates bech32/base58 format before calling WDK.
- Default derivation: BIP-84 (m/84'/0'/0'/0/{index}). Legacy via getAccountByPath().
