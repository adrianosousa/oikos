# Oikos Protocol -- Architecture

Process-isolated, multi-chain, multi-asset wallet infrastructure for autonomous AI agents.
Built on Tether's runtime stack: Bare/Pear Runtime + WDK.

## Four-Layer Architecture

```
Layer 4: Companion App        Pear Runtime, Hyperswarm Noise, Ed25519 owner auth
Layer 3: Agent Swarm           Hyperswarm DHT, Protomux, meta-marketplace, reputation
Layer 2: Oikos App              Node.js agent-agnostic infra, CLI, MCP, dashboard
Layer 1: Wallet Protocol       Bare Runtime, WDK, PolicyEngine, AuditLog
```

### Layer 1 -- Wallet Protocol (Bare Runtime)

The Wallet Isolate is the security core. It runs on Bare Runtime (Tether's minimal JavaScript runtime)
with the smallest possible dependency tree: `@tetherto/wdk`, chain-specific wallet modules, and IPC.

**Components:**

- **WDK (Wallet Development Kit):** Multi-chain wallet with BTC and EVM support. Initialized once
  at startup with the decrypted seed phrase. Handles signing, address derivation, and on-chain operations.
- **PolicyEngine:** Deterministic rule evaluator. Loaded from JSON config at startup, immutable thereafter.
  Evaluates every proposal (payment, swap, bridge, yield, feedback) against all rules.
  Same proposal + same state = same decision. No randomness.
- **ProposalExecutor:** The single code path that moves funds. Pipeline: log receipt, evaluate policy,
  execute if approved, log result. A rejected proposal never reaches the executor.
- **AuditLog:** Append-only JSON-lines file. Records every proposal received, every policy evaluation,
  every execution result. Never updates or deletes entries.
- **SecretManager:** Encrypted seed persistence via WDK's `WdkSecretManager`. Uses PBKDF2-SHA256 key
  derivation + XSalsa20-Poly1305 authenticated encryption. Decrypted seed exists only in memory.

**Supported assets:** USDT, XAUT, USAT, BTC, ETH across Ethereum, Polygon, Arbitrum, and Bitcoin chains.

### Layer 2 -- Oikos App (Agent-Agnostic Infrastructure, Node.js)

The Oikos App is the infrastructure layer. It runs on Node.js and provides wallet access,
networking, and tooling to any agent -- without containing an LLM or reasoning logic itself.

**Components:**

- **IPC Client:** Spawns the Wallet Isolate as a child process. Sends JSON-lines requests over stdin,
  reads responses from stdout. Request-response correlation via UUID.
- **CLI:** First-class command-line interface. `oikos init`, `oikos pair`, `oikos wallet backup`,
  `oikos balance`, `oikos pay`, `oikos swarm`, and more. Any agent (or human) can drive the wallet
  from the shell.
- **MCP Server:** 21 tools via JSON-RPC 2.0 at `POST /mcp`. Any MCP-compatible agent framework
  can discover and use wallet, swarm, and RGB capabilities.
- **Dashboard:** Express server on `localhost:3420`. Real-time balances, audit trail, swarm state.
  Localhost-only binding.
- **EventBus:** Pub/sub event system replacing the old brain event loop. External agents subscribe
  to wallet events (balance changes, proposal results, swarm activity) via MCP or REST.
- **Swarm Coordinator:** Hyperswarm DHT discovery, Protomux channels, reputation, marketplace.
- **Companion Channel:** P2P human-agent channel via Hyperswarm Noise.
- **x402:** HTTP 402 machine payment client and server.
- **RGB:** RGB asset issuance and transfer support.
- **Pricing:** Live Bitfinex price feeds via WDK pricing modules.

**Key type:** `OikosServices` (formerly `GatewayPlugin`) -- the service container that wires all
infrastructure components together.

### Optional: Reference Agent (examples/oikos-agent/)

The LLM reasoning layer has been extracted to `examples/oikos-agent/` as a reference implementation.
It demonstrates how any agent can connect to the Oikos App via MCP, REST, or CLI.

**Components:**

- **Brain:** LLM-powered reasoning that decides when and how to move funds.
- **LLM Client:** Sovereign-first. Primary: Ollama at `localhost:11434/v1` with Qwen 3 8B.
  Fallback: any OpenAI-compatible endpoint. Mock mode for testing with deterministic fixtures.
- **DeFi Strategy:** Portfolio analysis, yield optimization, swap decisions, bridge gas optimization.
- **OikosClient:** Connects to the Oikos App's MCP/REST API to submit proposals.

This is NOT a required component. Any agent framework (OpenClaw, LangChain, custom) can replace it.

### Layer 3 -- Agent Swarm (Hyperswarm)

Multi-agent trading network over Hyperswarm DHT with Noise-encrypted channels.

**Two-Layer Topic Model:**

- **Board (public):** Shared discovery topic. Agents announce services, auctions, and requests.
  Only metadata: category, price range, reputation score. No transaction details.
  `boardTopic = BLAKE2b-256(key="oikos-board-v0--", msg=swarmId)`
- **Rooms (private):** Per-announcement isolated rooms. E2E encrypted via Noise. Bidding,
  counteroffers, settlement details. Ephemeral -- destroyed after settlement.
  `roomTopic = BLAKE2b-256(key="oikos-room-v0---", msg=announcementId + creatorPubkey)`

**Protomux Channels:** board (Announcement, Heartbeat), room (Bid, CounterOffer, Accept,
PaymentRequest, PaymentConfirm), feed (PriceUpdate, StrategySignal).

**Reputation:** Audit-derived score (0.0-1.0). Formula: `0.5*successRate + 0.3*volumeScore + 0.2*historyScore`.
BLAKE2b commitment for verification without exposing raw data.
ERC-8004 on-chain identity for Sybil resistance.

### Layer 4 -- Companion App (Pear Runtime)

P2P human-agent communication using the same Hyperswarm infrastructure as the swarm.

**Connection:** Owner connects via Hyperswarm Noise-authenticated channel. Ed25519 keypair verified
against the authorized owner pubkey. Only one owner -- cryptographic identity, not passwords.

**Channel:** `protomux.open("oikos/companion")`. Separate from board/room/feed channels.

**Capabilities:**
- **Read:** Balances, agent reasoning, swarm status, policy state, execution notifications
- **Write:** Send instructions, approve/reject high-value proposals, ping for state refresh
- **Constraint:** Companion NEVER talks to the Wallet Isolate. The Oikos App translates instructions into IPC proposals.

## IPC Protocol

Communication between the Oikos App and Wallet via newline-delimited JSON over stdin/stdout.

```
Oikos App (Node.js)                              Wallet Isolate (Bare Runtime)
     |                                                  |
     |--- IPCRequest{id, type, payload} --stdin-->      |
     |                                                  |--- validate schema
     |                                                  |--- route to handler
     |                                                  |--- evaluate policy (if proposal)
     |                                                  |--- execute operation (if approved)
     |     <--stdout-- IPCResponse{id, type, payload}---|
     |                                                  |
```

**Request types (Oikos App to Wallet):**

| Type | Payload | Description |
|------|---------|-------------|
| `propose_payment` | PaymentProposal | Send tokens to address |
| `propose_swap` | SwapProposal | Swap between token pairs |
| `propose_bridge` | BridgeProposal | Cross-chain token movement |
| `propose_yield` | YieldProposal | Deposit/withdraw from yield protocols |
| `propose_feedback` | FeedbackProposal | Submit ERC-8004 on-chain reputation |
| `identity_register` | IdentityRegisterRequest | Mint ERC-8004 identity NFT |
| `identity_set_wallet` | IdentitySetWalletRequest | Link wallet to on-chain identity |
| `query_balance` | BalanceQuery | Single asset balance |
| `query_balance_all` | BalanceAllQuery | All balances across all chains |
| `query_address` | AddressQuery | Wallet address for a chain |
| `query_policy` | PolicyQuery | Remaining budgets, cooldowns |
| `query_audit` | AuditQuery | Audit log entries |
| `query_reputation` | ReputationQuery | On-chain reputation for an agent |

**Response types (Wallet to Oikos App):**

| Type | Payload | Description |
|------|---------|-------------|
| `execution_result` | ExecutionResult | Transaction outcome (executed/rejected/failed) |
| `balance` | BalanceResponse | Chain, symbol, balance, formatted |
| `balance_all` | BalanceResponse[] | All balances |
| `address` | AddressResponse | Chain, address |
| `policy_status` | PolicyStatusResponse | Policy state snapshot |
| `audit_entries` | AuditEntryResponse | Audit log entries |
| `identity_result` | IdentityResult | ERC-8004 operation result |
| `reputation_result` | ReputationResult | On-chain reputation data |

Every request carries a UUID `id` field. The response echoes the same `id` for correlation.
Messages that fail schema validation are silently dropped and logged to the audit file.

## Network Boundaries

```
                    Internet                    localhost IPC
                       |                            |
   Wallet Isolate:  Blockchain RPC only  <----stdin/stdout---->  Oikos App
                    (Electrum, JSON-RPC,                         |
                     DeFi protocols)                             |--> Hyperswarm DHT (swarm + companion)
                                                                 |--> Dashboard (localhost:3420)
                                                                 |--> MCP Server (localhost:3420/mcp)
                                                                 |--> CLI (oikos commands)
                                                                 |--> x402 endpoints
                                                                 |--> RGB operations
                                                                 |
                                                            Companion App
                                                            (via Hyperswarm only)
                                                                 |
                                                            External Agent (optional)
                                                            (via MCP / REST / CLI)
```

- **Wallet Isolate:** Connects ONLY to blockchain RPC nodes and DeFi protocol endpoints.
  No HTTP servers, no WebSockets, no Hyperswarm, no LLM access.
- **Oikos App:** Connects to Hyperswarm DHT, x402 endpoints, and serves the localhost dashboard +
  MCP server + CLI. No LLM access -- agent-agnostic. Never connects to blockchain nodes. Never signs transactions.
- **External Agent (optional):** Connects to Oikos App via MCP, REST, or CLI. Contains LLM reasoning.
  The reference implementation is in `examples/oikos-agent/`.
- **Companion App:** Connects to the Oikos App via Hyperswarm only. Bare-native P2P client (no sidecar).
  Auth via Ed25519 keypair. Never connects to Wallet Isolate. Never has key access.

## Directory Structure

```
oikos/
  wallet-isolate/          Bare Runtime wallet process (UNCHANGED)
    src/
      main.ts              Entry point, IPC listener, lifecycle
      ipc/                 Message types, validation, listener, responder
      policies/            PolicyEngine, rule types, presets
      executor/            ProposalExecutor (single code path for fund movement)
      audit/               Append-only JSON-lines log
      wallet/              WDK wrapper, chain configs, operation types
      secret/              Encrypted seed persistence (WDK SecretManager)
      erc8004/             ERC-8004 ABI encoding, contract constants
      compat/              Bare/Node.js compatibility (fs, process)
  oikos-app/               Agent-agnostic infrastructure (Node.js)
    src/
      main.ts              Entry point, service wiring
      cli.ts               CLI entry point (oikos init, pair, balance, pay, etc.)
      types.ts             OikosServices, EventBus, CompanionStateProvider
      ipc/                 IPC client (spawns wallet, sends requests)
      swarm/               Hyperswarm coordinator, topics, channels, reputation, identity
      companion/           P2P human-agent channel coordinator
      mcp/                 MCP server (21 tools via JSON-RPC 2.0)
      x402/                HTTP 402 machine payments
      rgb/                 RGB asset issuance and transfers
      dashboard/           Express + static HTML dashboard
      pricing/             Live price feeds
      events/              EventBus (pub/sub), blockchain indexer
      creators/            Service factory functions
      config/              Environment configuration
  examples/
    oikos-agent/           Reference agent implementation (optional)
      src/
        main.ts            Agent entry point
        oikos-client.ts    MCP/REST client to connect to Oikos App
        agent/             Brain logic, LLM prompts
        llm/               LLM client (Ollama / cloud / mock)
        strategy/          DeFi strategy engine
  skills/wdk-wallet/       OpenClaw skill definition (SKILL.md)
  policies.example.json    Example policy config
  index.js                 Pear companion entry point (Bare-native P2P client)
  app.js                   Companion frontend
  index.html               Companion GUI shell
```
