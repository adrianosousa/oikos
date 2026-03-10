# Oikos Protocol -- Architecture

Process-isolated, multi-chain, multi-asset wallet infrastructure for autonomous AI agents.
Built on Tether's runtime stack: Bare/Pear Runtime + WDK.

## Four-Layer Architecture

```
Layer 4: Companion App        Pear Runtime, Hyperswarm Noise, Ed25519 owner auth
Layer 3: Agent Swarm           Hyperswarm DHT, Protomux, meta-marketplace, reputation
Layer 2: Autonomous Agent      Node.js Brain, LLM reasoning, DeFi strategy
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

### Layer 2 -- Autonomous Agent (Node.js)

The Agent Brain is the reasoning layer. It runs on Node.js and decides when and how to move funds.

**Components:**

- **LLM Client:** Sovereign-first. Primary: Ollama at `localhost:11434/v1` with Qwen 3 8B.
  Fallback: any OpenAI-compatible endpoint. Mock mode for testing with deterministic fixtures.
- **DeFi Strategy:** Portfolio analysis, yield optimization, swap decisions, bridge gas optimization.
  Produces structured `ProposalCommon` objects sent to the Wallet via IPC.
- **IPC Client:** Spawns the Wallet Isolate as a child process. Sends JSON-lines requests over stdin,
  reads responses from stdout. Request-response correlation via UUID.
- **Dashboard:** Express server on `localhost:3420`. Real-time balances, audit trail, swarm state,
  agent reasoning. Localhost-only binding.
- **Event Processing:** Platform-agnostic event source. Processes events, reasons about them with LLM,
  produces proposals when financial action is appropriate.

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
- **Constraint:** Companion NEVER talks to the Wallet Isolate. Brain translates instructions into IPC proposals.

## IPC Protocol

Communication between Brain and Wallet via newline-delimited JSON over stdin/stdout.

```
Brain (Node.js)                                  Wallet Isolate (Bare Runtime)
     |                                                  |
     |--- IPCRequest{id, type, payload} --stdin-->      |
     |                                                  |--- validate schema
     |                                                  |--- route to handler
     |                                                  |--- evaluate policy (if proposal)
     |                                                  |--- execute operation (if approved)
     |     <--stdout-- IPCResponse{id, type, payload}---|
     |                                                  |
```

**Request types (Brain to Wallet):**

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

**Response types (Wallet to Brain):**

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
   Wallet Isolate:  Blockchain RPC only  <----stdin/stdout---->  Agent Brain
                    (Electrum, JSON-RPC,                         |
                     DeFi protocols)                             |--> LLM (Ollama / cloud API)
                                                                 |--> Hyperswarm DHT (swarm + companion)
                                                                 |--> Dashboard (localhost:3420)
                                                                 |--> x402 endpoints
                                                                 |
                                                            Companion App
                                                            (via Hyperswarm only)
```

- **Wallet Isolate:** Connects ONLY to blockchain RPC nodes and DeFi protocol endpoints.
  No HTTP servers, no WebSockets, no Hyperswarm, no LLM access.
- **Agent Brain:** Connects to LLM, Hyperswarm DHT, x402 endpoints, and serves the localhost dashboard.
  Never connects to blockchain nodes. Never signs transactions.
- **Companion App:** Connects to Agent Brain via Hyperswarm only. Never connects to Wallet Isolate.
  Never has key access.

## Directory Structure

```
oikos/
  wallet-isolate/          Bare Runtime wallet process
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
  agent-brain/             Node.js reasoning process
    src/
      main.ts              Entry point, orchestration
      agent/               Brain logic, LLM prompts
      ipc/                 IPC client (spawns wallet, sends requests)
      llm/                 LLM client (Ollama / cloud / mock)
      swarm/               Hyperswarm coordinator, topics, channels, reputation, identity
      companion/           P2P human-agent channel coordinator
      mcp/                 MCP server (JSON-RPC 2.0 tools)
      x402/                HTTP 402 machine payments
      strategy/            DeFi strategy engine
      dashboard/           Express + static HTML dashboard
      pricing/             Live price feeds
      events/              Event source, blockchain indexer
  skills/wdk-wallet/       OpenClaw skill definition (SKILL.md)
  policies.example.json    Example policy config
  index.js                 Pear Runtime entry point
  index.html               Pear Runtime GUI shell
```
