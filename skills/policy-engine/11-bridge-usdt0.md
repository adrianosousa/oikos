---
name: oikos-bridge-usdt0
description: "Cross-chain USDT0 bridging via LayerZero. Use when moving USDT0 between EVM chains or to Solana/TON/TRON."
metadata:
  author: reshimu-labs
  version: "0.1.0"
---

# USDT0 BRIDGE — Oikos Policy Engine Skill

## IDENTITY
- **WDK Package:** `@tetherto/wdk-protocol-bridge-usdt0-evm`
- **Actions:** QUOTE_BRIDGE, BRIDGE
- **Confirmation Tier:** QUOTE_BRIDGE = Tier 0, BRIDGE = Tier 2 (always)

## WHAT IT DOES
Bridges USDT0 (and XAUT0) tokens across chains using LayerZero protocol. Moves tokens from EVM source chains to both EVM and non-EVM destinations. Handles fee estimation, approval flows, and cross-chain message verification.

## WHAT IT DOES NOT DO
- Does NOT bridge arbitrary tokens (only USDT0 and XAUT0)
- Does NOT bridge FROM non-EVM chains (source must be EVM)
- Does NOT guarantee instant finality (LayerZero has confirmation times)
- Does NOT reverse completed bridges
- Does NOT handle native token bridges (only USDT0/XAUT0 protocol tokens)

## SUPPORTED ROUTES

### Source Chains (must be EVM)
Ethereum (1), Arbitrum (42161), Optimism (10), Polygon (137), Berachain (80094), Ink (57073), Avalanche (43114), Celo (42220), Flare (14), Mantle (5000), Monad (143), Unichain (130), and 10+ more.

### Destination Chains
- All EVM sources (bidirectional between EVM chains)
- Solana (EID: 30168)
- TON (EID: 30343)
- TRON (EID: 30420)

### Supported Tokens
- **USDT0** — Tether USD (omnichain)
- **XAUT0** — Tether Gold (omnichain). Token availability depends on which contracts are deployed on each chain.

## ACTION SCHEMAS

### QUOTE_BRIDGE (Tier 0)

```json
{
  "action": "QUOTE_BRIDGE",
  "module": "bridge-usdt0-evm",
  "params": {
    "source_chain": "ethereum",
    "dest_chain": "arbitrum",
    "token": "USDT0",
    "amount": "1000000000",
    "account_index": 0
  }
}
```

**Result:**

```json
{
  "bridge_fee_native": "5000000000000000",
  "bridge_fee_display": "0.005 ETH",
  "bridge_fee_usd": "16.22",
  "amount_received": "1000000000",
  "amount_display": "1,000 USDT0",
  "estimated_time_seconds": 120,
  "route": "Ethereum → LayerZero → Arbitrum"
}
```

### BRIDGE (Tier 2 — always requires confirmation)

```json
{
  "action": "BRIDGE",
  "module": "bridge-usdt0-evm",
  "params": {
    "source_chain": "ethereum",
    "dest_chain": "arbitrum",
    "token": "USDT0",
    "amount": "1000000000",
    "account_index": 0
  },
  "confirmation_required": true
}
```

## DETERMINISTIC FLOW — BRIDGE

```
1. VALIDATE schema
2. CHECK source_chain is registered (must be EVM)
3. CHECK route exists in supported routes map (Guardrail 09)
4. CHECK token is supported on both source and destination
5. EXECUTE QUOTE_BRIDGE internally (get LayerZero fee estimate)
6. CHECK USDT0 balance on source_chain >= amount
7. CHECK native balance on source_chain >= bridge_fee_native
8. CHECK amount limits (USD equivalent)
9. CHECK rate limit (bridges have longer cooldowns — default 60s)
10. REQUIRE human confirmation (bridges are ALWAYS Tier 2)
    Show: "Bridge {amount_display} {token} from {source} to {dest}. Fee: {fee_display}. ETA: ~{time_display}."
11. HANDLE approval:
    - Check USDT0 allowance for the OFT contract
    - If insufficient: approve (with USDT reset pattern if on Ethereum mainnet)
12. EXECUTE bridge via LayerZero OFT send
13. RETURN { tx_hash, amount_sent, fee_paid, dest_chain, estimated_arrival }
```

## CRITICAL: BRIDGE IS IRREVERSIBLE

```
Once a bridge transaction is confirmed on the source chain, it CANNOT be reversed.
The tokens will arrive on the destination chain after LayerZero verification.

The engine enforces:
- Bridges are ALWAYS Tier 2 (human confirmation required regardless of amount)
- The confirmation prompt explicitly states this is irreversible
- The engine shows both the bridge fee AND the estimated arrival time
- If the destination is non-EVM (Solana, TON, TRON), the destination address format
  must be validated against the target chain's address format
```

## NON-EVM DESTINATION HANDLING

```
For non-EVM destinations, the agent must provide the destination address in the
correct format for the target chain:

Solana: Base58-encoded public key (32-44 characters)
TON: Raw or user-friendly TON address
TRON: Base58Check-encoded address (starts with T)

The engine validates the address format BEFORE initiating the bridge.
Sending to a wrong-format address would result in permanent fund loss.
```

## ERROR CODES

```
ERROR_BRIDGE_UNSUPPORTED_ROUTE — source/dest combination not supported
ERROR_INSUFFICIENT_BALANCE — USDT0 balance < amount or native < bridge fee
ERROR_AMOUNT_EXCEEDS_LIMIT — bridge amount > configured limit
ERROR_TX_FAILED — source chain transaction failure
ERROR_CONFIRMATION_TIMEOUT — human didn't confirm
ERROR_COOLDOWN_ACTIVE — bridge rate limit active
ERROR_INVALID_DEST_ADDRESS — destination address doesn't match target chain format
```

## RESPONSE TEMPLATES

```
QUOTE_RESULT:
  "Bridge estimate: {amount_display} {token} from {source} to {dest}. Fee: {fee_display} (~${fee_usd}). ETA: ~{time_display}."

CONFIRM_PROMPT:
  "Bridge {amount_display} {token} from {source} to {dest}? Fee: {fee_display}. ETA: ~{time_display}. This is irreversible. Confirm?"

SUCCESS_BRIDGE:
  "Bridge initiated: {amount_display} {token} from {source} → {dest}. Fee: {fee_display}. Tx: {tx_hash_short}. Arrival: ~{time_display}."
```

## EXAMPLES

```
User: "Bridge 500 USDT0 from Ethereum to Arbitrum"
→ Engine: Validates route (Ethereum → Arbitrum for USDT0 = supported)
→ Engine: Runs QUOTE_BRIDGE (fee: 0.003 ETH)
→ Agent: "Bridge 500 USDT0 from Ethereum to Arbitrum? Fee: 0.003 ETH (~$9.74). ETA: ~2 minutes. This is irreversible. Confirm?"
→ Human: "yes"
→ Engine: Approves USDT0, executes LayerZero send
→ Agent: "Bridge initiated: 500 USDT0 Ethereum → Arbitrum. Fee: 0.003 ETH. Tx: 0xabc... Arrival: ~2 minutes."

User: "Can I bridge USDT0 to Solana?"
→ Engine: Checks routes — EVM → Solana for USDT0 = supported
→ Agent: "Yes, USDT0 can be bridged from any supported EVM chain to Solana. Which source chain and how much?"
```
