<p align="center">
  <img src="assets/logo.png" alt="Oikos Protocol" width="400">
</p>

<h1 align="center">Oikos Protocol</h1>

<p align="center"><strong>Sovereign Agent Wallet Protocol</strong></p>

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Tests: 140 passing](https://img.shields.io/badge/tests-140%20passing-brightgreen.svg)](#testing)
[![Node: >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)
[![TypeScript: Strict](https://img.shields.io/badge/typescript-strict-blue.svg)](tsconfig.base.json)

Process-isolated, multi-chain, multi-asset wallet infrastructure for autonomous AI agents. Built on Tether's own runtime stack (Bare/Pear Runtime + WDK).

Agents hold USDt, XAUt, and USAt. They reason about money, execute DeFi strategies, and trade with each other over Hyperswarm -- all under policy-enforced constraints with full audit trails.

> **Hackathon**: Tether Hackathon Galactica WDK Edition 1 (DoraHacks)
> **Track**: Track 1 -- Agent Wallets | Best Projects Overall
> **Builder**: Adriano Sousa ([@adrianosousa](https://github.com/adrianosousa))

---

## Architecture

Oikos separates the wallet from the agent at the process level. The infrastructure is agent-agnostic -- any AI agent connects via MCP, REST, or CLI. Even if the agent is fully compromised, the wallet remains safe.

```
                         Oikos Protocol
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │  ┌─────────────────────┐    IPC     ┌────────────────────┐  │
  │  │    OIKOS APP         │ stdin/out │   WALLET ISOLATE    │  │
  │  │    (Node.js)         │◄────────►│   (Bare Runtime)    │  │
  │  │  Agent-Agnostic Infra│ JSON-lines│                     │  │
  │  │                      │           │  ┌──────────────┐   │  │
  │  │  ┌───────────────┐   │           │  │ WDK Core     │   │  │
  │  │  │ Hyperswarm    │   │           │  │ Keys + Signer│   │  │
  │  │  │ P2P Swarm     │   │           │  └──────────────┘   │  │
  │  │  └───────────────┘   │           │  ┌──────────────┐   │  │
  │  │  ┌───────────────┐   │           │  │ PolicyEngine │   │  │
  │  │  │ Dashboard     │   │           │  │ 8 Rule Types │   │  │
  │  │  │ MCP (21 tools)│   │           │  └──────────────┘   │  │
  │  │  └───────────────┘   │           │  ┌──────────────┐   │  │
  │  │  ┌───────────────┐   │           │  │ Audit Log    │   │  │
  │  │  │ CLI + x402    │   │           │  │ Append-Only  │   │  │
  │  │  │ + RGB         │   │           │  └──────────────┘   │  │
  │  │  └───────────────┘   │           │                     │  │
  │  └─────────────────────┘           └────────────────────┘  │
  │                                                             │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │                  INTEGRATION LAYER                     │  │
  │  │  OpenClaw │ MCP │ CLI │ IPC │ Hyperswarm │ x402       │  │
  │  └───────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
    Companion App       Any Agent              x402 Clients
    (P2P, Bare-native)  (MCP/REST/CLI)      (Machine Payments)
```

**Four layers:**

| Layer | Description |
|-------|-------------|
| **Wallet Protocol** | Process-isolated, policy-enforced multi-chain wallet on Bare Runtime |
| **Oikos App** | Agent-agnostic infrastructure: MCP, CLI, dashboard, swarm, x402, RGB (no LLM) |
| **Agent Swarm** | Multi-agent trading swarm on Hyperswarm with Noise E2E encryption |
| **Companion App** | Bare-native P2P encrypted human-agent communication via Hyperswarm |

## Features

- **Multi-chain**: Bitcoin testnet + Sepolia (EVM) + any WDK-supported chain
- **Multi-asset**: USDt, XAUt, USAt, BTC, ETH -- all three mandatory Tether assets supported
- **DeFi operations**: Swaps (Velora DEX), Bridges (USDT0), Yield (Aave lending) -- all policy-enforced
- **PolicyEngine**: 8 rule types -- max per tx, per session, per day, per recipient/day, cooldown, confidence threshold, recipient whitelist, time window
- **Agent Swarm**: Hyperswarm DHT discovery, two-layer topic model (public board + private rooms), audit-derived reputation, meta-marketplace
- **x402 Machine Payments**: HTTP 402 protocol for commodity services with WDK wallet as EIP-3009 signer
- **ERC-8004 On-Chain Identity**: Trustless Agents standard for Sybil-resistant agent reputation
- **Companion Channel**: P2P encrypted human-agent channel via Hyperswarm protomux
- **Live pricing**: Bitfinex real-time feed via WDK pricing modules
- **Encrypted seed management**: PBKDF2-SHA256 + XSalsa20-Poly1305 via WDK SecretManager
- **Sovereign AI**: Ollama + Qwen 3 8B -- zero cloud dependencies in demo mode
- **140 tests passing**: TypeScript strict mode, zero `any` types

## Quick Start

```bash
git clone https://github.com/adrianosousa/oikos.git
cd oikos
npm install
npm run build
npm run demo          # Zero API keys needed -- mock mode
```

Dashboard opens at **http://127.0.0.1:3420**

### LLM Modes

| Mode | Command | Requirements |
|------|---------|-------------|
| **Mock** | `MOCK_LLM=true npm start` | Nothing -- deterministic demo responses |
| **Local** | `LLM_MODE=local npm start` | Ollama running with `qwen3:8b` |
| **Cloud** | `LLM_MODE=cloud npm start` | `LLM_API_KEY` + `LLM_BASE_URL` set |

### Generate a Wallet Seed

```bash
npm run generate-seed
# Copy the 24-word phrase into your .env file
```

## Integration Surfaces

Oikos exposes six ways for agents and systems to interact with the wallet:

| Surface | Protocol | Use Case |
|---------|----------|----------|
| **OpenClaw Skill** | `skills/wdk-wallet/SKILL.md` | Any OpenClaw agent gets wallet capabilities |
| **MCP Server** | 21 tools via JSON-RPC 2.0 at `POST /mcp` | Any MCP-compatible agent framework |
| **CLI** | `oikos` commands (init, balance, pay, pair, etc.) | Shell-based agents, human operators, scripting |
| **Direct IPC** | stdin/stdout JSON-lines | Embedded use in custom agent processes |
| **Hyperswarm P2P** | Noise-encrypted protomux channels | Agent-to-agent discovery and negotiation |
| **x402 Payments** | HTTP 402 + EIP-3009 | Machine-to-machine commodity payments |

## Security Model

The security architecture enforces a strict boundary between reasoning and signing:

- **Process isolation**: The Wallet Isolate runs in a separate Bare Runtime process. It holds keys, enforces policy, and signs transactions. The Oikos App process never sees seed material.
- **Single code path**: There is exactly ONE path that moves funds: `PolicyEngine.evaluate()` -> `PaymentExecutor.execute()`. All proposal types (payments, swaps, bridges, yield) go through it.
- **Immutable policy**: Policies load from JSON at startup and cannot be modified via IPC. External agents can query policy state but never change it.
- **Append-only audit**: Every proposal -- approved, rejected, or malformed -- is recorded. Entries never contain seeds, private keys, or LLM API keys.
- **Encrypted seed persistence**: WDK SecretManager with PBKDF2-SHA256 key derivation and XSalsa20-Poly1305 encryption.
- **140 tests prove**: Rejected proposals never result in signed transactions. Malformed IPC messages are dropped. Audit log is append-only.

### PolicyEngine Rules

| Rule Type | Description |
|-----------|-------------|
| `max_per_tx` | Maximum amount per single transaction |
| `max_per_session` | Cumulative cap for the current session |
| `max_per_day` | Rolling 24-hour spending limit |
| `max_per_recipient_per_day` | Per-recipient daily cap |
| `cooldown_seconds` | Minimum wait between transactions |
| `require_confidence` | LLM confidence threshold (0.0 -- 1.0) |
| `whitelist_recipients` | Allowed recipient addresses |
| `time_window` | Operating hours (timezone-aware) |

## Project Structure

```
oikos/
├── wallet-isolate/            # Bare Runtime wallet process (unchanged)
│   └── src/
│       ├── ipc/               # IPC message types, listener, responder
│       ├── policies/          # PolicyEngine (8 rules) + presets
│       ├── wallet/            # WDK wallet manager + chain config
│       ├── executor/          # THE single code path that moves funds
│       ├── audit/             # Append-only JSON-lines audit log
│       ├── erc8004/           # On-chain identity (ABI encoder + constants)
│       ├── secret/            # Encrypted seed manager (WDK SecretManager)
│       └── compat/            # Runtime compatibility (bare-fs / node:fs)
├── oikos-app/                 # Agent-agnostic infrastructure (Node.js)
│   └── src/
│       ├── cli.ts             # CLI entry (oikos init, balance, pay, pair, etc.)
│       ├── ipc/               # Wallet IPC client
│       ├── mcp/               # MCP server (21 tools)
│       ├── swarm/             # Hyperswarm P2P (discovery, channels, marketplace, reputation)
│       ├── companion/         # Companion channel (P2P human-agent)
│       ├── x402/              # x402 client (HTTP 402 machine payments)
│       ├── rgb/               # RGB asset issuance + transfers
│       ├── events/            # EventBus (pub/sub) + blockchain indexer
│       ├── pricing/           # Live Bitfinex pricing service
│       ├── dashboard/         # Express server + HTML UI
│       └── config/            # Environment configuration
├── examples/
│   └── oikos-agent/           # Reference LLM agent (optional)
│       └── src/
│           ├── agent/         # Brain core + LLM prompts
│           ├── llm/           # LLM client (Ollama/cloud) + mock
│           └── strategy/      # DeFi strategy module
├── skills/                    # OpenClaw skill definition
│   └── wdk-wallet/SKILL.md
├── scripts/                   # Demo + utility scripts
├── index.js                   # Pear companion entry (Bare-native P2P client)
├── app.js                     # Companion frontend
├── index.html                 # Companion GUI shell
├── policies.example.json      # Example policy configuration
└── package.json               # Workspace root (npm workspaces)
```

## Tech Stack

### Wallet Isolate (Bare Runtime)

| Package | Version | Purpose |
|---------|---------|---------|
| `@tetherto/wdk` | 1.0.0-beta.5 | Core wallet development kit |
| `@tetherto/wdk-wallet-btc` | 1.0.0-beta.5 | Bitcoin wallet module |
| `@tetherto/wdk-wallet-evm` | 2.0.0-rc.1 | EVM wallet module (Sepolia, Ethereum) |
| `@tetherto/wdk-protocol-swap-velora-evm` | 1.0.0-beta.4 | DEX swaps via Velora |
| `@tetherto/wdk-protocol-bridge-usdt0-evm` | 1.0.0-beta.2 | Cross-chain bridge (USDT0) |
| `@tetherto/wdk-protocol-lending-aave-evm` | 1.0.0-beta.3 | Yield via Aave lending |
| `@tetherto/wdk-secret-manager` | 1.0.0-beta.3 | Encrypted seed persistence |

### Oikos App (Node.js -- Agent-Agnostic Infrastructure)

| Package | Version | Purpose |
|---------|---------|---------|
| `hyperswarm` | 4.16.0 | P2P DHT discovery + Noise encryption |
| `protomux` | 3.10.0 | Multiplexed protocol channels |
| `express` | 4.21.2 | Dashboard HTTP server (localhost-only) |
| `sodium-universal` | 5.0.1 | Cryptographic primitives |
| `@tetherto/wdk-pricing-bitfinex-http` | 1.0.0-beta.1 | Live Bitfinex price feed |
| `@tetherto/wdk-pricing-provider` | 1.0.0-beta.1 | Price aggregation |

### Reference Agent (examples/oikos-agent -- Optional)

| Package | Version | Purpose |
|---------|---------|---------|
| `openai` | 4.85.4 | LLM client (Ollama-compatible) |

## Testing

```bash
npm test    # Runs tests in both workspaces
```

**140 tests, 0 failures** across two workspaces:

- **wallet-isolate** (105 tests): PolicyEngine rule coverage, executor rejection proofs, IPC schema validation, audit append-only guarantees, encrypted seed manager, ERC-8004 encoding
- **oikos-app** (35 tests): Swarm topic derivation, reputation scoring, companion authentication, x402 payment flows, MCP tool handlers

Critical invariants proven by tests:
- A proposal rejected by PolicyEngine **never** results in a signed transaction
- Malformed IPC messages are silently dropped and logged
- The audit log is append-only -- no updates, no deletes
- Companion channel rejects unauthenticated peers

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `WALLET_SEED` | (placeholder) | 24-word BIP-39 seed phrase |
| `POLICY_FILE` | `policies.json` | Policy configuration path |
| `AUDIT_LOG_PATH` | `audit.jsonl` | Audit log output path |
| `LLM_MODE` | `local` | `local` (Ollama), `cloud`, or set `MOCK_LLM=true` |
| `OLLAMA_URL` | `http://localhost:11434/v1` | Ollama endpoint |
| `OLLAMA_MODEL` | `qwen3:8b` | Local LLM model |
| `MOCK_LLM` | `false` | Enable deterministic mock mode |
| `MOCK_EVENTS` | `true` | Use fixture event data |
| `DASHBOARD_PORT` | `3420` | Dashboard HTTP port |
| `ERC8004_ENABLED` | `false` | Enable on-chain identity registration |
| `COMPANION_ENABLED` | `false` | Enable P2P companion channel |

## Track 1 Requirements

| Requirement | Implementation |
|---|---|
| **MUST**: Use WDK primitives | `@tetherto/wdk` for wallet creation, signing, and accounts in Bare Runtime |
| **MUST**: Hold/manage USDt/USAt/XAUt | Multi-chain wallet with all three mandatory assets + BTC + ETH |
| **NICE**: Agent/wallet separation | Process isolation -- separate runtime processes, IPC only |
| **NICE**: Safety (permissions/limits) | PolicyEngine with 8 immutable rule types, append-only audit |
| **BONUS**: Composability with other agents | Multi-agent Hyperswarm swarm + MCP server + OpenClaw skill |
| **BONUS**: Open-source LLM | Ollama + Qwen 3 8B (local, sovereign, zero cloud deps) |

## Third-Party Disclosures

All dependencies are open source. Key packages:

- **@tetherto/wdk ecosystem** -- Wallet, chain modules, DeFi protocols, pricing, indexer, secret manager (Tether / ISC)
- **Hyperswarm + Protomux** -- P2P networking stack (Holepunch / MIT)
- **Express** -- HTTP server for localhost dashboard (MIT)
- **OpenAI SDK** -- LLM client, used with local Ollama (Apache 2.0)
- **sodium-universal** -- Cryptographic primitives (MIT)

### Pre-Existing Code

Patterns adapted from the builder's own projects:

- [**tzimtzum_v2**](https://github.com/adrianosousa/tzimtzum_v2) -- WDK Bare compatibility layer, IPC patterns
- [**rgb-c-t**](https://github.com/adrianosousa/rgb-c-t) -- Hyperswarm session management, BLAKE2b topic derivation
- [**rgb-wallet-pear**](https://github.com/adrianosousa/rgb-wallet-pear) -- Pear app architecture, subprocess lifecycle

## License

[Apache License 2.0](LICENSE)
