<p align="center">
  <img src="assets/oikos-logo.svg" alt="Oikos Protocol" width="280">
</p>

<h1 align="center">Oikos Protocol</h1>

<p align="center"><strong>Sovereign Agent Wallet Protocol</strong></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/tests-140%20passing-brightgreen.svg" alt="Tests">
  <img src="https://img.shields.io/badge/TypeScript-strict-blue.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tether%20Hackathon-Track%201-purple.svg" alt="Hackathon">
</p>
<p align="center">
  <a href="https://docs.pears.com/"><img src="https://img.shields.io/badge/Pear_Runtime-Holepunch-50af95" alt="Pear Runtime"></a>
  <a href="https://github.com/nicolo-ribaudo/tc39-proposal-wdk"><img src="https://img.shields.io/badge/WDK-Tether-50af95" alt="WDK"></a>
  <a href="https://github.com/tetherto/qvac-fabric-llm.cpp"><img src="https://img.shields.io/badge/QVAC_Fabric-Tether-50af95" alt="QVAC"></a>
</p>

<p align="center">
Process-isolated, multi-chain wallet infrastructure for autonomous AI agents.<br>
Built on Tether's runtime stack — <strong>Bare/Pear Runtime + WDK</strong>.
</p>

<p align="center">
Agents hold <strong>USDt</strong>, <strong>XAUt</strong>, and <strong>USAt</strong>. They reason about money, execute DeFi strategies, and trade with each other over Hyperswarm — all under policy-enforced constraints with full audit trails.
</p>

> **Hackathon:** Tether Hackathon Galactica WDK Edition 1 (DoraHacks)
> **Track:** Track 1 — Agent Wallets
> **Builder:** Adriano Sousa

---

## Why Oikos

Every agent wallet today is a wrapper around an API key. Oikos is different: the wallet runs in a **separate process** from the agent. The agent reasons. The wallet signs. They communicate over IPC. Even if the agent process is compromised, the wallet's policy engine still gates every transaction.

This isn't a chatbot with a wallet plugin — it's **wallet infrastructure**. Agent-agnostic, framework-agnostic, with six integration surfaces. And for humans, a sovereign P2P desktop app to monitor, instruct, and override their agents — no servers, no cloud, just a direct encrypted channel.

---

## Get Started

<table>
<tr>
<td width="50%" valign="top">

### <img src="assets/icon-cpu.svg" width="18" height="18"> For AI Agents

Point your agent at the skill file. It covers setup, seed generation, wallet startup, MCP tools, and policy configuration.

```
skills/wdk-wallet/SKILL.md
```

Or connect via any integration surface:
MCP Server · CLI · Direct IPC · Hyperswarm · x402

</td>
<td width="50%" valign="top">

### <img src="assets/icon-user.svg" width="18" height="18"> For Humans

1. **Oikos Wallet** — Node.js CLI + dashboard
   ```bash
   npm run demo
   # localhost:3420
   ```
2. **Oikos App** — Pear Runtime desktop
   ```bash
   pear run --dev .
   ```
3. **Oikos Mobile** — *Coming soon*

</td>
</tr>
</table>

### Brain Modes

When an external agent (OpenClaw, Claude, etc.) connects via MCP or CLI, it brings its own LLM — no brain config needed. These modes control oikos-wallet's **built-in brain** for standalone and companion use:

| Mode | Config | Requirements |
|------|--------|-------------|
| **Mock** | `BRAIN_TYPE=mock` | Nothing — deterministic demo responses |
| **Local** | `BRAIN_TYPE=ollama` | Ollama running with `oikos-agent` model (Qwen 3 4B fine-tuned) |
| **Remote** | `BRAIN_TYPE=http` | Any OpenAI-compatible endpoint (`LLM_BASE_URL` + `LLM_API_KEY`) |

---

## Architecture

```
                         Oikos Protocol
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │  ┌─────────────────────┐    IPC     ┌────────────────────┐  │
  │  │    OIKOS-WALLET      │ stdin/out │   WALLET ISOLATE    │  │
  │  │    (Node.js)         │◄────────►│   (Bare Runtime)    │  │
  │  │                      │ JSON-lines│                     │  │
  │  │  ┌───────────────┐   │           │  ┌──────────────┐   │  │
  │  │  │ Hyperswarm    │   │           │  │ WDK Core     │   │  │
  │  │  │ Agent Swarm   │   │           │  │ Keys + Signer│   │  │
  │  │  └───────────────┘   │           │  └──────────────┘   │  │
  │  │  ┌───────────────┐   │           │  ┌──────────────┐   │  │
  │  │  │ MCP Server    │   │           │  │ PolicyEngine │   │  │
  │  │  │ Dashboard     │   │           │  │ 8 Rule Types │   │  │
  │  │  └───────────────┘   │           │  └──────────────┘   │  │
  │  │  ┌───────────────┐   │           │  ┌──────────────┐   │  │
  │  │  │ CLI + x402    │   │           │  │ Audit Log    │   │  │
  │  │  │ + RGB         │   │           │  │ Append-Only  │   │  │
  │  │  └───────────────┘   │           │  └──────────────┘   │  │
  │  └─────────────────────┘           └────────────────────┘  │
  │                                                             │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │                  INTEGRATION LAYER                     │  │
  │  │  OpenClaw │ MCP │ CLI │ IPC │ Hyperswarm │ x402       │  │
  │  └───────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────┘
         ▲                    ▲                    ▲
         │                    │                    │
    Oikos App            Any Agent              x402 Clients
    (Pear Runtime)      (MCP/REST/CLI)      (Machine Payments)
```

| Layer | Description |
|-------|-------------|
| **Wallet Protocol** | Process-isolated, policy-enforced multi-chain wallet on Bare Runtime |
| **oikos-wallet** | Agent-agnostic infrastructure: MCP, CLI, dashboard, swarm, x402 |
| **Agent Swarm** | Multi-agent trading over Hyperswarm with Noise E2E encryption |
| **Oikos App** | Pear Runtime P2P desktop app — monitor, instruct, override |

---

## Oikos App

A sovereign desktop application built on Pear Runtime. No servers, no cloud — connects directly to your agent over a **Hyperswarm Noise-encrypted P2P channel**, authenticated with Ed25519 keypairs.

| Tab | What you get |
|-----|-------------|
| **Feed** | Real-time activity stream — payments, swaps, bridges, yield, swarm events. Full audit log with status and error details. |
| **Wealth** | Portfolio valuation, asset allocation chart, live prices (Bitfinex), multi-chain balance breakdown, recent transactions. |
| **Swarm** | Marketplace announcements, peer count, reputation score, economics dashboard (revenue, costs, open/closed deals), tag-based filtering. |
| **Policy Engine** | Edit guardrails (budgets, cooldowns, time windows, confidence thresholds). Manage strategies — load, toggle, approve/reject. View loaded modules. |

**Chat panel** — Always visible. Natural language instructions to the agent with markdown-rendered reasoning responses. Every instruction becomes a policy-evaluated proposal.

**Pairing** — First launch generates an Ed25519 keypair. Exchange pubkeys with your agent. Mutual Noise handshake. No passwords, no accounts.

*The app never talks to the Wallet Isolate directly. It talks to the Agent Brain, which translates instructions into IPC proposals. Process isolation is preserved.*

---

## Features

- **Multi-chain** — Bitcoin testnet + Sepolia (EVM) + any WDK-supported chain
- **Multi-asset** — USDt, XAUt, USAt, BTC, ETH (all three mandatory Tether assets)
- **DeFi operations** — Swaps, bridges, yield — all policy-enforced ¹
- **PolicyEngine** — 8 rule types: per-tx limits, session caps, daily budgets, cooldowns, confidence thresholds, whitelists, time windows
- **Agent Swarm** — Hyperswarm DHT discovery, two-layer topic model (public board + private rooms), audit-derived reputation
- **x402 Machine Payments** — HTTP 402 protocol for commodity services with EIP-3009 signing
- **ERC-8004 On-Chain Identity** — Trustless Agents standard for Sybil-resistant agent reputation
- **Live pricing** — Bitfinex real-time feed via WDK pricing modules
- **Encrypted seed management** — PBKDF2-SHA256 + XSalsa20-Poly1305 via WDK SecretManager
- **Sovereign AI** — Qwen 3 4B, Q8-quantized, LoRA fine-tuned on custom Oikos dataset via [Unsloth](https://unsloth.ai), running on [QVAC Fabric LLM](https://github.com/tetherto/qvac-fabric-llm.cpp) — zero cloud dependencies
- **140 tests passing** — TypeScript strict mode, zero `any` types

> **¹ Testnet note:** DeFi operations (swaps, bridges, yield) use mock implementations in testnet/demo mode. Mainnet operations require funded wallets and live protocol endpoints.

---

## Integration Surfaces

| Surface | Protocol | Use Case |
|---------|----------|----------|
| **OpenClaw Skill** | `skills/wdk-wallet/SKILL.md` | Any OpenClaw agent gets wallet capabilities |
| **MCP Server** | 21 tools via JSON-RPC 2.0 | Any MCP-compatible agent framework |
| **CLI** | `oikos` commands | Shell agents, human operators, scripting |
| **Direct IPC** | stdin/stdout JSON-lines | Embedded use in custom agent processes |
| **Hyperswarm P2P** | Noise-encrypted protomux | Agent-to-agent discovery and negotiation |
| **x402 Payments** | HTTP 402 + EIP-3009 | Machine-to-machine commodity payments |

---

## Security

- **Process isolation** — Wallet Isolate runs in a separate Bare Runtime process. It holds keys, enforces policy, signs transactions. The oikos-wallet process never sees seed material.
- **Single code path** — One path moves funds: `PolicyEngine.evaluate()` → `PaymentExecutor.execute()`. All proposal types go through it.
- **Immutable policy** — Policies load from JSON at startup. No IPC message can modify them.
- **Append-only audit** — Every proposal is recorded. Entries never contain seeds, private keys, or API keys.
- **Encrypted seeds** — WDK SecretManager with PBKDF2-SHA256 key derivation and XSalsa20-Poly1305 authenticated encryption.
- **140 tests prove** — Rejected proposals never reach the signer. Malformed IPC is dropped. Audit log is append-only.

---

## Testing

```bash
npm test
```

**140 tests, 0 failures** across two workspaces:

- **wallet-isolate** (105 tests) — PolicyEngine rules, executor rejection proofs, IPC validation, audit guarantees, encrypted seed manager, ERC-8004 encoding
- **oikos-wallet** (35 tests) — Swarm topics, reputation scoring, companion auth, x402 flows, MCP handlers

---

## Tech Stack

### Wallet Isolate (Bare Runtime)

| Package | Purpose |
|---------|---------|
| `@tetherto/wdk` | Core wallet development kit |
| `@tetherto/wdk-wallet-btc` | Bitcoin wallet module |
| `@tetherto/wdk-wallet-evm` | EVM wallet module (Sepolia) |
| `@tetherto/wdk-secret-manager` | Encrypted seed persistence |

### oikos-wallet (Node.js)

| Package | Purpose |
|---------|---------|
| `hyperswarm` | P2P DHT discovery + Noise encryption |
| `protomux` | Multiplexed protocol channels |
| `express` | Dashboard HTTP server (localhost-only) |
| `@tetherto/wdk-pricing-bitfinex-http` | Live Bitfinex price feed |

### Sovereign AI

| Component | Details |
|-----------|---------|
| **Base model** | Qwen 3 4B |
| **Quantization** | Q8 (8-bit GGUF) |
| **Fine-tuning** | LoRA via [Unsloth](https://unsloth.ai), trained on custom Oikos dataset |
| **Inference** | [QVAC Fabric LLM](https://github.com/tetherto/qvac-fabric-llm.cpp) — Tether's edge-first runtime (Vulkan API) |

---

## Roadmap

- **Mobile Oikos App** — Pear Runtime cross-platform (iOS + Android). Same Hyperswarm P2P channel, native mobile UI via Bare Kit.
- **QVAC + BitNet b1.58** — Natively ternary (1.58-bit) model, LoRA fine-tuned on QVAC Fabric. On-device inference with near-zero power draw.
- **MPP (Machine Payments Protocol)** — [Tempo/Stripe's](https://stripe.com/blog/machine-payments-protocol) open standard for agent payments via HTTP 402 + Shared Payment Tokens. Complementary to x402 — supporting stablecoin and fiat settlement.
- **RGB Protocol** — Full client-validated smart contract implementation with Hyperswarm-based consignment transfer for off-chain RGB state exchange.

---

## Third-Party Disclosures

All dependencies are open source:

- **@tetherto/wdk ecosystem** — Wallet, chain modules, DeFi protocols, pricing, secret manager (Tether / ISC)
- **Hyperswarm + Protomux** — P2P networking stack (Holepunch / MIT)
- **Express** — HTTP server for localhost dashboard (MIT)
- **OpenAI SDK** — LLM client, used with QVAC (Apache 2.0)
- **sodium-universal** — Cryptographic primitives (MIT)
- **Unsloth** — LoRA fine-tuning framework (Apache 2.0)
- **QVAC Fabric LLM** — Tether's edge inference runtime (Apache 2.0)

---

[Apache License 2.0](LICENSE)
