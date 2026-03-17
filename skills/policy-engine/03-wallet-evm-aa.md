---
name: oikos-wallet-evm-aa
description: "ERC-4337 account abstraction for gasless EVM transactions. Use when the agent needs to transact without holding native gas tokens."
metadata:
  author: reshimu-labs
  version: "0.1.0"
---

# EVM ACCOUNT ABSTRACTION (ERC-4337) — Oikos Policy Engine Skill

## IDENTITY
- **WDK Package:** `@tetherto/wdk-wallet-evm-erc-4337`
- **Actions:** Same as wallet-evm but with gasless transaction support
- **Confirmation Tier:** Same tiers as wallet-evm

## WHAT IT DOES
Extends the standard EVM wallet with ERC-4337 account abstraction. Enables gasless transactions where a paymaster covers gas fees. The user's smart account is a counterfactual contract derived from the seed phrase. Supports bundler integration for UserOperation submission.

## WHAT IT DOES NOT DO
- Does NOT work without a bundler endpoint configured
- Does NOT guarantee gas sponsorship (paymaster may reject)
- Does NOT change the user's EOA address — it creates a separate smart account address
- Does NOT support all EVM chains — only chains with deployed EntryPoint contracts

## WHEN TO USE THIS VS STANDARD EVM
- Use **THIS** when: the agent wants to send tokens without holding native gas tokens, or when operating on chains where gas tokens are hard to acquire
- Use **STANDARD EVM** when: the user has native tokens for gas, or for maximum compatibility

## CONFIGURATION

```json
{
  "chain": "arbitrum",
  "bundler_url": "https://bundler.example.com",
  "paymaster_url": "https://paymaster.example.com",
  "paymaster_token": "0x..."
}
```

## DETERMINISTIC FLOW DIFFERENCES FROM STANDARD EVM

```
Standard EVM flow:
  estimate gas → check native balance → send tx

ERC-4337 flow:
  build UserOperation → estimate via bundler → paymaster signs (or reject) → bundler submits

Key difference: balance check is on the PAYMASTER TOKEN (e.g., USDT) not the native token.
If paymaster is configured for sponsored mode, no token balance check needed for gas.
```

## ERROR CODES (additional to wallet-evm)

```
ERROR_BUNDLER_UNAVAILABLE — bundler endpoint not responding
ERROR_PAYMASTER_REJECTED — paymaster refused to sponsor this operation
ERROR_USEROP_REVERTED — UserOperation execution reverted on-chain
```

## NOTES FOR AGENTS
- The smart account address is DIFFERENT from the EOA address
- First transaction on a new smart account deploys the contract (higher gas, usually paymaster-covered)
- All swap/bridge/lending modules work with AA accounts via their AA integration paths
