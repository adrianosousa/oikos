---
name: oikos-wdk-core
description: "WDK initialization, seed management, and module registration. Use when setting up or recovering an Oikos wallet."
metadata:
  author: reshimu-labs
  version: "0.1.0"
---

# WDK CORE — Oikos Policy Engine Skill

## IDENTITY
- **WDK Package:** `@tetherto/wdk`
- **Actions:** None directly — this module initializes the wallet and registers other modules
- **Confirmation Tier:** N/A (setup only)

## WHAT IT DOES
Initializes the WDK instance from a BIP-39 seed phrase and provides the registration interface for all wallet and protocol modules. It is the orchestrator — every other module plugs into it. It derives all keys deterministically from a single seed.

## WHAT IT DOES NOT DO
- Does NOT send transactions (wallet modules do that)
- Does NOT interact with any blockchain directly
- Does NOT store any state — it is fully stateless
- Does NOT manage seed phrase storage (that's the app's responsibility)

## INITIALIZATION FLOW

```javascript
// Step 1: Generate or recover seed phrase
const seedPhrase = WDK.getRandomSeedPhrase(24)  // new wallet
// OR: use existing seed phrase from secure storage

// Step 2: Create WDK instance
const wdk = new WDK(seedPhrase)

// Step 3: Register wallet modules (order doesn't matter)
const wdkWithWallets = wdk
  .registerWallet('ethereum', WalletManagerEvm, { provider: 'https://eth.drpc.org' })
  .registerWallet('bitcoin', WalletManagerBtc, { provider: 'https://blockstream.info/api' })
  .registerWallet('arbitrum', WalletManagerEvm, { provider: 'https://arb1.arbitrum.io/rpc' })

// Step 4: Register protocol modules
const wdkFull = wdkWithWallets
  .registerProtocol('swap-velora-evm', SwapveloraEvm)
  .registerProtocol('bridge-usdt0-evm', BridgeUsdt0Evm)
  .registerProtocol('lending-aave-evm', LendingAaveEvm)
```

## POLICY ENGINE RULES FOR CORE

```
RULE: Seed phrase is generated ONCE at wallet creation and stored securely by the app.
RULE: The agent NEVER sees the seed phrase. The engine loads it from secure storage.
RULE: Module registration happens at app startup, NOT per-request.
RULE: The registered_chains list in config MUST match the actual registerWallet calls.
RULE: If a module fails to register (bad provider, network error), the engine logs the failure
      and excludes that chain from available operations.
```

## SEED PHRASE SECURITY

- 24-word phrases provide 256-bit entropy (recommended for production)
- 12-word phrases provide 128-bit entropy (acceptable for development)
- The engine MUST wipe seed phrase from memory after WDK initialization
- Seed phrase storage is the application layer's responsibility:
  - Mobile: iOS Keychain / Android Keystore
  - Desktop: OS keyring
  - Server: HSM or encrypted environment variable
  - NEVER: plaintext file, database, or environment variable without encryption

## ERROR CODES

```
ERROR_CHAIN_NOT_REGISTERED
  Produced when: An action targets a chain not in the registered list
  Example: "Chain 'solana' is not registered in this wallet. Available chains: ethereum, bitcoin, arbitrum."
```

## RESPONSE TEMPLATES

```
ON WALLET READY:
  "Wallet initialized with {n_chains} chains: {chain_list}."

ON CHAIN REGISTRATION FAILURE:
  "Warning: {chain} failed to register ({reason}). Other chains are operational."
```
