---
name: oikos-wallet-spark
description: "Spark/Lightning wallet operations via WDK. Use for instant Bitcoin payments, Lightning invoices, and L1-Spark bridging. Primary settlement rail for Oikos P2P trades."
metadata:
  author: reshimu-labs
  version: "0.1.0"
---

# SPARK WALLET (LIGHTNING) — Oikos Policy Engine Skill

## IDENTITY
- **WDK Package:** `@tetherto/wdk-wallet-spark`
- **Actions:** GET_BALANCE, GET_ADDRESS, SEND_TRANSACTION, GET_TX_HISTORY + Spark-specific actions
- **Confirmation Tier:** Reads = Tier 0, Writes = Tier 1 or 2

## WHAT IT DOES
Manages Spark wallets — Lightspark's Bitcoin Layer 2 with full Lightning Network integration. Enables instant, low-fee Bitcoin and token transfers. Supports creating/paying Lightning invoices, Spark-native invoices, token transfers, and L1<->Spark bridging.

## WHAT IT DOES NOT DO
- Does NOT manage Lightning channels directly (Spark abstracts this)
- Does NOT support on-chain Bitcoin transactions (use wallet-btc for L1)
- Does NOT support arbitrary Lightning features like keysend or custom TLVs

## SPARK-SPECIFIC ACTIONS

### CREATE_LIGHTNING_INVOICE

```json
{
  "action": "CREATE_LIGHTNING_INVOICE",
  "module": "wallet-spark",
  "params": {
    "amount_sats": "10000",
    "memo": "Payment for service"
  }
}
```

**Result:** `{ "invoice": "lnbc100u1p...", "payment_hash": "abc..." }`

### PAY_LIGHTNING_INVOICE

```json
{
  "action": "PAY_LIGHTNING_INVOICE",
  "module": "wallet-spark",
  "params": {
    "invoice": "lnbc100u1p..."
  },
  "confirmation_required": true
}
```

### CREATE_SPARK_INVOICE

```json
{
  "action": "CREATE_SPARK_INVOICE",
  "module": "wallet-spark",
  "params": {
    "amount_sats": "5000"
  }
}
```

### DEPOSIT_FROM_L1 (Bitcoin L1 -> Spark)

```json
{
  "action": "DEPOSIT_FROM_L1",
  "module": "wallet-spark",
  "params": {}
}
```

**Result:** `{ "deposit_address": "bc1q...", "type": "static_deposit" }`

### WITHDRAW_TO_L1 (Spark -> Bitcoin L1)

```json
{
  "action": "WITHDRAW_TO_L1",
  "module": "wallet-spark",
  "params": {
    "amount_sats": "50000",
    "to_address": "bc1q..."
  },
  "confirmation_required": true
}
```

## WHY SPARK MATTERS FOR OIKOS
- Instant P2P payments between agents (Oikos P2P trades settle via Spark)
- Sub-second finality for marketplace transactions
- Near-zero fees (fractions of a satoshi for small payments)
- USDT on Spark (when available) enables instant stablecoin settlement
- Static deposit addresses enable recurring agent-to-agent payment channels

## DETERMINISTIC FLOW — PAY_LIGHTNING_INVOICE

```
1. VALIDATE invoice format (BOLT11 decode)
2. EXTRACT amount from invoice (or use user-specified amount for zero-amount invoices)
3. CHECK Spark balance >= invoice_amount
4. CHECK amount limits
5. CHECK rate limit
6. CHECK confirmation tier
7. EXECUTE payment via Spark SDK
8. RETURN { payment_hash, preimage, fee_msats, amount_sats }
```

## ERROR CODES

```
ERROR_INSUFFICIENT_BALANCE — Spark balance < invoice amount
ERROR_INVOICE_EXPIRED — Lightning invoice has expired
ERROR_PAYMENT_FAILED — Route not found or payment rejected
ERROR_INVOICE_ALREADY_PAID — Duplicate payment attempt (replay protection)
```

## NOTES
- Lightning invoices expire (default: 1 hour). The engine checks expiry before payment.
- Spark invoices are simpler than Lightning invoices — they work within the Spark network only.
- L1 deposits require on-chain confirmations before Spark balance updates.
- Token transfers on Spark use Spark-native token addresses, not ERC-20 addresses.
