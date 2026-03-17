---
name: oikos-wallet-solana
description: "Solana wallet operations via WDK. Use for SOL/SPL token balance checks and transfers."
metadata:
  author: reshimu-labs
  version: "0.1.0"
---

# SOLANA WALLET — Oikos Policy Engine Skill

## IDENTITY
- **WDK Package:** `@tetherto/wdk-wallet-solana`
- **Actions:** GET_BALANCE, GET_ADDRESS, SEND_TRANSACTION, GET_TX_HISTORY
- **Confirmation Tier:** Reads = Tier 0, Writes = Tier 1 or 2

## WHAT IT DOES
Manages Solana wallets derived from BIP-39 seed phrases via BIP-44 paths (m/44'/501'/0'/0'). Handles SOL transfers and SPL token transfers. Provides balance queries and transaction history.

## WHAT IT DOES NOT DO
- Does NOT interact with Solana programs beyond token transfers
- Does NOT manage stake accounts or validator operations
- Does NOT support versioned transactions with address lookup tables
- Does NOT support NFT operations

## SUPPORTED NETWORKS
- Solana Mainnet
- Solana Devnet
- Solana Testnet

## ACTION SCHEMAS

### SEND_TRANSACTION

```json
{
  "action": "SEND_TRANSACTION",
  "module": "wallet-solana",
  "params": {
    "account_index": 0,
    "to": "<base58 Solana address>",
    "amount": "1000000000",
    "token_address": "NATIVE"
  },
  "confirmation_required": true
}
```

- `amount` in lamports for SOL (1 SOL = 1,000,000,000 lamports)
- For SPL tokens: use the token mint address as `token_address`, amount in token smallest unit

## DETERMINISTIC FLOW — SEND_TRANSACTION

```
1. VALIDATE schema
2. CHECK chain "solana" is registered
3. VALIDATE base58 address format
4. ESTIMATE transaction fee
5. CHECK balance:
   - NATIVE: sol_balance >= amount + fee + rent_exemption
   - SPL: token_balance >= amount AND sol_balance >= fee
6. CHECK amount limits and rate limits
7. CHECK confirmation tier
8. EXECUTE transfer
9. RETURN { tx_hash (signature), fee_lamports, fee_display }
```

## SOLANA-SPECIFIC NOTES
- Solana accounts require rent exemption (~0.00203928 SOL). The engine prevents draining below this threshold.
- SPL token accounts may need to be created first (costs ~0.002 SOL). The engine handles this automatically.
- Transaction confirmation uses "confirmed" commitment by default.
- Solana addresses are base58-encoded Ed25519 public keys.
- Unlike EVM, each SPL token requires a separate Associated Token Account (ATA).

## ERROR CODES

```
ERROR_INSUFFICIENT_BALANCE — SOL balance < amount + fee + rent
ERROR_TOKEN_ACCOUNT_NOT_FOUND — recipient has no ATA for this token (engine creates it)
ERROR_TX_FAILED — transaction simulation failure or timeout
```

## RESPONSE TEMPLATES

```
SUCCESS_SEND:
  "Sent {amount_display} {symbol} to {to_short} on Solana. Fee: {fee_display} SOL. Tx: {tx_hash_short}."

CONFIRM_PROMPT:
  "Send {amount_display} {symbol} to {to_short} on Solana? Estimated fee: {fee_display} SOL (~${fee_usd}). Confirm?"
```
