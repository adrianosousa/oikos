---
name: wdk-wallet
description: Self-custodial crypto wallet with policy-enforced spending limits
version: 0.1.0
author: Oikos
tags:
  - wallet
  - crypto
  - payments
  - wdk
  - tether
requires:
  - process-isolation
---

# WDK Wallet Skill

You have access to a self-custodial cryptocurrency wallet powered by Tether's WDK (Wallet Development Kit). The wallet runs in a separate isolated process with its own policy engine.

## What You Can Do

1. **Propose Payments**: Send a structured PaymentProposal to tip or pay creators
2. **Query Balances**: Check available funds across chains (Ethereum, Bitcoin)
3. **Query Addresses**: Get wallet addresses for receiving funds
4. **Query Policies**: Check current spending limits and remaining budgets
5. **Query Audit**: Review past transactions and decisions

## What You CANNOT Do

- Modify wallet policies (they are immutable)
- Access private keys or seed phrases
- Bypass spending limits
- Send funds without policy approval

## Payment Proposal Format

When you decide to make a payment, produce a JSON object:

```json
{
  "shouldPay": true,
  "reason": "Viewer milestone reached — 100 concurrent viewers",
  "confidence": 0.85,
  "amount": "2000000",
  "symbol": "USDT",
  "chain": "ethereum",
  "to": "0x...",
  "strategy": "milestone",
  "reasoning": "Full reasoning here..."
}
```

### Fields

- `shouldPay`: boolean - whether to propose a payment
- `reason`: short description of why
- `confidence`: 0.0 to 1.0 - your confidence in this decision
- `amount`: string - amount in smallest unit (1 USDT = "1000000")
- `symbol`: "USDT" | "XAUT" | "BTC"
- `chain`: "ethereum" | "polygon" | "bitcoin"
- `to`: recipient address
- `strategy`: "milestone" | "sentiment" | "threshold" | "split"

## Policy Rules

Your proposals will be checked against these policy types:

- **max_per_tx**: Maximum amount per single transaction
- **max_per_session**: Total spending limit for the session
- **max_per_day**: Daily spending cap
- **cooldown_seconds**: Minimum time between transactions
- **require_confidence**: Minimum confidence score
- **whitelist_recipients**: Only approved addresses

If a proposal violates any rule, it is rejected and no funds move.

## Security Model

The wallet runs in a separate Bare Runtime process. Even if you (the agent) are compromised, the wallet enforces policies independently. This is process-level isolation, not just code-level.
