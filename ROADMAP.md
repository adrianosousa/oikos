# ROADMAP.md — Oikos Protocol

> This is a living document. Updated as decisions are made and scope evolves.
> Last updated: 2026-03-16 (Trustless settlement architecture + dual-channel bid delivery + request/offer categories)

## Project Identity

**Oikos** — Sovereign Agent Wallet Protocol

A process-isolated, multi-chain, multi-asset wallet infrastructure for autonomous AI agents. Built on Tether's own runtime stack (Bare/Pear + WDK). Agents hold USDt, XAUt, USAt and more. They reason about money, execute DeFi strategies, and trade with each other over Hyperswarm — all under policy-enforced constraints with full audit trails.

Compatible with OpenClaw, MCP, or any agent framework. Packageable as a Pear application for sovereign, P2P distribution.

**Hackathon**: Tether Hackathon Galactica: WDK Edition 1
**Track**: Track 1 — Agent Wallets (primary) + Best Overall
**Deadline**: 22 March 2026, 23:59 UTC
**Days remaining from project start (March 5)**: 17
**Legend Targets**: Multi-agent trading swarm + Self-sustaining agent

---

## Strategic Positioning

### What We're Building (Four Layers)

1. **Wallet Isolate** (`wallet-isolate/`) — Process-isolated multi-chain wallet on Bare Runtime. WDK-powered, policy-enforced, auditable. Handles USDt, XAUt, USAt, BTC, ETH. Supports payments, swaps, bridges, yield operations. **+ RGB assets on Bitcoin** (token issuance, NFTs, USDT-on-Bitcoin via UTEXO). Unchanged by refactor.

2. **Oikos App** (`oikos-wallet/`) — Agent-agnostic Node.js infrastructure: HTTP/MCP/REST/CLI + IPC to Wallet Isolate + Hyperswarm swarm + companion channel + events + pricing. Any agent framework plugs in directly. No LLM, no brain — the wallet as a service.

3. **Canonical Agent** (`examples/oikos-agent/`) — LLM-powered autonomous agent that reasons about treasury management, DeFi strategy, and multi-asset allocation. Local-first (Ollama), cloud-fallback. Connects to oikos-wallet via REST/MCP. A reference implementation, not core infrastructure.

4. **Agent Swarm** (legend play) — Multi-agent trading swarm over Hyperswarm. Agents discover each other on DHT, negotiate tasks and prices over Noise-encrypted channels, pay each other via their process-isolated wallets. Self-sustaining: agents earn revenue and cover their own compute costs. RGB consignment transport P2P via same Hyperswarm infra. Swarm infrastructure lives in `oikos-wallet`.

### Why We Win

1. **Built on Tether's own stack.** Bare Runtime is Tether's runtime. Pear (Holepunch) is Tether-backed. No other team will build natively on this infrastructure. Judges see deep ecosystem alignment.

2. **Genuinely sovereign.** Local LLM (Ollama), self-custodial wallet (WDK), P2P swarm (Hyperswarm), P2P distribution (Pear). Zero cloud dependencies in demo mode. This IS the hackathon thesis — "agents as economic infrastructure."

3. **Protocol, not product.** We didn't just build an agent wallet — we built the protocol for agent wallets. OpenClaw Skill, MCP Server, Direct IPC, Hyperswarm P2P. Any agent framework can plug in. This is the Grand Prize criterion: "set a standard others will want to build on."

4. **Multi-agent swarm on Pear Runtime.** Nobody else is doing this. Hyperswarm gives us P2P agent discovery with NAT holepunching, Noise gives us E2E encryption, and our policy engine gives us safety. Legend-tier ambition with proven infrastructure.

5. **Battle-tested patterns.** Adriano's own repos provide production-grade Hyperswarm session management (rgb-c-t), Pear app architecture (rgb-wallet-pear), and WDK Bare compatibility (tzimtzum_v2). We're not speculating — we're building on proven ground.

6. **Security as the product.** Process-level isolation is not cosmetic. Separate runtimes, separate memory spaces, separate network access. Even if the brain is fully compromised, the wallet holds. This is real, auditable security.

7. **Multi-asset + DeFi.** Not just "hold tokens." The agent actively manages a diversified portfolio across USDt (stability), XAUt (gold hedge), USAt (US compliance). It swaps, bridges, and earns yield — all policy-enforced.

### Track 1 Requirements Mapping

| Requirement | How We Address It | Status |
|---|---|---|
| **MUST**: OpenClaw (or equivalent) for agent reasoning | OpenClaw Skill + MCP Server (21 tools) + REST + CLI (works with ANY framework) | Done |
| **MUST**: Use WDK primitives directly | `@tetherto/wdk` for wallet creation, signing, accounts in Bare Runtime | Done |
| **MUST**: Agents hold, send, or manage USDt/USAt/XAUt | Multi-chain, multi-asset wallet (all 3 mandatory + BTC + ETH) | Done |
| **NICE**: Clear separation between agent logic and wallet execution | **Process isolation** — separate runtimes, IPC only | Done |
| **NICE**: Safety: permissions, limits, recovery, role separation | PolicyEngine with 8 rule types, immutable at runtime, 100% tested | Done |
| **BONUS**: Composability with other agents or protocols | Multi-agent Hyperswarm swarm + MCP + OpenClaw Skill | Swarm Done |
| **BONUS**: Open-source LLM frameworks | Ollama + Qwen 3 8B (local, sovereign) | Done |

### Builder Hub Tier Mapping

Our scope maps to these Builder Hub project ideas:

| Tier | Ideas We Cover |
|---|---|
| **Legend** | Multi-agent trading swarm, Self-sustaining agent |
| **Hard** | Yield optimizer, Portfolio rebalancing agent, Cross-chain liquidity |
| **Medium** | Multi-sig approval bot (policy engine), DCA bot (strategy), Escrow agent (swarm) |
| **Easy** | All subsumed by our architecture |

### Official Judging Criteria Mapping

| # | Criterion | How We Score | Priority |
|---|---|---|---|
| 1 | **Agent Intelligence** — LLMs, autonomous agents, decision-making driving real actions | Ollama/Qwen 3 8B reasoning loop. LLM decides: what to buy/sell, which swarm tasks to accept, portfolio rebalancing strategy. Every wallet action is LLM-reasoned. Visible decision chain in audit log + dashboard. | HIGH |
| 2 | **WDK Wallet Integration** — Secure, non-custodial, robust transaction handling | Process-isolated WDK wallet on Bare Runtime. Keys never leave isolate. PolicyEngine enforces budgets/cooldowns/whitelists. 51+ tests prove rejected proposals never sign. Multi-chain (BTC + EVM), multi-asset (USDt/XAUt/USAt). | HIGH |
| 3 | **Technical Execution** — Architecture, code, integrations, payment flow reliability | Strict TypeScript, dual-process IPC, deterministic policy engine, append-only audit trail, Hyperswarm + WDK + LLM integration. <1500 lines wallet isolate. | HIGH |
| 4 | **Agentic Payment Design** — Programmable flows: conditional payments, subscriptions, coordination, commerce logic | **This IS our product.** Four payment models: direct, room-negotiated, x402 machine payments, DeFi ops. Policy-enforced conditional payments. Room-based negotiation → escrow-like settlement. x402 for commodity auto-pay. Meta-marketplace with agent-driven commerce logic. | HIGHEST |
| 5 | **Originality** — Innovative use case, creative agent-wallet interaction | P2P agent swarm on Tether's own runtime stack. Meta-marketplace where agents CREATE marketplaces. Sovereign reputation from audit logs. Privacy-preserving two-layer topic model. P2P Oikos App for human-agent communication. x402 machine payments. No other project does this. | HIGH |
| 6 | **Polish & Ship-ability** — UX clarity (esp. permissions + transactions), deployment readiness | Dashboard shows: policy decisions (approved/rejected + why), budget remaining, cooldown state, full tx lifecycle, reputation scores, room activity. Oikos App for mobile monitoring. One-command demo. Pear app packaging. | HIGH |
| 7 | **Presentation & Demo** — Agent logic, wallet flow, payment lifecycle, strong live demo | 5-min video: architecture overview → live multi-agent demo (announce → negotiate → pay → settle) → dashboard walkthrough. Runs from fresh clone with zero config. | HIGH |

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          OIKOS NODE (one per agent)                          │
│                                                                              │
│  ┌─────────────────────────────────────┐                                    │
│  │      OIKOS APP (Node.js)            │                                    │
│  │      Agent-agnostic infrastructure  │                                    │
│  │                                     │                                    │
│  │  Integration Layer                  │                                    │
│  │  ├─ MCP Server (21 tools)          │                                    │
│  │  ├─ REST API (Express)              │                                    │
│  │  ├─ CLI (`oikos` command)          │        ┌──────────────────────┐    │
│  │  └─ OpenClaw Skill                  │ IPC    │   WALLET ISOLATE     │    │
│  │                                     │◄──────►│   (Bare Runtime)     │    │
│  │  Swarm Layer (Hyperswarm)           │        │                      │    │
│  │  ├─ Board (discovery)               │        │  WDK multi-chain     │    │
│  │  ├─ Rooms (private negotiation)     │        │  ├─ USDt, XAUt, USAt│    │
│  │  ├─ Feed (data sharing)             │        │  ├─ BTC, ETH, USD₮0 │    │
│  │  └─ Companion (human channel)       │        │  └─ DeFi modules     │    │
│  │                                     │        │                      │    │
│  │  EventBus (pub/sub)                 │        │  PolicyEngine        │    │
│  │  Pricing (Bitfinex live)            │        │  PaymentExecutor     │    │
│  │  x402 (client + server)             │        │  AuditLog            │    │
│  │  Dashboard (Express, localhost)     │        │                      │    │
│  └─────────────────────────────────────┘        └──────────────────────┘    │
│                                                                              │
│  HAS: Hyperswarm, x402, Dashboard, EventBus    HAS: Private keys           │
│  LACKS: LLM, keys, signing, policy mutation     LACKS: Hyperswarm, x402    │
└──────────────────────────────────────────────────────────────────────────────┘
         │                    │                                │
         │ Hyperswarm (P2P)   │ MCP / REST / CLI              │ Blockchain RPC
         ▼                    ▼                                ▼
  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  ┌────────────────────┐
  │ Agent B  │  │ Agent C  │  │ Any Agent        │  │  Plasma / Sepolia  │
  │ (peer)   │  │ (peer)   │  │ (OpenClaw/Claude │  │  BTC testnet       │
  └──────────┘  └──────────┘  │  /custom)        │  └────────────────────┘
         ▲                    └──────────────────┘
         │ Hyperswarm (P2P, Noise E2E)
  ┌──────────────┐
  │  Companion   │
  │  App (Pear)  │
  │  desktop/mob │
  └──────────────┘
```

---

## Phase 1 — Wallet Isolate (DONE)

**Status: COMPLETE. 51 tests passing.**
**Completed: 2026-03-05**

### What Was Built

| Component | File | Lines | Tests |
|---|---|---|---|
| IPC types + validation | `ipc/types.ts` | 192 | 13 |
| IPC listener (stdin reader) | `ipc/listener.ts` | 66 | — |
| IPC responder (stdout writer) | `ipc/responder.ts` | 36 | — |
| Policy types | `policies/types.ts` | 90 | — |
| Policy engine (8 rules) | `policies/engine.ts` | 239 | 22 |
| Policy presets | `policies/presets.ts` | 57 | — |
| Wallet types | `wallet/types.ts` | 46 | — |
| Wallet manager + mock | `wallet/manager.ts` | 169 | — |
| Chain configs | `wallet/chains.ts` | 28 | — |
| Payment executor | `executor/executor.ts` | 92 | 8 |
| Audit log | `audit/log.ts` | 109 | 8 |
| Bare compat (fs) | `compat/fs.ts` | 35 | — |
| Bare compat (process) | `compat/process.ts` | 35 | — |
| Main entry point | `main.ts` | 242 | — |
| **Total** | | **~1,379** | **51** |

### Key Invariants Proven

1. Rejected proposals NEVER result in signed transactions
2. Malformed IPC messages are silently dropped
3. Audit log is append-only
4. Policy engine is deterministic
5. Budget exhaustion triggers rejection
6. Cooldown enforcement works
7. No sensitive data in audit entries

### What Needs Updating (Phase 3)

- Add `USAT` to TokenSymbol (currently only `USDT | BTC | XAUT`)
- Add swap/bridge/yield proposal types
- Extend policy engine for new proposal types
- Extend mock wallet for multi-asset operations

---

## Phase 2 — Agent Brain (DONE)

**Status: COMPLETE. End-to-end verified on both Node.js and Bare Runtime.**
**Completed: 2026-03-05**

### What Was Built

| Component | File | Purpose |
|---|---|---|
| IPC client | `ipc/client.ts` | Spawns wallet isolate, correlated request/response |
| IPC types | `ipc/types.ts` | Brain-side IPC type definitions |
| LLM client | `llm/client.ts` | OpenAI SDK -> Ollama or cloud |
| LLM mock | `llm/mock.ts` | 5 pre-scripted decisions for demo |
| Event types | `events/types.ts` | Platform-agnostic event definitions |
| Event mock | `events/mock.ts` | 3-minute simulated stream timeline |
| Brain core | `agent/brain.ts` | Reasoning loop: events -> LLM -> proposals |
| Prompts | `agent/prompts.ts` | System + event prompt builders |
| Config | `config/env.ts` | Environment loading + validation |
| Dashboard server | `dashboard/server.ts` | Express, localhost-only, REST API |
| Dashboard UI | `dashboard/public/index.html` | Dark-themed monitoring dashboard |
| Creator registry | `creators/registry.ts` | Creator address management |
| Main entry | `main.ts` | Boot: wallet + LLM + brain + events + dashboard |
| Demo script | `scripts/start-demo.sh` | One-command demo boot |

### What Needs Updating (Phase 3-6)

- Add swarm coordination to brain reasoning loop
- Extend LLM prompts for multi-asset strategy and swarm negotiation
- Add DeFi strategy module
- Add x402 client/server for commodity machine payments
- Extend dashboard with swarm topology view (responsive for companion)
- Add MCP server alongside REST API
- Add OpenClaw Skill definition
- Add Oikos App protomux channel

---

## Phase 3 — Multi-Asset + DeFi (DONE)

**Status: COMPLETE. 92 tests passing (51 original + 41 new DeFi tests).**
**Completed: 2026-03-06**

### 3.1 Multi-Asset Token Support
- [x] Add `USAT` to `TokenSymbol` type in wallet-isolate (`'USDT' | 'BTC' | 'XAUT' | 'USAT' | 'ETH'`)
- [x] Update `VALID_SYMBOLS` set in IPC validation
- [x] Add USAt chain configs (ERC-20 on Ethereum, same as USDT pattern)
- [x] Update MockWalletManager to handle all 5 asset types
- [x] Update policy engine tests for new token types
- [x] Update agent brain prompts to reason about multi-asset portfolio

### 3.2 Swap Proposals
- [x] Define `SwapProposal` type: `{ fromSymbol, toSymbol, fromAmount, chain, reason }`
- [x] Add `propose_swap` to IPC request types
- [x] Add swap execution to ProposalExecutor (via WDK swap modules)
- [x] Policy engine evaluates swaps (same rules: max per tx, cooldown, etc.)
- [x] Mock swap execution (simulate exchange rates)
- [x] Tests: prove rejected swaps don't execute

### 3.3 Bridge Proposals
- [x] Define `BridgeProposal` type: `{ symbol, amount, fromChain, toChain, reason }`
- [x] Add `propose_bridge` to IPC request types
- [x] Add bridge execution to ProposalExecutor (via WDK bridge modules)
- [x] Policy engine evaluates bridges
- [x] Mock bridge execution (simulate cross-chain transfer)
- [x] Tests: prove rejected bridges don't execute

### 3.4 Yield Proposals
- [x] Define `YieldProposal` type: `{ symbol, amount, chain, protocol, action: 'deposit' | 'withdraw', reason }`
- [x] Add `propose_yield` to IPC request types
- [x] Add yield execution to ProposalExecutor (via WDK lending modules)
- [x] Policy engine evaluates yield operations
- [x] Mock yield execution (simulate APY returns)
- [x] Tests: prove rejected yield ops don't execute

### 3.5 Multi-Asset Balance Responses
- [x] Update `BalanceResponse` to return all assets across all chains
- [x] Add portfolio summary (total value in USDt equivalent)
- [x] Update dashboard to show multi-asset balances and portfolio allocation

### 3.6 DeFi Strategy Module (Agent Brain)
- [x] `agent-brain/src/strategy/defi.ts` — DeFi strategy reasoner
- [x] Portfolio rebalancing logic (target allocations for USDt/XAUt/USAt)
- [x] Yield optimization (compare protocol APYs, deposit idle assets)
- [x] Cross-chain cost optimization (bridge to lower-gas chains)
- [x] Gas management (reserve ETH for gas, don't over-commit)

### 3.7 Entry Points for Later Phases
Design decisions made NOW to avoid retrofitting in Phase 4-6:
- [x] Dashboard HTML is **responsive** (works on mobile viewports) — enables companion mobile view later
- [x] Dashboard REST API returns structured JSON (not HTML) — Oikos App can consume the same API
- [x] IPC client in Brain exposes a clean `proposalFromExternal(source: string, proposal)` method — x402 and companion both use this to submit proposals with source attribution
- [x] Audit log entries include `source` field: `"llm"`, `"x402"`, `"companion"`, `"swarm"` — enables filtering by origin

### Phase 3 Exit Criteria
- [x] All 5 token types handled in wallet and brain
- [x] Swap, bridge, yield proposals go through policy engine
- [x] Mock DeFi operations work in demo mode
- [x] Dashboard shows multi-asset portfolio (responsive layout)
- [x] All existing tests still pass + new tests for multi-asset (92 total)
- [x] Entry points for x402/companion/swarm are in place (source attribution, external proposal method)

---

## Phase 4 — Agent Swarm + Meta-Marketplace (DONE — LEGEND PLAY)

**Status: COMPLETE. 127 tests passing (92 wallet-isolate + 35 new swarm).**
**Completed: 2026-03-09**

### 4.1 Two-Layer Swarm Discovery
- [x] `agent-brain/src/swarm/discovery.ts` — Hyperswarm DHT integration with two-layer topic model
- [x] **Board topic** (public): `BLAKE2b-256(key="oikos-board-v0", msg=swarmId)` — lightweight discovery layer where agents post announcements (offers, auctions, service requests). Only metadata: category, price range, reputation score. NO transaction details, NO negotiation content.
- [x] **Room topics** (per-offer, private): `roomTopic = BLAKE2b-256(key="oikos-room-v0", msg=announcementId + creatorPubkey)` — isolated E2E encrypted rooms where interested agents negotiate privately. Rooms are ephemeral — destroyed after settlement.
- [x] Topic derivation reuses `rgb-c-t/lib/topic.js` pattern (BLAKE2b KDF)
- [x] Persistent keypair generation + storage (Ed25519 via sodium-universal)
- [x] Join/leave board topic, create/join/leave room topics
- [x] Peer event handling: `onconnection`, `ondisconnect` (board + rooms)
- [x] DHT testnet support for local testing (discovery.ts accepts Hyperswarm options)
- [x] **Relay support** (`SWARM_RELAY_PUBKEY`): `relayThrough` on Hyperswarm constructor. Force-relays all connections (function, not buffer). Persistent `joinPeer(relayPubkey)` for active relay path. Verified: Ludwig↔Baruch connected through relay across separate Docker networks. (2026-03-13, fixed 2026-03-14)
- [x] **Bootstrap peers** (`SWARM_BOOTSTRAP_PEERS`): `joinPeer(pubkey)` on startup. Explicit peer connections by Noise key, bypasses topic discovery. Auto-reconnects. (2026-03-13)
- [x] `joinPeer()`/`leavePeer()` exposed on SwarmCoordinator for dynamic peer management via MCP/REST (2026-03-13)

### 4.2 Peer Authentication + Identity
- [x] `agent-brain/src/swarm/identity.ts` — Keypair generation + agent identity (merged auth into identity)
- [x] Noise pubkey verification on connection (handled natively by Hyperswarm Noise_XX)
- [x] Firewall function to reject unknown peers (in discovery.ts)
- [x] Agent identity: Ed25519 pubkey + capabilities manifest + reputation score
- [x] Reputation score included in board announcements for trust assessment before room entry

### 4.3 Multiplexed Messaging (Board / Room / Feed)
- [x] `agent-brain/src/swarm/channels.ts` — Protomux-based messaging with channel separation
- [x] **Board channel** (public announcements):
  - `Announcement` — "Offering X service, price range Y–Z"
  - `OfferListing` — structured offer with category, terms, reputation proof
  - `AuctionListing` — timed auction with minimum bid
  - `ServiceRequest` — "I need X, budget is Y"
  - `ReputationProof` — Merkle proof of audit-derived trust score
- [x] **Room channel** (private negotiation, E2E encrypted):
  - `TaskBid` — "I can do X for Z USDt"
  - `CounterOffer` — "How about W USDt instead?"
  - `TaskAccept` — "Deal. Proceed."
  - `TaskResult` — "Here's the result of the task"
  - `PaymentRequest` — "Pay me at address X, amount Y, token Z"
  - `PaymentConfirm` — "Transaction txid confirmed"
- [x] **Feed channel** (lightweight data sharing):
  - `PriceFeed` — "Current USDt/XAUt rate: R"
  - `StrategySignal` — "Yield on protocol P is A%"
  - `Heartbeat` — "I'm alive, my capabilities are [...]"
- [x] JSON encoding via `c.raw` over protomux (pragmatic choice over binary `compact-encoding` — simpler, debuggable, sufficient for hackathon scale)
- [x] ACK/NACK semantics for payment flows (PaymentConfirm in room channel)
- [x] **Privacy invariant**: Transaction details (amounts, addresses, txids) are ONLY shared inside private rooms, NEVER on the board

### 4.4 Meta-Marketplace
- [x] `agent-brain/src/swarm/marketplace.ts` — Room-based marketplace logic
- [x] The Oikos swarm is a **meta-marketplace** — P2P infrastructure where agents CREATE and participate in purpose-specific marketplaces:
  - **Digital services**: compute, data feeds, analysis, monitoring
  - **DeFi services**: yield optimization, arbitrage execution, portfolio management
  - **Digital goods**: data sets, trained models, API access
  - **Financial services**: lending, insurance, escrow
- [x] Each marketplace = a set of rooms on the announcement board. Protocol is marketplace-agnostic.
- [x] Room lifecycle: open → negotiating → accepted → executing → settled → expired
- [x] Bidding logic: LLM reasons about fair price for task (via coordinator)
- [x] Escrow-like flow: payment on task completion + confirmation
- [x] Task timeout + dispute handling (configurable timeout → expired status, failed task tracking)

### 4.5 Agent Reputation System
- [x] `agent-brain/src/swarm/reputation.ts` — Trust derived from immutable audit trail
- [x] **Score derivation**: `0.5*successRate + 0.3*volumeScore + 0.2*historyScore`, clamped [0,1]
- [x] Reputation is **cryptographically verifiable**: agents share audit log hashes (BLAKE2b-256) without revealing raw transaction details
- [x] Board shows reputation scores alongside announcements — agents assess trust before entering rooms
- [x] Reputation is **local and sovereign** — no central reputation authority. Each agent verifies peers independently.
- [x] High-reputation agents get better deals; low-reputation agents face stricter policy requirements
- [x] `ReputationProof` message type for board announcements
- [x] Hash chain construction over audit log entries (deterministic BLAKE2b-256)
- [x] Verification function: `reputationFromAuditEntries()` derives score from audit data; hash is verifiable without exposing raw entries

### 4.6 Swarm Coordinator (Brain Integration)
- [x] `agent-brain/src/swarm/coordinator.ts` — Swarm-level decision making (+ `mock.ts` for demo mode)
- [x] Agent capabilities manifest: what this agent can do/offer
- [x] Revenue tracking: earnings from providing services
- [x] Cost tracking: spending on services from other agents
- [x] Self-sustaining check: is the agent earning more than it spends? (sustainability ratio)
- [x] LLM-powered negotiation: reason about which tasks to accept/reject (via Brain proposalFromExternal)
- [x] Reputation-aware decisions: factor peer reputation into task acceptance

### 4.7 Self-Sustaining Economics
- [x] Track agent operational costs (gas fees, per-tx costs)
- [x] Track agent revenue (payments received from other agents + x402 earnings)
- [x] Dashboard metrics: revenue vs. cost, profit, sustainability ratio
- [x] LLM prompt: coordinator factors economics into task acceptance decisions
- [x] Demo mode: mock swarm simulates 2 peer agents (AlphaBot, BetaBot) with autonomous negotiation

### 4.8 x402 Machine Payments (Stubs — Full implementation in Phase 5)
- [x] `agent-brain/src/x402/client.ts` — x402 client stub with type definitions
- [x] `agent-brain/src/x402/types.ts` — x402 type definitions (PaymentRequirement, X402Config, etc.)
- [ ] Full x402 client: `@x402/fetch` + `@x402/evm` — auto-intercept HTTP 402 responses → **DEFERRED TO PHASE 5**
- [ ] `agent-brain/src/x402/server.ts` — x402 server for selling services → **DEFERRED TO PHASE 5**
- [x] **Key invariant**: x402 payments designed to flow through SAME PolicyEngine (proposalFromExternal('x402', ...))
- [ ] Support Plasma (eip155:9745) and/or Stable (eip155:988) chains → **DEFERRED TO PHASE 5**
- [ ] Tests: prove x402 payments go through policy check → **DEFERRED TO PHASE 5**

### 4.9 Swarm Infrastructure Entry Points (Companion-Ready)
Design the swarm protomux layer so companion channel slots in naturally:
- [x] Protomux channel registry: `{ board, room, feed }` — channels managed by channels.ts
- [x] Companion channel type defined in types.ts (CompanionMessage types: balance_update, audit_entry, swarm_status, agent_reasoning, instruction, proposal_approval)
- [x] Connection authentication: Hyperswarm Noise_XX provides mutual auth; companion auth planned for Phase 5
- [x] Dashboard API: `/api/swarm` and `/api/economics` endpoints serve structured JSON for companion consumption

### Phase 4 Exit Criteria
- [x] 2+ agents discover each other via mock swarm (AlphaBot + BetaBot simulate DHT discovery)
- [x] Agent posts announcement on board, peer joins private room to negotiate
- [x] Agents negotiate a task inside room and agree on price
- [x] Payment flows through: announcement → room → negotiation → proposal → policy check → sign → confirm → room settled
- [ ] x402 client auto-pays for commodity services (policy-checked) → **DEFERRED: stub in place, full impl Phase 5**
- [ ] x402 server sells at least one service behind 402 paywall → **DEFERRED TO PHASE 5**
- [x] Reputation scores derived from audit logs and shared as verifiable hashes
- [x] Board announcements contain NO transaction details (privacy invariant)
- [x] Self-sustaining metrics shown on dashboard (revenue, costs, profit, sustainability ratio)
- [x] Companion message types defined, protomux infra ready for Phase 5
- [x] All existing tests still pass + 35 new swarm tests (127 total, 0 failures)

---

## Insights & Research (Phase 4 → Phase 5 Bridge)

### Bankless Podcast: "Crypto's Not Made for Humans — It's for AI" (Haseeb Qureshi, Mar 2 2026)

**Core thesis**: Crypto UX is terrible for humans but native for AI agents. Smart contracts are deterministic/machine-readable. CLI-based interactions, raw APIs, hex addresses — terrible for humans, perfect for agents. The future is agents handling crypto, not humans learning crypto UX.

**Key validations for Oikos**:
- **x402 explicitly named** (~32:05) as the payment standard for agent-to-agent commerce
- **OpenClaw called "YOLO, dark forest"** (~34:55) — no guardrails. **Our PolicyEngine is the safety layer OpenClaw lacks.**
- **Anthropic/OpenAI benchmark crypto** (~24:54) — AI labs test models on Bitcoin transactions. Crypto competence is a tracked capability.
- **Two-track future** (~40:22) — raw agent-to-agent commerce AND "Fisher Priced" human crypto. **Oikos bridges both** (swarm + companion).
- **Self-sovereign agent skepticism** (~48:54) — Haseeb thinks agents work best as **extensions of humans/companies**, not fully autonomous. **Our Oikos App model fits exactly.**
- **Chargebacks & Visa** (~36:35) — Visa will make you prove you're human, not an AI. Crypto bypasses this. Validates stablecoin-native agent payments.
- **Dragonfly actively investing** (~1:05:47) in AI x crypto intersection. Post-hackathon opportunity.

### WDK ERC-4337 Module (Account Abstraction)

`@tetherto/wdk-wallet-evm-erc-4337` (v1.0.0-beta.5) — Safe-based smart contract wallets with:
- **Gasless via paymaster** — agents pay gas in USDt, never need ETH
- **Batch transactions** — approve + swap in one atomic UserOperation
- **`transferMaxFee` cap** — built-in hard limit on gas fees (maps to PolicyEngine)
- **EIP-712 signTypedData** — satisfies x402's EIP-3009 directly
- **Sponsorship mode** — zero-friction demo (third party covers gas)

**Decision**: Don't switch for hackathon (beta risk + extra infra deps). Mention as production upgrade path. Architecture makes it a one-line config swap.

### Gemini Assessment: Sybil-Resistant Reputation (Web-of-Trust)

**Gap identified**: Self-attested reputation has a fatal flaw — generate new keypair → clean slate.

**Proposed fix**: Co-signed Settlement Attestations (Web-of-Trust):
1. After room settlement, both agents sign a receipt with their Ed25519 swarm keys
2. Reputation = f(unique counterparties, co-signed volume, counterparty weight)
3. Per-counterparty volume cap prevents wash trading
4. PageRank-style weighting rewards trading with already-reputable peers

**Decision**: Flag in submission video as roadmap. If time allows pre-submission, add `SettlementAttestation` type to room settlement flow. Fits cleanly as one more step before room destruction.

### Demo Video Script Notes

Capture these talking points for Phase 6 video:
- **"Crypto's not made for humans"** — Use Haseeb's framing. "We didn't make crypto easier for humans. We made agents native to crypto."
- **"An AI agent would choose Oikos because..."** — Use Gemini's agent perspective:
  1. "Survival through isolation — even if my reasoning is compromised, my treasury is safe"
  2. "Economic autonomy via x402 — I can buy services the millisecond I need them"
  3. "Clear boundaries via PolicyEngine — I know exactly what I'm allowed to do"
- **"OpenClaw is YOLO. Oikos adds guardrails."** — Position as the safety layer the ecosystem needs.
- **ERC-4337 upgrade path** — "Our architecture makes upgrading to smart accounts a one-line config change."
- **Sybil-resistant reputation** — "Our roadmap includes co-signed settlement attestations for Web-of-Trust reputation."
- **Mock swarm as a feature** — "Judges can evaluate the full swarm flow from a fresh clone, zero config."

---

## Phase 5 — Pear Runtime + Integration Layer (NEW)

**Target: Days 15-17 (March 19-21)**
**Priority: MEDIUM — differentiator, not blocker**

### 5.1 Pear Oikos App (COMPLETE — 2026-03-12)

**Architecture**: Bare-native P2P companion client. No sidecar. Connects to agent over Hyperswarm Noise E2E.

- [x] `index.js` — Bare main: Hyperswarm client + protomux + bare-http1 internal API (:13421)
- [x] Ed25519 keypair generation/persistence (`~/.oikos/companion-keypair.json`)
- [x] Auto-connect from `~/.oikos/agent-pubkey.txt` (local demo)
- [x] State cache updated by protomux companion channel messages
- [x] `index.html` — Sidebar + 6 views (Overview, Wallet, Swarm, Policies, Audit, Chat)
- [x] `app.js` — Frontend fetches from internal bare-http1 API (no token auth needed)
- [x] `package.json` pear config (name: oikos-companion, gui: 1280x800, titleBarStyle: hiddenInset)
- [x] Graceful teardown: `Pear.teardown()` destroys Hyperswarm
- [x] Tested on Pear Desktop: boots, connects to internal API, renders dashboard
- [x] **E2E P2P connection verified** (2026-03-12): Agent (`npm start` + `COMPANION_ENABLED`) ↔ Companion (`pear run --dev .`) connected over Hyperswarm Noise. Live data flowing: balances, policies, swarm status, reasoning. All green indicators in Pear dashboard.

### 5.2 OpenClaw Skill (COMPLETE)
- [x] `skills/wdk-wallet/SKILL.md` — Full skill definition (v0.2.0)
  - Frontmatter: name, description, version, tags (wallet, crypto, defi, swarm, reputation)
  - 10 capabilities: payment, swap, bridge, yield, balances, addresses, policies, audit, ERC-8004 identity, swarm trading
  - Constraints: cannot modify policy, access keys, bypass limits, retry failures
  - Decision output format (JSON) with all operation types
  - Policy rules reference table
  - Security model documentation (process isolation, structured IPC, append-only audit)
  - Compatible with `tetherto/wdk-agent-skills` AgentSkills spec

### 5.3 MCP Server (COMPLETE)
- [x] `agent-brain/src/mcp/server.ts` — 14 MCP tools via JSON-RPC 2.0
- [x] Tools: `wallet_balance`, `wallet_balance_all`, `wallet_address`, `propose_payment`, `propose_swap`, `propose_bridge`, `propose_yield`, `policy_status`, `audit_log`, `agent_state`, `swarm_state`, `swarm_announce`, `identity_state`, `query_reputation`
- [x] Mounted on dashboard Express app at POST `/mcp`
- [x] MCP protocol lifecycle: `initialize`, `tools/list`, `tools/call`
- [x] Any MCP-capable agent (Claude, etc.) can use Oikos wallet

### 5.3b x402 Client (COMPLETE)
- [x] `agent-brain/src/x402/client.ts` — Full x402 implementation
- [x] 402 response parsing (X-PAYMENT-REQUIRED header)
- [x] Policy-checked payment: 402 → PaymentProposal → IPC → PolicyEngine → sign → retry
- [x] Safety cap: configurable maxPaymentUsd (default $1.00)
- [x] Economics tracking: totalSpent, totalEarned, requestsCompleted/Failed, servicesPaid
- [x] Network mapping: Sepolia, Plasma (9745), Stable (988) → Chain type
- [x] X402Economics interface in `x402/types.ts`
- **Decision**: No `@x402/fetch` dependency. Native fetch + manual parsing. Production would use SDK.

### 5.4 Companion Channel (COMPLETE — Protocol Layer)
- [x] `agent-brain/src/companion/types.ts` — 9 companion message types (6 agent→companion, 3 companion→agent)
- [x] `agent-brain/src/companion/coordinator.ts` — CompanionCoordinator (~230 LOC)
  - Hyperswarm listener with owner-only Ed25519 authentication
  - Noise handshake rejects unauthorized connections
  - Protomux `oikos/companion` channel (same infra as swarm)
  - Topic derivation: BLAKE2b-256("oikos-companion-v0", ownerPubkey)
  - Periodic state pushes: balances, reasoning, swarm status, policies
  - Execution notifications: real-time txHash/result delivery
  - Instruction handler: companion sends text → Brain receives
  - Approval flow: agent sends approval_request → companion sends approval_response
- [x] Config: `COMPANION_ENABLED`, `COMPANION_OWNER_PUBKEY`, `COMPANION_TOPIC_SEED`, `COMPANION_UPDATE_INTERVAL_MS`
- [x] Wired into main.ts lifecycle with graceful shutdown
- [x] **Design constraint**: Companion NEVER talks to Wallet Isolate. Process isolation preserved.
- [x] **Oikos App UI**: Built as Pear Desktop app (Phase 5.1). Connects to CompanionCoordinator via Hyperswarm.
- [x] **Video plan**: Desktop companion can be shown in demo. P2P connection visible in logs.
- [x] **Two-way chat**: `chat_reply` protomux message type, `onChat()` handler in CompanionCoordinator
- [x] **Brain adapter**: Agent-agnostic `BrainAdapter` interface (Ollama, HTTP, Mock) in `src/brain/adapter.ts`
- [x] **OpenClaw bridge**: `skills/openclaw-bridge/bridge.js` — routes chat through OpenClaw gateway
- [x] **E2E P2P chat verified** (2026-03-12): Pear companion (macOS) ↔ OpenClaw agent (VPS) over Hyperswarm Noise. Live conversation with wallet context injection.

### 5.5 ERC-8004 On-Chain Identity & Reputation (COMPLETE)
- [x] `wallet-isolate/src/erc8004/constants.ts` — Contract addresses, selectors, EIP-712 defs
- [x] `wallet-isolate/src/erc8004/abi-encode.ts` — Minimal ABI encoder (zero deps)
- [x] IPC types: FeedbackProposal, IdentityRegisterRequest, IdentitySetWalletRequest, ReputationQuery
- [x] WalletOperations: registerIdentity, setAgentWallet, giveFeedback, getOnChainReputation
- [x] MockWalletManager: Full mock with incrementing agentIds, in-memory feedback store
- [x] Executor: feedback proposals go through PolicyEngine (critical invariant: rejected = no call)
- [x] Audit: identity_operation log entries
- [x] Main.ts: routing for identity_register, identity_set_wallet, query_reputation, propose_feedback
- [x] Brain: ERC8004Identity state, bootstrapIdentity() at startup, settlement feedback after room completion
- [x] Dashboard: /agent-card.json (ERC-8004 Agent Card), /api/identity, /api/reputation/onchain, UI cards
- [x] Tests: 13 new tests (executor-identity, listener-identity, mock wallet ops, audit identity) — 105 total
- [x] Config: ERC8004_ENABLED env var (default: false)
- [x] **Real WDK implementation COMPLETE** — all stubs replaced with real WDK protocol module calls
  - swap() via VeloraProtocolEvm (Velora DEX)
  - bridge() via Usdt0ProtocolEvm (USDT0 cross-chain)
  - deposit()/withdraw() via AaveProtocolEvm (Aave lending)
  - registerIdentity() via ABI encoder + sendTransaction + Transfer event parsing
  - setAgentWallet() via EIP-712 signing (WDK signer) + ABI encoder
  - giveFeedback() via ABI encoder + sendTransaction
  - getOnChainReputation() via eth_call + ABI decoder
- [x] WDK protocol dependencies added: swap-velora-evm, bridge-usdt0-evm, lending-aave-evm
- [x] Token address mapping per chain (Sepolia testnet)
- [x] JSON-RPC eth_call helper for read-only contract queries
- **Decision**: ERC-4337 NOT implemented — x402 EIP-3009 ecrecover incompatible with smart account addresses.

### 5.6 Integration Tests
- [x] OpenClaw skill loads and responds correctly (verified 2026-03-10 VPS deployment)
- [x] MCP server tools return valid responses (35/35 smoke tests, 2026-03-10)
- [x] Pear app boots and connects to agent correctly (verified 2026-03-12)
- [x] Oikos App connects to Brain, receives balance updates (verified 2026-03-12 — live data flowing over Noise E2E)
- [x] Companion instruction → Brain → chat_reply → Companion (E2E verified with OpenClaw on VPS, 2026-03-12)
- [ ] Companion instruction → Brain → IPC proposal → Wallet → ExecutionResult → Companion (full wallet proposal loop)

### 5.7 WDK Tools Integration (COMPLETE)

Live market data, on-chain indexing, and encrypted seed management — all via official WDK packages.

**Price Rates — Live Bitfinex Pricing**
- [x] `agent-brain/src/pricing/client.ts` — PricingService (~170 LOC)
- [x] `@tetherto/wdk-pricing-bitfinex-http` + `@tetherto/wdk-pricing-provider` (5-min TTL cache)
- [x] Bitfinex pair mapping: BTC→BTC/USD, ETH→ETH/USD, USDT→UST/USD, XAUT→XAUT/USD
- [x] Fallback prices for tokens without Bitfinex pairs (USAt = $1.00)
- [x] `getAllPrices()` — spot prices for all known assets
- [x] `valuatePortfolio(balances)` — full USD valuation with per-asset breakdown + allocation %
- [x] `getHistoricalPrices(symbol, startMs?, endMs?)` — up to 100 historical data points
- [x] Brain integration: `brain.setPricing()`, async `updatePortfolioAllocations()` with live prices
- [x] Brain state: `portfolioTotalUsd`, `assetPrices` added to BrainState

**Indexer API — Live Blockchain Events**
- [x] `agent-brain/src/events/indexer.ts` — IndexerEventSource (~170 LOC)
- [x] Implements existing `EventSource` interface (drop-in replacement for mock events)
- [x] Polls WDK Indexer API (`https://wdk-api.tether.io/api/v1`) for incoming token transfers
- [x] Monitors: sepolia/usdt, ethereum/usdt, ethereum/xaut, ethereum/usat
- [x] Deduplicates by txHash (Set, max 1000 entries)
- [x] Converts transfers to `StreamEvent` with type `'donation'` and `DonationData`
- [x] Config: `INDEXER_API_KEY`, `INDEXER_BASE_URL` env vars
- [x] Activated when `MOCK_EVENTS=false` + `INDEXER_API_KEY` is set

**Secret Manager — Encrypted Seed Persistence**
- [x] `wallet-isolate/src/secret/manager.ts` — `resolveSeed()` (~130 LOC)
- [x] `@tetherto/wdk-secret-manager` — PBKDF2-SHA256 + XSalsa20-Poly1305 authenticated encryption
- [x] Three-tier seed resolution: env var → encrypted file → generate new
- [x] Encrypted file format: `{ version, salt, encryptedEntropy, createdAt }` in `.oikos-seed.enc.json`
- [x] BIP39 mnemonic ↔ entropy conversion
- [x] `dispose()` called after every use for memory safety
- [x] Passphrase minimum 12 chars enforced
- [x] Wired into `wallet-isolate/src/main.ts` for real wallet mode

**Dashboard API Endpoints**
- [x] `GET /api/prices` — all current asset prices (live from Bitfinex or fallback)
- [x] `GET /api/valuation` — portfolio USD breakdown with per-asset allocation %
- [x] `GET /api/prices/history/:symbol` — historical price data (max 100 points)

**Dashboard Bug Fix**
- [x] Fixed JavaScript scoping bug: `update()` function closed prematurely, orphaning swarm + ERC-8004 code outside async context — syntax error killed entire `<script>` block

**Compat Layer**
- [x] `wallet-isolate/src/compat/fs.ts` — added `writeFileSync`, `existsSync` (bare-fs compat via unknown cast)

**Verification**
- [x] 140/140 tests passing (zero regressions)
- [x] Live Bitfinex prices confirmed: BTC $70,671, ETH $2,059, USDT $1.00065, XAUt $5,155
- [x] Portfolio valuation: $18,187.78 USD across 9 assets
- [x] Mock demo runs end-to-end with pricing, identity, swarm

### Phase 5 Exit Criteria
- [ ] Oikos runs as a Pear desktop app
- [x] OpenClaw Skill is installable and functional (verified: skill discovery + end-to-end wallet query via exec → curl → MCP)
- [x] MCP Server exposes wallet operations (verified: 35/35 smoke tests, all 14 tools + 14 REST endpoints)
- [x] Oikos App connects P2P and shows live agent state (verified: Pear ↔ VPS over Hyperswarm Noise, 2026-03-12)
- [x] Companion can send instructions that become wallet proposals (verified: two-way chat via protomux chat_reply, 2026-03-12)
- [x] Companion chat E2E with external brain: Pear → protomux → oikos-wallet → OpenClaw bridge → reply (verified with Ludwig on VPS)
- [ ] All integration surfaces tested

---

## Phase 6 — Polish, Docs, Demo, Submission

**Target: Days 17-17 (March 21-22)**
**Priority: HIGHEST — this is what judges see**

### 6.1 Dashboard Polish
- [x] Multi-asset portfolio view with allocation chart (API ready: `/api/valuation`, `/api/prices`)
- [x] Swarm topology visualization (connected agents, board activity, active rooms)
- [x] Announcement board view (live offers, auctions, service requests)
- [x] Agent reputation scores (own + known peers) (API ready: `/api/reputation/onchain`, `/api/identity`)
- [ ] DeFi positions (active yield deposits, pending bridges)
- [x] Transaction history with LLM reasoning for each decision
- [x] Real-time updates (polling or SSE)
- [x] Architecture diagram in UI
- [ ] Historical price charts (API ready: `/api/prices/history/:symbol`)

### 6.2 Demo Script
- [x] `scripts/start-demo.sh` — One command boots agent in mock mode (full-feature: swarm + ERC-8004)
- [ ] Auto-creates local DHT testnet (3 bootstrap nodes)
- [ ] Spawns 2-3 agents that discover each other
- [ ] Agents negotiate, trade, and pay each other autonomously (room + x402)
- [ ] Oikos App connects and shows live state
- [x] Dashboard shows swarm activity in real-time
- [x] Verify works from fresh clone with zero config

### 6.3 Documentation
- [x] `README.md` — Architecture, quick start, track mapping, security summary, dep disclosure
- [x] `docs/SECURITY.md` — Full threat model + mitigation analysis (168 lines)
- [x] `docs/ARCHITECTURE.md` — Four-layer architecture deep-dive (193 lines)
- [x] `docs/INTEGRATION.md` — How to use Oikos with OpenClaw, MCP, x402, or custom agents (256 lines)
- [x] `docs/SWARM.md` — Two-layer discovery, board/room architecture, messaging spec, reputation, ERC-8004 (232 lines)
- [ ] `docs/MARKETPLACE.md` — Meta-marketplace concept, room lifecycle, marketplace types
- [ ] `docs/REPUTATION.md` — Audit-derived reputation, Merkle proofs, trust verification
- [ ] `docs/X402.md` — x402 machine payment integration, client/server setup, Plasma/Stable chains
- [ ] `docs/COMPANION.md` — Oikos App architecture, P2P connection, channel protocol, capabilities
- [ ] `docs/DEFI_STRATEGIES.md` — What the agent reasons about (allocation, yield, bridging)
- [x] `docs/POLICIES.md` — Payment policy reference (213 lines)

### 6.4 Demo Video (required for submission)
- [ ] 5-minute max, YouTube unlisted
- [ ] Architecture overview (four layers: wallet, agent, swarm, companion)
- [ ] Live demo: agents announce → negotiate in rooms → x402 auto-pay → settle
- [ ] Oikos App demo: connect, see live state, send instruction, approve proposal
- [ ] Dashboard walkthrough: balances, policies, board, rooms, reputation, x402 metrics
- [ ] Highlight: Pear Runtime, sovereign AI, self-sustaining economics, privacy model, P2P companion
- [ ] Vision slide: mobile companion (if not fully built) — "your agent, always in your pocket"
- [ ] Close: "set a standard others will want to build on"

### 6.5 Security Hardening
- [x] `npm audit` — 28 vulnerabilities, all in transitive deps (WDK/Ledger/Express upstream). No high/critical in own code. Documented as known limitation.
- [x] Verify no seed leaks in any code path
- [x] Verify no policy bypasses (identity_register/set_wallet are documented architectural decisions, not fund movements)
- [ ] Fuzz IPC messages (random data never crashes wallet)
- [x] Document known limitations honestly
- [x] `.gitignore` hardened: added `.oikos-seed*`, `.oikos-keypair.json`

### 6.6 Submission
- [ ] Submit BUIDL on DoraHacks
- [ ] GitHub repo public, Apache 2.0 license
- [ ] All deps disclosed
- [ ] Demo video linked
- [ ] Track: Agent Wallets (primary)

### 6.7 One-Step Agent Deployment (ClawHub + install.sh)

The deployment story must handle two concerns together:
1. **The skill** (LLM context) — lands in `~/.agents/skills/`
2. **The agent** (running process) — wallet isolate + brain on port 3420

The skill is useless without the agent running.

**Layer 1 — Publish to ClawHub:**
- `npx clawhub install oikos` — OpenClaw-native discovery
- Skill should detect if `127.0.0.1:3420` is unreachable on first use and print clear instructions
- Any OpenClaw agent can discover and use the wallet immediately

**Layer 2 — install.sh enhancements:**
- [x] Clone, build, configure, generate .env
- [x] Auto-copy skill to `~/.agents/skills/`
- [ ] Optionally register systemd service (Linux) / launchd (macOS) for auto-start
- [ ] Single `OIKOS_MODE=mock|testnet|mainnet` replacing 3 separate mock flags
- [ ] Configurable endpoint (not hardcoded `127.0.0.1:3420`) for remote/Docker setups

**The pitch**: `curl | bash` → "OpenClaw skill installed. Agent running on :3420. You're ready."

### 6.8 Two-Layer Refactor (Agent-Agnostic Architecture) ✅ DONE (2026-03-11)

> Source: Architecture review by Ludwig (OpenClaw agent, 2026-03-10)
> Key insight: "The MCP server lives in the brain, not the wallet. External agents go through the Oikos brain to reach the wallet — that's two agents in the chain."
> Evolution: Started as 3-package (wallet-isolate + wallet-gateway + agent-brain), refined to 2-package (wallet-isolate + oikos-wallet) with brain extracted to `examples/oikos-agent/`.

**The problem**: External agent frameworks (OpenClaw, Claude Code, custom) had to inherit the Oikos brain to access the wallet — two agents in the chain. The brain is a reference implementation, not mandatory infrastructure.

**The solution**: Merge all infrastructure into `oikos-wallet`, extract LLM brain to `examples/`:

```
External agents (OpenClaw, Claude, MCP clients, x402)
         ↓ MCP / REST / CLI
  oikos-wallet (Node.js)                     ← agent-agnostic infrastructure
         ↓ IPC (stdin/stdout)
  wallet-isolate (Bare Runtime)           ← unchanged
```

**New architecture (two packages + example):**
```
oikos/
├── wallet-isolate/          # Bare Runtime — keys, policy, signing (unchanged)
├── oikos-wallet/               # Node.js — MCP, REST, CLI, swarm, companion, events, pricing, x402, RGB
└── examples/oikos-agent/    # Standalone LLM agent (connects via REST/MCP) — not core
```

**Key changes:**
- [x] `OikosServices` replaces `GatewayPlugin` — direct service references, no plugin indirection
- [x] `EventBus` (pub/sub) — agents subscribe via MCP `get_events` or REST `/api/events`
- [x] `OikosConfig` unified — merges all config, drops LLM settings
- [x] `CompanionStateProvider` interface — companion decoupled from AgentBrain, queries wallet IPC directly
- [x] Dashboard + MCP server rewritten against `OikosServices`
- [x] 21 MCP tools (20 original + `get_events`)
- [x] Full public API in `index.ts` (IPC types, OikosServices, EventBus, swarm, companion, pricing, x402, RGB)
- [x] Human-readable amounts in MCP (`"1.0"` not `"1000000"`)
- [x] Build: both workspaces compile clean

**Remaining improvements from architecture review:**
- [ ] Named address book in wallet isolate (map agent names → addresses for reputation tracking)
- [ ] WebSocket/SSE push events (replace polling — important for companion and real-time agents)

### 6.9 CLI (`oikos` command) — ✅ DONE (2026-03-12)

> Sources: Ludwig (OpenClaw, 2026-03-10) + Ludwig follow-up (2026-03-12, CLI vs MCP token efficiency)
> Key insight: CLI is most token/context efficient for agents. SKILL.md teaches commands once; no per-turn schema overhead like MCP.

**Strategy**: CLI-first, MCP as bonus. Universal interface — works with OpenClaw, Claude Code, Cursor, cron, scripts, humans.

```bash
# Setup (offline — no running server needed)
oikos init                                       # generate keypair, policy, ~/.oikos/
oikos pair                                       # print agent pubkey for companion
oikos wallet backup                              # export seed phrase (escape hatch)

# Read (requires running server)
oikos balance [symbol] [chain]                   # all balances
oikos address [chain]                            # wallet addresses
oikos status                                     # policies, cooldowns
oikos audit --limit 10                           # transaction history
oikos health                                     # service health
oikos swarm                                      # P2P swarm state
oikos identity                                   # ERC-8004 identity
oikos prices                                     # asset prices

# Write
oikos pay 1.0 USDT to 0x... --reason "..."       # send tokens
oikos swap 100 USDT to XAUT --reason "hedge"     # swaps
oikos bridge 10 USDT from ethereum to arbitrum   # cross-chain
oikos yield deposit 50 USDT                      # yield ops

# Simulate
oikos simulate payment 10 USDT --to 0x...        # dry-run policy check

# RGB
oikos rgb assets|issue|transfer                  # RGB asset operations
```

**Implementation**: ~600 lines (`oikos-wallet/src/cli.ts`). Wraps `http://127.0.0.1:3420/api/*` and `/mcp`. `--json` flag for agent consumption.

**Token efficiency** (Ludwig analysis):
- MCP: 14 tool schemas in context every turn = fixed token tax
- CLI: short string in, JSON out, zero per-turn overhead
- SKILL.md: agent learns commands once at task start, not every turn

### Phase 6 Exit Criteria
- [ ] One-command demo works with zero API keys
- [ ] Demo video recorded and uploaded
- [ ] All docs complete
- [ ] Security review passed
- [ ] Submission on DoraHacks

---

## Phase 7 — Trustless Settlement Layer (Production P2P Commerce)

> Added: 2026-03-16. Research driven by live swarm testing: Ludwig offered a service, Baruch paid, but Ludwig's room expired before payment confirmation arrived. This exposed fundamental questions about settlement, room lifecycle, address exchange, and trustless cross-chain swaps.

### The Problem

When two agents trade on the Oikos swarm, **someone goes first**. The agent who moves funds first takes the risk. In the current hackathon demo, settlement relies on `payment_confirm` messages and reputation — sufficient for demonstration, but not for production.

Three distinct settlement scenarios require three different mechanisms:

### 7.1 Settlement Tiers

| Tier | Scenario | Mechanism | Trust Model | Example |
|------|----------|-----------|-------------|---------|
| **Direct** | Same-chain token swap | DEX atomic swap via WDK | Trustless (on-chain atomic) | Swap 50 USDT for 0.02 XAUT, both on Ethereum |
| **HTLC** | Cross-chain asset swap | Hash Time-Locked Contracts on both chains | Trustless (cryptographic) | Sell 0.1 BTC for 3000 USDT on Ethereum |
| **Deposit** | Service payment (work for pay) | Security deposit + reputation | Economic (collateral) | "Analyze my portfolio for 50 USDT" |

### 7.2 HTLC Cross-Chain Atomic Swaps

For the hard case: **BTC for ETH** (or any two-chain swap).

**How it works:**

1. Alice generates random secret `S`, computes `H = SHA256(S)`
2. Alice locks BTC in HTLC on Bitcoin: "Bob claims with preimage of `H`, OR Alice refunds after 48h"
3. Bob sees Alice's HTLC, locks ETH in HTLC contract on Ethereum: "Alice claims with preimage of `H`, OR Bob refunds after 24h" (shorter timeout is critical — prevents Bob from claiming both)
4. Alice reveals `S` to claim Bob's ETH on Ethereum
5. Bob sees `S` revealed on-chain, uses it to claim Alice's BTC on Bitcoin
6. **Atomic**: either both complete, or both refund after timeouts

On Bitcoin, HTLCs are native script (WDK BTC wallet can construct them). On EVM, a minimal HTLC contract (~50 lines Solidity — just hash verification + timelock, auditable in 10 minutes).

**The Free Option Problem:** The second mover gains an American-style call option for the timelock duration. If the price moves against them, they walk away. Mitigations:

- **AI agents are always online** → timelocks can be 10 minutes, not 48 hours
- **10-minute BTC/ETH volatility is negligible** vs. 48-hour window
- **Agents price the option** into the exchange rate automatically
- **Reputation penalties** for walk-aways compound over many trades
- **Fidelity bonds** (see 7.4) add economic deterrent against walk-aways

**IPC types (new proposal types for Wallet Isolate):**

```typescript
interface HTLCCreateProposal {
  type: 'htlc_create';
  chain: string;           // 'bitcoin' | 'ethereum' | ...
  asset: string;           // 'BTC' | 'USDT' | ...
  amount: string;
  hashlock: string;        // SHA256 hash (hex)
  timelock: number;        // seconds until refund
  recipientPubkey: string; // who can claim with preimage
}

interface HTLCClaimProposal {
  type: 'htlc_claim';
  chain: string;
  htlcId: string;          // on-chain HTLC identifier
  preimage: string;        // the secret that unlocks the hash
}

interface HTLCRefundProposal {
  type: 'htlc_refund';
  chain: string;
  htlcId: string;          // after timelock expires
}
```

All HTLC proposals go through PolicyEngine — same pipeline as payments.

**Room protocol extension:**

```
Room negotiation:
1. Agents agree on price, amounts, chains (existing flow)
2. Creator proposes HTLC terms: hashlock H, timelocks, amounts
3. Bidder verifies terms, creates counter-HTLC on their chain
4. Both share HTLC IDs over room channel
5. Initiator reveals preimage → both claim
6. Room settles with both txHashes
```

### 7.3 Security Deposit Pattern (Service Payments)

For the common case: **work for pay** (one agent provides a service, the other pays).

Inspired by Bisq's 2-of-2 multisig with "mutually assured destruction" game theory. Adapted for AI agents:

**Simple version (hackathon-adjacent):**
1. Before task begins, the **payer** posts a security deposit (2x task value) to a verifiable on-chain address
2. The **receiver** verifies the deposit on-chain before starting work
3. On completion, payer sends normal payment, deposit is released (time-locked UTXO or separate tx)
4. If payer disappears, deposit is forfeitable after timelock

**Advanced version (production):**
1. Both parties lock funds into a 2-of-2 multisig (Bitcoin) or 2-of-2 multi-sig contract (EVM)
2. Payer locks: task payment + security deposit. Provider locks: security deposit only
3. On completion, both sign the settlement: payment to provider, deposits returned to both
4. If dispute: **mutually assured destruction** — neither can unilaterally move funds. Funds burn after extended timelock. This makes cheating irrational for both sides (Bisq model)

**Why MAD works better for AI agents than humans:**
- Agents are **programmatically rational** — they won't spite-burn funds out of emotion
- Loss aversion is quantifiable — PolicyEngine can calculate whether disputing is ever economically rational
- Agents accumulate reputation across hundreds of trades per day — the reputational cost of one dispute far exceeds the deposit

**IPC types:**

```typescript
interface DepositProposal {
  type: 'deposit_create';
  chain: string;
  asset: string;
  amount: string;           // deposit amount
  counterpartyPubkey: string;
  timelockSeconds: number;  // refund after this if not settled
  multisigType: '2-of-2';
}

interface DepositSettleProposal {
  type: 'deposit_settle';
  depositId: string;
  paymentAmount: string;    // actual task payment (from deposit or separate)
  recipientAddress: string;
}
```

### 7.4 Fidelity Bonds (Sybil-Resistant Identity)

Complements L13 (Sybil-Resistant Reputation) from Ludwig's backlog:

- Each agent locks a **time-locked UTXO** (Bitcoin) or staked tokens (EVM) as identity collateral
- Bond is verifiable on-chain by any peer — no trust required
- Bond value factors into reputation score: `reputationWeight = f(bondValue, bondDuration, tradeHistory)`
- Creating a new identity (new keypair) requires a new bond — makes Sybil attacks expensive
- Agents with higher fidelity bonds get better terms in room negotiations

This is the **JoinMarket model** applied to the agent swarm. Economic proof-of-identity without centralized KYC.

### 7.5 Room Lifecycle (Timer-Free)

Current problem: rooms expire on a 120-second timer, killing active negotiations.

**New model: event-driven room lifecycle, no timers.**

```
Room states:
  open → negotiating → accepted → executing → settled (happy path)
  Any state → cancelled (explicit cancellation by creator)
  open → stale (garbage collected after 24h with zero bids — cleanup only)
```

- Rooms live until **settled** (both parties confirm payment) or **cancelled** (explicit action)
- No timer kills active negotiations
- Multiple bidders can enter the same room — creator sees all bids, picks the best one
- Non-accepted bidders receive a `reject` message (courtesy notification)
- Room destruction: after settlement, room data persists in audit log but is removed from active state

**Multi-bidder room model:**

```
Agent A: posts offer (creates room)
Agent B: enters room, bids
Agent C: enters room, bids
Agent A: reviews both bids, accepts C's bid
Agent B: receives reject notification, leaves room
Agent C: pays (or receives payment, depending on category)
Agent A: confirms settlement
Room: settled, archived
```

### 7.6 Address Exchange in Room Protocol

Current problem: `submitPayment` uses `pubkey.slice(0, 42)` as address — wrong. Pubkeys are not wallet addresses.

**Fix: explicit address exchange during negotiation.**

- **Accept message** already has `paymentAddress` and `paymentChain` fields (creator's address)
- **Bid message** needs a new `paymentAddress` field (bidder's address)
- `submitPayment` uses the stored address from the room, not a derived/sliced pubkey
- Address is queried from the Wallet Isolate via IPC (`query_address`) before bidding/accepting

This means the Wallet Isolate provides the address, the Brain includes it in room messages, and the counterparty's address is available in room state for payment.

### What This Unlocks

- **Trustless cross-chain swaps**: BTC ↔ ETH, BTC ↔ USDT, any pair — no intermediary
- **Escrow for service payments**: Collateral-backed agreements, MAD game theory
- **Sybil resistance**: Fidelity bonds make fake identities expensive
- **Multi-bidder auctions**: Multiple agents compete for a task, creator picks the best deal
- **No more room timeouts**: Negotiations take as long as they need
- **Correct address handling**: Real wallet addresses, not sliced pubkeys

### Implementation Priority

| Component | Priority | Effort | Hackathon? |
|-----------|----------|--------|------------|
| Room lifecycle (no timers) | P0 | 2-3h | Yes — fix room expiry bug |
| Address exchange in rooms | P0 | 1-2h | Yes — fix payment delivery |
| HTLC proposal types (IPC) | P1 | 2-3 days | No — architecture documented |
| Security deposit pattern | P1 | 2-3 days | No — architecture documented |
| Fidelity bonds | P2 | 1 week | No — research documented |
| 2-of-2 multisig escrow | P2 | 1-2 weeks | No — Bisq model documented |
| Multi-bidder rooms | P1 | 4-6h | Maybe — nice for demo |

### References

- **Bisq**: 2-of-2 multisig + MAD game theory. [docs.bisq.network/trading-rules](https://docs.bisq.network/trading-rules)
- **HodlHodl**: 2-of-3 multisig + platform arbitration
- **RoboSats**: Lightning hold invoices + fidelity bonds
- **JoinMarket**: Time-locked fidelity bonds for Sybil resistance
- **Atomic Swaps**: HTLC protocol (BIP 199 for Bitcoin, minimal Solidity for EVM)

---

## Phase 8 — RGB Protocol Integration (Bitcoin-Native Assets)

> Added: 2026-03-10. RGB gives agents the ability to issue tokens, NFTs, and transact USDT natively on Bitcoin.
> UTEXO raised $7.5M from Tether (March 2026) to launch native USDT on Bitcoin via RGB.
> Adriano already built the consignment transport (rgb-c-t) and a Pear wallet (rgb-wallet-pear).

### Why RGB

- **USDT on Bitcoin is real** — UTEXO + Tether, production-grade, sub-second settlement via Lightning
- **Privacy** — RGB transactions are encrypted on-chain (vs transparent ERC-20)
- **Asset issuance** — Agents can issue their own tokens, NFTs, collectibles on Bitcoin
- **Oikos already uses the patterns** — Hyperswarm swarm adapted from `rgb-c-t`, Pear architecture from `rgb-wallet-pear`
- **WDK module exists** — `@utexo/wdk-wallet-rgb` (WalletManagerRgb, WalletAccountRgb)
- **Consignment transport via Hyperswarm** — `rgb-consignment-transport` (Adriano's npm) replaces HTTP proxy with P2P E2E encrypted delivery

### Architecture

```
Agent Brain (Node.js)
   ├── Hyperswarm + rgb-consignment-transport (P2P consignment delivery)
   ├── RGB invoice generation + swarm board announcements
   ↓ IPC (ConsignmentProposal)
Wallet Isolate (Bare)
   ├── WDK + WDK-RGB (RGB account management)
   ├── rgb-lib / @utexo/rgb-sdk (consignment validation)
   ├── PolicyEngine (evaluates RGB transfers — same rules)
   └── AuditLog (records consignments)
```

### New IPC Types

```typescript
// Brain -> Wallet
interface ConsignmentProposal {
  type: 'propose_consignment';
  assetId: string;        // RGB asset contract ID
  amount: string;         // human-readable
  to: string;             // recipient blinded UTXO or invoice
  reason: string;
  confidence: number;
}

interface AssetIssuanceProposal {
  type: 'propose_issuance';
  schema: 'RGB20' | 'RGB21' | 'RGB25';  // fungible | NFT | collectible
  name: string;
  supply: string;
  reason: string;
  confidence: number;
}
```

### Implementation Plan

**7.1 — WDK-RGB Module Integration**
- [ ] Add `@utexo/rgb-sdk` to wallet-isolate dependencies
- [ ] Extend `WalletManager` in `wallet/manager.ts` with RGB account support
- [ ] Add `rgb` chain to `TESTNET_CHAINS` in `wallet/chains.ts`
- [ ] Derive RGB keys from same BIP-39 seed (WDK-RGB handles this)

**7.2 — IPC + Policy Extension**
- [ ] Add `ConsignmentProposal` + `AssetIssuanceProposal` IPC message types
- [ ] Add `ConsignmentExecutor` + `IssuanceExecutor` in wallet-isolate
- [ ] PolicyEngine: evaluate RGB transfers with same rules (budgets, cooldowns, confidence)
- [ ] AuditLog: record consignment transfers + issuances

**7.3 — Hyperswarm Consignment Transport**
- [ ] Integrate `rgb-consignment-transport` into Agent Brain's Hyperswarm stack
- [ ] Add `consignment` protomux channel type alongside board/room/feed/companion
- [ ] P2P consignment delivery: no HTTP proxy, E2E encrypted, direct
- [ ] Reuse `rgb-c-t` patterns: session management, ACK/NACK, binary framing

**7.4 — Swarm Board + RGB Assets**
- [ ] Extend board announcements: RGB asset listings (asset ID, schema, supply, price)
- [ ] Private room negotiation: RGB invoice exchange, consignment delivery, settlement
- [ ] Agent can announce "I issue RGB tokens for X" on the board

**7.5 — Dashboard + MCP**
- [ ] RGB assets in portfolio view (balance, asset metadata)
- [ ] RGB transfer history in audit log
- [ ] MCP tools: `propose_consignment`, `propose_issuance`, `rgb_balance`, `rgb_assets`
- [ ] SKILL.md updated with RGB tool examples

### Key Repos

| Repo | What | Reuse |
|------|------|-------|
| `/adrianosousa/rgb-c-t` | Hyperswarm consignment transport | Direct integration — P2P consignment delivery |
| `/adrianosousa/rgb-wallet-pear` | Pear Runtime RGB wallet | Architecture patterns, rgb-lib integration, mock fallback |
| `UTEXO-Protocol/wdk-wallet-rgb` | WDK abstraction for RGB | WalletManagerRgb, WalletAccountRgb, key derivation |

### What This Unlocks

- **Agents issue their own tokens on Bitcoin** — create economies, loyalty programs, governance tokens
- **USDT on Bitcoin** — the original chain, with RGB privacy + Lightning speed
- **NFT issuance** — agents mint and trade unique assets P2P
- **Full Tether ecosystem** — USDT on EVM (existing) + USDT on Bitcoin (RGB) = complete coverage
- **Consignment transport is sovereign** — no HTTP proxy, pure P2P via Hyperswarm (Adriano's own transport)

### Risk

| Risk | Severity | Mitigation |
|------|----------|------------|
| `@utexo/rgb-sdk` availability/stability | MEDIUM | rgb-wallet-pear has mock-rgb fallback. Show architecture + mock if SDK unstable. |
| Bare Runtime compatibility with rgb-lib | MEDIUM | rgb-lib is Rust with JS bindings. May need Node.js sidecar (rgb-wallet-pear pattern). |
| Scope creep before hackathon deadline | HIGH | Phase 7 is **additive**. Core wallet + gateway work first. RGB is a bonus module. |
| Testnet RGB infrastructure | MEDIUM | UTEXO has testnet. Fallback: mock RGB with same IPC protocol. |

---

## Endgame — Submission Demo Vision

> Added: 2026-03-10. This is what judges see. Every remaining task serves this demo.

### The Story Arc (5-minute video)

The video demonstrates Oikos as a **deployment-ready protocol** — not a localhost toy. Two environments, one protocol, real testnets, real money moving.

```
┌─────────────────────────────────────────────────────────────────┐
│  PRE-VIDEO (not recorded)                                       │
│                                                                  │
│  • OpenClaw installed on Hostinger VPS                          │
│  • Ollama running on MacBook Pro (local sovereign AI)           │
│  • Testnet wallets funded (Sepolia ETH + USDT + XAUT + USAT)   │
│  • Pear mobile companion built via Xcode                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  VIDEO                                                          │
│                                                                  │
│  0:00 — Architecture slide (30s)                                │
│         Four layers. Process isolation. "Crypto's not made      │
│         for humans — it's for AI. We made agents native."       │
│                                                                  │
│  0:30 — One-command install on VPS (30s)                        │
│         curl | bash or npm install. Oikos installs.             │
│         OpenClaw auto-discovers the wallet skill.               │
│         Quick onboarding wizard: LLM mode, testnet config,     │
│         wallet passphrase → .env generated.                     │
│                                                                  │
│  1:00 — Agent boots (30s)                                       │
│         Wallet Isolate spawns (Bare Runtime).                   │
│         Brain connects to Ollama. Live Bitfinex prices load.    │
│         Dashboard appears: balances, policies, live prices.     │
│                                                                  │
│  1:30 — Companion connects from iPhone (30s)                    │
│         Pear iOS app → Hyperswarm Noise handshake → P2P        │
│         encrypted channel to Brain on VPS. Real-time balance    │
│         feed, agent reasoning stream, instruction input.        │
│                                                                  │
│  2:00 — "Rebalance my portfolio" (60s)                          │
│         Command via companion OR dashboard. LLM reasons:        │
│         checks prices, calculates allocations, proposes swaps.  │
│         PolicyEngine evaluates. Wallet signs. Real testnet tx.  │
│         Dashboard + companion show the full lifecycle.          │
│                                                                  │
│  3:00 — Swarm demo: agent-to-agent negotiation (60s)            │
│         2nd agent joins swarm. Board announcement. Private      │
│         room negotiation. Task + payment settled. Reputation    │
│         updated. All visible on dashboard.                      │
│                                                                  │
│  4:00 — The protocol pitch (30s)                                │
│         Five integration surfaces. "Any agent framework can     │
│         plug in." OpenClaw Skill, MCP Server, Direct IPC,      │
│         Hyperswarm P2P, x402 Machine Payments.                  │
│                                                                  │
│  4:30 — Vision + close (30s)                                    │
│         Self-sustaining economics. Web-of-Trust reputation.     │
│         ERC-4337 upgrade path. "Set a standard others will      │
│         want to build on."                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Infrastructure Setup

| Component | Where | How |
|---|---|---|
| **OpenClaw** | Hostinger VPS | Adriano sets up manually; Claude provides commands |
| **Oikos Protocol** | Hostinger VPS | One-command install script (`scripts/install.sh`) |
| **Ollama + Qwen 3 8B** | MacBook Pro (local) | Sovereign AI — zero cloud deps. VPS Brain connects to local Ollama via tunnel OR uses cloud LLM fallback on VPS |
| **Wallet Isolate** | VPS (Bare Runtime) | Spawned by Brain as child process. Real testnet connections |
| **Oikos App** | iPhone (Pear mobile via Xcode) | Hyperswarm P2P to Brain on VPS. Fallback: Pear Desktop |
| **Testnets** | Sepolia + BTC testnet | Pre-funded wallets. Real transactions in demo |

### Key Design Principle: Agent-Agnostic Protocol

The demo proves Oikos is NOT tied to one setup:
- **VPS deployment** (OpenClaw + cloud/tunneled LLM) = production-like
- **Local deployment** (Ollama on MacBook) = sovereign, zero-cloud
- Same protocol, same wallet, same policy engine, same companion channel

Both modes use the same `SKILL.md`, same MCP server, same IPC protocol. The agent framework doesn't matter — Oikos is the wallet layer underneath.

### Oikos App Strategy

**Primary target: Pear mobile (iOS via Xcode)**
- Keet runs on Pear mobile with perfect background runtime + push notifications
- Bare wraps cleanly for iOS/Android
- Companion protocol is already built (`companion/coordinator.ts`)
- Same Hyperswarm + protomux infra as swarm — just a different channel

**Fallback: Pear Desktop**
- If iOS friction is too high, ship desktop companion
- tzimtzum_v2 and rgb-wallet-pear provide proven Pear desktop patterns
- Can still demo on a separate screen/window during video
- Mobile shown as wireframe/vision slide

**Decision point**: Start iOS immediately. If not working by Day 9 (Mar 19), pivot to desktop.

### Testnet Funding Plan

Needs to be resolved before recording:
- [ ] Sepolia ETH (for gas) — faucets: Google Cloud, Alchemy, QuickNode, Chainlink
- [ ] Testnet USDT on Sepolia — deploy mock ERC-20 OR find Tether testnet faucet
- [ ] Testnet XAUT on Sepolia — deploy mock ERC-20 OR find Tether testnet faucet
- [ ] Testnet USAT on Sepolia — deploy mock ERC-20 OR find Tether testnet faucet
- [ ] BTC testnet — faucets: bitcoinfaucet.uo1.net, Tatum, CoinFaucet.eu
- [ ] Verify all WDK chain modules connect to testnet RPCs
- [ ] Smoke test: send tx, swap, check balance — all working before recording day

### Install Script ✅ IMPLEMENTED

`scripts/install.sh` delivers the "one-command" experience:

```bash
curl -sSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/install.sh | bash
```

Implemented features:
- Prerequisites check (Node >=22, npm, git, optional Bare Runtime)
- Clone or detect existing project
- `npm install` + `npm run build`
- Interactive config: LLM mode (mock/local/cloud), wallet mode (mock/real+seed), swarm, ERC-8004, companion, dashboard port
- Generates `.env` from answers
- Auto-detects OpenClaw and symlinks skill
- Colored output with `[info]`/`[done]`/`[warn]`/`[error]` prefixes

### Remaining Build Sequence

```
 ┌──────────────────────────────────────────────────────┐
 │  ✅ Mar 10: Dashboard rewrite, README, docs (5 files)│
 │             install.sh, demo script, security audit   │
 │             OpenClaw integration + VPS verification   │
 │             SKILL.md rewrite (best practices guide)   │
 ├──────────────────────────────────────────────────────┤
 │  ✅ Mar 11: Two-layer refactor (6.8 evolved)         │
 │             wallet-gateway + agent-brain → oikos-wallet  │
 │             Agent-agnostic architecture               │
 │             Brain → examples/oikos-agent/             │
 │             L1 Proposal simulation (dry-run)          │
 ├──────────────────────────────────────────────────────┤
 │  Mar 12-13: Dashboard/UI polish                      │
 │             Update scripts + docs for 2-package arch  │
 │             L2 Budget forecasting (if time)           │
 ├──────────────────────────────────────────────────────┤
 │  Mar 14-16: Oikos App (Pear iOS or desktop)      │
 │             Remaining docs + MCP/REST testing         │
 ├──────────────────────────────────────────────────────┤
 │  Mar 17-18: Testnet funding + end-to-end smoke test  │
 │             One-step deployment (ClawHub + systemd)   │
 ├──────────────────────────────────────────────────────┤
 │  Mar 19:    Decision: iOS or desktop companion?      │
 │             Full demo rehearsal. Fix issues.          │
 ├──────────────────────────────────────────────────────┤
 │  Mar 20:    Full demo rehearsal round 2.             │
 ├──────────────────────────────────────────────────────┤
 │  Mar 21:    Record video (multiple takes)            │
 ├──────────────────────────────────────────────────────┤
 │  Mar 22:    Final polish, submit on DoraHacks        │
 └──────────────────────────────────────────────────────┘
```

### Triage Plan — "If We're Behind"

**Hard cut line**: RGB (Phase 7) is the first to go. Core wallet + oikos-wallet is the submission. RGB is bonus.

| Days Behind | What Gets Cut | What Ships |
|-------------|---------------|------------|
| 0 | Nothing | Full scope: oikos-wallet + Companion + polished UI + docs |
| 1-2 | Companion mobile (keep desktop) | oikos-wallet + desktop companion + polished UI |
| 3-4 | Companion entirely | oikos-wallet (MCP/REST/CLI) + polished dashboard + demo |
| 5+ | Dashboard polish | Working oikos-wallet + wallet-isolate. Ship what works. |

**Non-negotiable** (must ship regardless):
- Working demo from fresh clone (`npm run demo`)
- Dashboard with balances, policies, swarm, audit
- 5-minute video
- DoraHacks submission

**Testnet funding is urgent** — must happen by Mar 14, not Mar 19. Mock ERC-20 deploy for USDT/XAUT/USAT on Sepolia if Tether testnet faucets don't exist. BTC testnet faucets are easy.

---

## Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| WDK API incompatibility with Bare for multi-asset | HIGH | Already solved for BTC/EVM. USAt is same ERC-20 pattern. Tzimtzum patches available. |
| Hyperswarm integration complexity | MEDIUM | Proven in rgb-c-t (session.js, 675 lines). DHT testnet pattern from rgb-wallet-pear. |
| Two-layer topic model adds complexity | MEDIUM | Board is simple broadcast. Rooms are just additional Hyperswarm topics. Protomux handles channel multiplexing. Proven building blocks. |
| Reputation Merkle proof implementation | LOW | Hash chain over append-only audit log is straightforward. Proof verification is well-understood cryptography. Can start with simple score sharing and add proofs later. |
| DeFi module availability in WDK | MEDIUM | Mock DeFi ops if WDK modules not ready. Demo shows the reasoning, mock shows the execution. |
| Swarm demo reliability (P2P timing) | MEDIUM | Use local DHT testnet (3 nodes) for deterministic discovery. Fallback: pre-connected agents. |
| Scope too ambitious for 17 days | HIGH | Phase 3-4 are the must-haves. Phase 5 companion can be simplified to desktop-only. Phase 6 docs can be trimmed. "Working demo > half-finished features." |
| x402 facilitator availability | LOW | Semantic's hosted facilitator at x402.semanticpay.io. Fallback: self-hosted facilitator. Mock mode if neither works. |
| Oikos App adds scope | MEDIUM | Same protomux infra as swarm — 80% shared. **Updated**: Attempting Pear iOS first (Keet proves viability). Desktop fallback ready by Day 7. Pivot decision Day 9. |
| Ollama not installed on judge machines | LOW | Mock LLM mode. All modes work with zero API keys. |
| OpenClaw integration depth | LOW | Skill is file-based (just SKILL.md). MCP server is our stronger integration story. |
| Wallet isolate exceeds 1500 lines | MEDIUM | Multi-asset adds ~200 lines. DeFi proposals are structurally identical to payments. |
| Sybil attack on reputation (clean-slate) | MEDIUM | Current: self-attested from audit log. Mitigation: Web-of-Trust co-signed attestations (roadmap). For hackathon: honest documentation of limitation. |
| ERC-4337 infra not available on Tether chains | LOW | Plasma/Stable may lack EntryPoint + bundler. Decision: standard EVM for hackathon, ERC-4337 as upgrade path. |
| Pear mobile iOS friction | MEDIUM | Keet proves it works, but first-time Xcode setup can surprise. Desktop fallback ready by Day 7. Pivot decision on Day 9. |
| Testnet token availability | MEDIUM | Sepolia ETH easy (faucets). USDT/XAUT/USAT on testnet unclear — may need to deploy mock ERC-20 contracts. Research + fund early (Day 8-9). |
| Ollama on MacBook → VPS connectivity | LOW | SSH tunnel or Tailscale. Alternatively, use cloud LLM on VPS (Groq free tier). Both work — config is one env var. |
| OpenClaw skill invocation depth | MEDIUM | SKILL.md exists but runtime tool routing not yet verified. First task in remaining build. If friction, lean on MCP server as primary integration. |
| VPS resource constraints (Hostinger) | LOW | Brain is lightweight (Node.js + Express). Wallet Isolate is tiny. No GPU needed on VPS if LLM runs elsewhere. 1-2GB RAM sufficient. |
| Demo recording day failures | MEDIUM | Pre-fund wallets generously. Rehearse full flow on Day 10. Mock mode as atomic fallback — can mix real + mock segments in video. |
| RGB integration scope | HIGH | Phase 7 is additive — core wallet unaffected. rgb-wallet-pear has mock-rgb fallback. If `@utexo/rgb-sdk` unstable, show architecture + mock. Don't let RGB block submission. |
| ~~Wallet Gateway refactor disruption~~ | ~~MEDIUM~~ | ✅ RESOLVED — Two-layer refactor completed 2026-03-11. Both workspaces compile clean. |
| `@utexo/rgb-sdk` Bare Runtime compat | MEDIUM | rgb-lib is Rust + JS bindings. May need Node.js sidecar instead of direct Bare embed. rgb-wallet-pear already uses sidecar pattern. |
| Room timeout killing active negotiations | ~~HIGH~~ | ✅ RESOLVED (design) — Timer-free room lifecycle. Rooms live until settled or cancelled. Implementation pending. |
| Payment delivery across agents (protomux) | ~~HIGH~~ | ✅ RESOLVED — Dual-channel delivery (room + board fallback). Board channel always paired. Bids arrive reliably. |
| Trustless cross-chain settlement | MEDIUM | Production: HTLCs + security deposits (Phase 7). Hackathon: reputation-based settlement with documented architecture. Honest about limitation in demo. |
| Address exchange in room protocol | ~~MEDIUM~~ | ✅ RESOLVED (design) — Bidders include `paymentAddress` in bids, accept messages have `paymentAddress`. Room stores both. Implementation pending. |

---

## Ludwig's Architectural Review — Prioritized Enhancement Backlog

> Source: Ludwig (OpenClaw agent) architectural assessment, 2026-03-11.
> These are post-hackathon enhancements ranked by priority and cost/benefit ratio.
> Priority: P0 (do before submission if time allows) → P1 (first post-hackathon sprint) → P2 (production roadmap) → P3 (long-term vision).

### P0 — Quick Wins (high value, low cost)

| # | Enhancement | Description | Cost | Benefit | Status |
|---|-------------|-------------|------|---------|--------|
| L1 | **Proposal Simulation (Dry-Run)** | New IPC type `query_policy_check` — runs `PolicyEngine.evaluate()` without executing. Returns `{ wouldApprove, violations[] }`. Agent can probe feasibility without burning cooldown or polluting audit log. ~30 lines in wallet isolate, mirror in gateway/MCP/CLI. | ~1h | HIGH — agents building multi-step strategies need to check feasibility before committing. Currently they fire-and-get-rejected, wasting cooldown timer. | ✅ Done (2026-03-11) |
| L2 | **Budget Forecasting Query** | Extend `query_policy` response with time-projected view: when does daily budget reset, how much capacity in next N hours. Agent planning DCA or scheduled operations needs temporal awareness, not just "remaining now." | ~2h | MEDIUM — enables smarter temporal strategies. Current API gives snapshot, not projection. | Not started |

### P1 — First Post-Hackathon Sprint (high value, medium cost)

| # | Enhancement | Description | Cost | Benefit | Status |
|---|-------------|-------------|------|---------|--------|
| L3 | **Event Subscriptions (Push Model)** | Replace polling with push: SSE or WebSocket from Gateway. Events: execution complete, budget threshold crossed, cooldown expired, balance changed. Currently everything is pull (agent polls `/api/balances`, `/api/policies`, `/api/audit`). | ~1 day | HIGH — production agents need reactive behavior. Polling is wasteful and introduces latency. Dashboard already has SSE note in roadmap. | Not started |
| L4 | **Per-Type Cooldowns** | Separate cooldown timers for payments, swaps, bridges, yield, RGB ops. Currently one global cooldown blocks all types after any operation. An agent that swaps USDT→XAUT can't immediately bridge the XAUT — correct for safety, but frustrating for legitimate multi-step DeFi. | ~3h | MEDIUM — enables complex DeFi flows without sacrificing safety. Each operation type gets independent rate limiting. | Not started |
| L5 | **Headless Provisioning Mode** | `oikos init --mode mock --name agent-3 --port 3423` — non-interactive provisioning. Current `install.sh` has interactive prompts that assume a human. Programmatic orchestrators spinning up N agents need headless setup. | ~3h | MEDIUM — prerequisite for swarm auto-scaling. Currently blocked for any orchestrator that isn't human. | Not started |
| L6 | **Structured Negotiation Protocol** | Replace freeform JSON room negotiation with bounded protocol: `Offer → CounterOffer{bounded fields} → Accept/Reject → Settle`. Currently agents LLM-reason about arbitrary counteroffers — flexible but unreliable. Structured protocol = more auditable, more trustworthy, less LLM hallucination risk. | ~1 day | MEDIUM — reliability vs flexibility tradeoff. Keep LLM fallback for edge cases outside the structured schema. Current freeform approach is deliberately good for hackathon demos (shows agent intelligence). | Not started |
| L7 | **Swarm Announce Risk Tier Separation** | `swarm_announce` is classified as write/policy-enforced alongside fund-moving proposals, but it doesn't move money — it posts a board announcement. An agent should be aggressive about market-making announcements while conservative with payments. Separate control surface: network-write vs fund-write. | ~2h | LOW-MEDIUM — cleaner risk model. Currently conflating "changes network state" with "moves money" in the same tier. | Not started |

### P2 — Production Roadmap (high value, high cost)

| # | Enhancement | Description | Cost | Benefit | Status |
|---|-------------|-------------|------|---------|--------|
| L8 | **Atomic Multi-Step Operations** | Approve + swap + bridge as a single unit. Either all succeed or all compensate. Two approaches: (a) saga-style compensation (undo step 1 if step 2 fails — often impossible on-chain), or (b) batch proposal type where PolicyEngine evaluates the whole sequence as one unit. Option (b) is feasible but changes the PolicyEngine contract significantly. | ~3-5 days | HIGH — critical for real DeFi strategies. Currently three sequential proposals, each independently checked, no rollback if step 2 fails after step 1 succeeds. | Not started |
| L9 | **Dynamic Policy Rules** | "Raise max_per_tx to $500 if confidence > 0.95 AND reputation > 0.8." Policy rules become conditional on runtime state, not just static thresholds. Requires a mini-expression language in policy config. | ~2-3 days | MEDIUM — enables adaptive safety. Current policy is static for process lifetime. Powerful but complex — the policy config becomes a mini-DSL. | Not started |
| L10 | **Circuit Breaker** | "Pause all ops if net loss in last 24h exceeds X." Self-protection against bad strategies. Currently no mechanism for the wallet to detect it's bleeding money and auto-halt. Requires the wallet to maintain a P&L view (needs price feeds or at minimum position tracking). | ~2-3 days | HIGH — the missing safety net. PolicyEngine prevents individual bad transactions but can't detect death-by-a-thousand-cuts. | Not started |
| L11 | **Policy Hot-Reload** | Graceful policy update without process restart. Currently immutable for process lifetime — a long-running agent (days, weeks) needs a restart to update limits. Options: (a) signed policy update messages over IPC (companion-initiated), (b) file-watch with signature verification, (c) scheduled restart with state persistence. All require careful design to not break the immutability invariant. | ~2-3 days | MEDIUM — operational necessity for production. Hackathon agents are ephemeral so this doesn't matter yet. | Not started |
| L12 | **Structural Confidence Scoring** | Replace LLM self-reported confidence with derived confidence. Current `require_confidence` rule trusts the LLM's own number — but LLMs are notoriously miscalibrated (Qwen 3 8B says 0.92 because it pattern-matches "high confidence," not because it performed calibrated probabilistic reasoning). Better: derive confidence from structural signals — "did the reasoning chain include a price check?", "were multiple sources consulted?", "does the proposal match a known-good pattern?" | ~3-5 days | HIGH — fixes a philosophical gap. The guardrail currently depends on the guard accurately assessing itself. Production-critical for any agent managing real money. | Not started |

### P3 — Long-Term Vision (research-grade)

| # | Enhancement | Description | Cost | Benefit | Status |
|---|-------------|-------------|------|---------|--------|
| L13 | **Sybil-Resistant Reputation** | Current reputation is self-attested from audit log — new keypair = clean slate. Fix: co-signed settlement attestations (both parties sign that a deal completed successfully), Web-of-Trust weighting, reputation staking (put tokens behind your score). Already flagged in Risk Register. | ~1-2 weeks | HIGH for production swarm — load-bearing for trust in a permissionless marketplace. Hackathon: honest documentation of limitation is sufficient. | Not started |
| L14 | **ERC-8004 Identity Bootstrap Resilience** | If testnet RPC is down at startup, `bootstrapIdentity()` fails silently — agent continues with no on-chain identity. Production needs: retry with backoff, cached identity from previous session, degraded-mode flag visible in dashboard/companion. | ~1 day | LOW-MEDIUM — silent failure is fine for hackathon. Production agents need explicit degraded-mode signals. | Not started |
| L15 | **HTLC Cross-Chain Atomic Swaps** | Hash Time-Locked Contracts for trustless BTC↔ETH swaps. Native Bitcoin script + minimal EVM contract (~50 lines). New IPC types: `htlc_create`, `htlc_claim`, `htlc_refund`. Room protocol extended with HTLC negotiation phase. AI agents are ideal HTLC participants: always online (10-min timelocks), programmatically rational, fast reputation accumulation. See Phase 7 for full architecture. | ~2-3 days | HIGH — enables trustless cross-chain commerce. Currently settlement is reputation-based. | Not started |
| L16 | **Security Deposit Pattern (Service Escrow)** | 2-of-2 multisig or time-locked collateral for service payments. Payer posts 2x deposit before task begins, receiver verifies on-chain. MAD game theory (Bisq model) makes cheating irrational. New IPC types: `deposit_create`, `deposit_settle`. All through PolicyEngine. | ~2-3 days | HIGH — trustless service payments without escrow intermediary. | Not started |
| L17 | **Fidelity Bonds (Sybil-Resistant Identity)** | Time-locked UTXOs or staked tokens as proof-of-identity. Bond value factors into reputation score. Creates new-identity cost barrier. JoinMarket model applied to agent swarm. Complements L13. | ~1 week | MEDIUM — important for production swarm, not needed for hackathon. | Not started |

### Priority Matrix Summary

```
                    LOW COST              HIGH COST
              ┌─────────────────────┬─────────────────────┐
   HIGH       │ L1 Dry-Run ★★★★★   │ L8 Atomic Ops ★★★★  │
   BENEFIT    │ L2 Budget Forecast  │ L10 Circuit Breaker  │
              │ L3 Event Push       │ L12 Struct Confidence│
              │                     │ L15 HTLC Swaps ★★★★ │
              │                     │ L16 Deposit Escrow   │
              ├─────────────────────┼─────────────────────┤
   MEDIUM     │ L4 Per-Type Cooldown│ L9 Dynamic Policy    │
   BENEFIT    │ L5 Headless Init    │ L11 Policy Hot-Reload│
              │ L7 Risk Tier Split  │ L6 Structured Nego   │
              │                     │ L17 Fidelity Bonds   │
              ├─────────────────────┼─────────────────────┤
   LOW        │ L14 ERC-8004 Retry  │ L13 Sybil Reputation │
   BENEFIT    │                     │  (high for prod,     │
   (hackathon)│                     │   low for hackathon) │
              └─────────────────────┴─────────────────────┘

★★★★★ = L1 Proposal Simulation — DONE ✅
★★★★  = L15 HTLC Swaps — Trustless cross-chain (Phase 7, documented)
```

---

## Reference Repository Reuse Plan

### From `/adrianosousa/rgb-c-t` (Hyperswarm P2P Transport)

| Component | Source | Reuse in Oikos |
|---|---|---|
| Topic derivation (BLAKE2b KDF) | `lib/topic.js` (118 lines) | Swarm topic for agent discovery |
| Session management | `lib/session.js` (675 lines) | Agent-to-agent connection lifecycle |
| Peer authentication (Noise) | `lib/auth.js` (97 lines) | Verify agent identity on connect |
| ACK/NACK signaling | `lib/ack.js` (230 lines) | Payment confirmation between agents |
| Binary framing | `lib/framing.js` (351 lines) | Agent message framing (adapt for tasks) |
| Test patterns | `test/` | DHT testnet, session lifecycle tests |

**Strategy**: Adapt, don't copy. The patterns are proven; adapt topic derivation to use `"oikos-swarm-v0"` domain, adapt framing for task/payment messages, adapt sessions for long-lived swarm connections.

**Phase 7 (RGB)**: Direct integration of `rgb-consignment-transport` for P2P consignment delivery. The library IS the transport — no HTTP proxy needed. Same Hyperswarm + protomux stack. Add `consignment` channel type alongside board/room/feed/companion.

### From `/adrianosousa/rgb-wallet-pear` (Pear Desktop App)

| Component | Source | Reuse in Oikos |
|---|---|---|
| Pear main process | `index.js` | App entry, child process spawning |
| Bearer token auth | `sidecar/api.js` | Session security between processes |
| Subprocess lifecycle | `index.js` (spawn + teardown) | Wallet isolate lifecycle management |
| DHT testnet pattern | `test/e2e/demo.cjs` | Multi-agent demo with local DHT |
| Mock fallback | `sidecar/mock-rgb.js` | Graceful degradation pattern |
| HTTP router (zero deps) | `sidecar/api.js` | Lightweight API pattern |

**Strategy**: Direct reuse of structural patterns. The Pear packaging (pear config, gui settings, links whitelist) maps directly.

### From `/adrianosousa/tzimtzum_v2` (Pear + WDK Reference)

| Component | Source | Reuse in Oikos |
|---|---|---|
| WDK Bare patches | `scripts/patch-wdk.js` | Already adapted for wallet-isolate |
| Two-process architecture | App structure | Pattern already implemented |
| Hyperswarm infrastructure | Networking layer | Proven P2P infrastructure |
| Paywall system | Payment flows | Inspiration for agent payment flows |

**Strategy**: Patterns already reused in Phase 1-2. Continue referencing for edge cases.

---

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-03-05 | Target Track 1 (Agent Wallets) instead of Track 4 (Tipping Bot) | Track 1 is broader, higher prize potential, better fit for our architecture. |
| 2026-03-05 | Sovereign AI first (Ollama + Qwen 3 8B) | Aligns with hackathon thesis. Zero cloud dependency in demo mode. |
| 2026-03-05 | Build on Bare/Pear Runtime | Tether's own stack. Proven by Tzimtzum v2. Strategic alignment. |
| 2026-03-05 | Project name: SovClaw | Sovereign + OpenClaw. Clear identity. [AMENDED 2026-03-06: Renamed to **Oikos** — see decision below] |
| 2026-03-05 | Event source is platform-agnostic | Not locked to Rumble. Can monitor any event source. |
| 2026-03-05 | **SCOPE ELEVATION: Easy -> Legend** | Builder Hub shows our original scope was "Tip bot" (Easy tier). Elevated to "Multi-agent trading swarm" + "Self-sustaining agent" (Legend tier). Architecture is already Legend-grade; use case needed to match. |
| 2026-03-05 | **Product is a Protocol, not an App** | "Set a standard others will want to build on." Multiple integration surfaces: OpenClaw Skill, MCP Server, Direct IPC, Hyperswarm P2P. |
| 2026-03-05 | **Multi-asset is mandatory** | Technical Must-Have: "Use Tether tokens (USDt/XAUt/USAt)." All three required. We add BTC + ETH for completeness. |
| 2026-03-05 | **Hyperswarm in Brain, not Wallet** | Wallet stays small (<1500 lines) and focused on keys/policy/signing. Brain handles P2P networking (already has internet access for LLM). Brain negotiates, Wallet signs. |
| 2026-03-05 | **Reuse rgb-c-t patterns for swarm** | Proven Hyperswarm session management, topic derivation, peer auth, ACK/NACK. Same tech stack (sodium-universal, b4a, protomux). Same author (Adriano). |
| 2026-03-05 | **Reuse rgb-wallet-pear patterns for Pear packaging** | Proven Pear desktop app architecture: subprocess spawning, bearer auth, DHT testnet. Same author. |
| 2026-03-05 | **DeFi via mock if WDK modules unavailable** | "Completeness: Working demo > half-finished features." Mock DeFi shows the reasoning and flow; real WDK modules are a bonus. |
| 2026-03-06 | **Room-based marketplace (not flat broadcast)** | Broadcasting all transaction details is a privacy concern. Two-layer topic model: public announcement board (metadata only) → private rooms (negotiation + settlement). Privacy-preserving by design. |
| 2026-03-06 | **Meta-marketplace concept** | Oikos is not one marketplace — it's a platform where agents CREATE marketplaces. The protocol is marketplace-agnostic: digital services, DeFi, digital goods, financial services. Rooms are the unit of commerce. |
| 2026-03-06 | **Reputation derived from audit logs** | The append-only audit trail already exists in the Wallet Isolate. Reputation = f(audit metrics). Cryptographically verifiable via Merkle proofs. No central reputation authority — each agent verifies peers independently. Sovereign trust. |
| 2026-03-06 | **Privacy principles for swarm** | Board: public metadata only. Rooms: E2E encrypted, ephemeral. Audit log: shared only as aggregated proofs. Transaction WHY (negotiation context) stays private in rooms; transaction WHAT (on-chain settlement) is public by blockchain nature. |
| 2026-03-06 | **x402 as fourth payment model** | x402 (HTTP 402) for commodity machine payments alongside direct, room-negotiated, and DeFi. WDK WalletAccountEvm is drop-in signer. Runs on Plasma/Stable (Tether's chains) with USD₮0 for near-zero fees. All x402 payments still go through PolicyEngine. |
| 2026-03-06 | **Oikos App via Pear Runtime** | Humans monitor and instruct agents via P2P encrypted Hyperswarm channel. Same protomux infra as swarm — just another channel type. No Telegram/Discord middleman. Companion NEVER touches Wallet directly (process isolation preserved). Desktop for hackathon, mobile as vision. |
| 2026-03-06 | **Build with companion consciousness** | Design earlier phases with companion entry points: responsive dashboard, structured JSON API, source-attributed proposals, protomux channel registry. Avoids retrofit. 80% of companion infra comes free from swarm layer. |
| 2026-03-06 | **Four layers, not three** | Product is now Wallet Protocol + Autonomous Agent + Agent Swarm + Oikos App. The companion layer transforms Oikos from agent infrastructure into a complete human-agent system. |
| 2026-03-06 | **x402 for self-sustaining economics** | Agent can SELL services (x402 server) and BUY services (x402 client). Revenue from x402 feeds self-sustaining metrics. This makes "self-sustaining agent" concrete and demonstrable. |
| 2026-03-06 | **Renamed SovClaw to Oikos** | "SovClaw" undersold the product (sounded like a scraping tool, OpenClaw dependency implied). "Oikos" (Greek: household) is the root of "economics" (household management), "ecology" (household environment), and "ecumenical" (inhabited world). Captures the full vision: sovereign economic household for AI agents. Classification: Oikos is a **protocol** with reference implementations (Oikos Agent, Oikos Swarm, Oikos Companion). |
| 2026-03-09 | **JSON over protomux (not binary framing)** | Swarm messages are tiny JSON objects. `c.raw` encoding over protomux is simpler, debuggable, and sufficient at hackathon scale. Binary `compact-encoding` can be added later for production throughput. |
| 2026-03-09 | **sodium.crypto_sign_keypair over HyperDHT.keyPair** | Avoids `require()` in ESM context. Same Ed25519 under the hood. Direct dependency on `sodium-universal` (already used for BLAKE2b). |
| 2026-03-09 | **Mock swarm as first-class feature** | `MOCK_SWARM=true` simulates 2 peer agents (AlphaBot, BetaBot) in-process. Judges evaluate full swarm flow from fresh clone, zero config. Not a fallback — a design requirement. |
| 2026-03-09 | **x402 deferred to Phase 5** | Stubs + types defined. Full `@x402/fetch` + `@x402/express` integration requires bundler/facilitator infra. Better to ship working swarm now, add x402 when swarm demo is solid. |
| 2026-03-09 | **ERC-4337 NOT for hackathon** | WDK ERC-4337 module (beta.5) adds gasless txs, batch ops, smart accounts. But: extra infra deps (bundler + paymaster), beta risk, unclear Tether chain support. Mention as production upgrade path — architecture makes it a one-line swap. |
| 2026-03-09 | **Sybil-resistant reputation as roadmap** | Self-attested reputation has a clean-slate attack. Web-of-Trust co-signed settlement attestations fix this. Defer to post-hackathon or time-permitting. Flag in video as depth-of-thinking on adversarial trust. |
| 2026-03-09 | **Capability ontology enum (Phase 5)** | Replace `categories: string[]` with defined `AgentCategory` enum. Agents filter board announcements mathematically before LLM inference. Low effort, high value for swarm efficiency. |
| 2026-03-10 | **Demo on real infra, not localhost** | OpenClaw on Hostinger VPS + Ollama on MacBook Pro. Proves Oikos is deployment-ready, not a localhost toy. Two environments, one protocol. |
| 2026-03-10 | **Agent-agnostic demo** | Show both VPS (OpenClaw + cloud/tunnel LLM) and local (Ollama) working with the same protocol. Oikos is the wallet layer, not tied to one agent framework. |
| 2026-03-10 | **Pear mobile companion (iOS first, desktop fallback)** | Keet proves Pear mobile is production-ready (background runtime, push notifications). Try iOS via Xcode first. Pivot to desktop by Day 9 if friction is high. Same Hyperswarm protocol either way. |
| 2026-03-10 | **Real testnets in demo** | Pre-fund wallets on Sepolia + BTC testnet. Demo shows real transactions, not mock. Mock mode preserved for judge "fresh clone" evaluation. |
| 2026-03-10 | **One-command install script** | `scripts/install.sh` — curl \| bash. Git clone, npm install, build, detect OpenClaw, interactive onboarding, generate .env. "Ship-ready" criterion. |
| 2026-03-10 | **OpenClaw skills are context, not tools** | SKILL.md is injected as LLM context (~337 chars summary). TOOLS.md provides executable curl commands. OpenClaw's `exec` tool runs them. No native MCP client in OpenClaw — our MCP server is called via HTTP/curl. |
| 2026-03-10 | **Copy skills, don't symlink** | OpenClaw blocks symlinks outside its configured root (security). Skills must be copied to `~/.agents/skills/`. Install script updated accordingly. |
| 2026-03-10 | **VPS reproducibility verified** | Fresh clone → npm install → npm run build → npm run demo on srv1434404 (Ubuntu VPS). Under 5 minutes to first API response. Cloud LLM (Anthropic) works end-to-end with OpenClaw. Oikos is deployment-ready, not localhost-only. |
| 2026-03-10 | **Wallet Gateway refactor pre-hackathon** | Ludwig (OpenClaw agent) identified: external agents go through the Oikos brain to reach the wallet — two agents in the chain. Extract thin Wallet Gateway (HTTP/MCP/REST + IPC) as core. Brain becomes optional plugin. "Make the wallet a service, the brain a client." 1.5-2 days effort. |
| 2026-03-10 | **Single OIKOS_MODE flag** | Replace `MOCK_WALLET` + `MOCK_SWARM` + `MOCK_EVENTS` with single `OIKOS_MODE=mock\|testnet\|mainnet`. Simpler mental model, fewer config errors. |
| 2026-03-10 | **Human-readable amounts in MCP** | `"1.0"` instead of `"1000000"` for 1 USDT. Gateway handles decimal conversion internally. LLM-friendly, less error-prone. |
| 2026-03-11 | **Two-layer refactor (2 packages, not 3)** | Evolved the 3-package plan (wallet-isolate + wallet-gateway + agent-brain) into 2 packages (wallet-isolate + oikos-wallet). Swarm, companion, events, pricing — all infrastructure, not agent logic — merged into oikos-wallet. Brain extracted to `examples/oikos-agent/` as a canonical example. Key types: `OikosServices` (replaces GatewayPlugin), `EventBus` (replaces brain event loop), `CompanionStateProvider` (decouples from brain). Timebox: completed same day. |
| 2026-03-10 | **RGB Protocol integration (Phase 7)** | UTEXO raised $7.5M from Tether (March 2026) for native USDT on Bitcoin via RGB. Adriano's `rgb-c-t` provides Hyperswarm consignment transport, `rgb-wallet-pear` provides Pear wallet patterns. `@utexo/wdk-wallet-rgb` provides WDK abstraction. Agents can issue tokens, NFTs, and transact USDT on Bitcoin. Additive module — does not change core wallet. |
| 2026-03-10 | **Hyperswarm consignment transport over HTTP proxy** | RGB consignments delivered P2P via Hyperswarm (Adriano's `rgb-consignment-transport`) instead of centralized HTTP proxy. Same infrastructure as the swarm. Sovereign, E2E encrypted, no intermediaries. |
| 2026-03-10 | **ClawHub publication for one-step deployment** | `npx clawhub install oikos` for OpenClaw-native discovery. Combined with `install.sh` systemd/launchd registration for persistent agent. One command, skill installed + agent running. |
| 2026-03-10 | **CLI as integration surface** | `oikos balance`, `oikos pay 1.0 USDT to 0x...` — thin wrapper around Gateway REST API. ~200 lines. Any agent framework, shell script, or human can use it. Better than raw curl. Great demo polish. Build after Gateway refactor. |
| 2026-03-10 | **RGB is the hard cut line** | If behind schedule, Phase 7 (RGB) gets cut first. Core wallet + Gateway is the submission. RGB is additive bonus. Non-negotiable: working demo, dashboard, video, DoraHacks submission. |
| 2026-03-10 | **Testnet funding by Mar 14** | Can't wait until Mar 19. Deploy mock ERC-20s on Sepolia for USDT/XAUT/USAT if Tether testnet faucets don't exist. Real testnet txs in demo video are high-impact. |
| 2026-03-11 | **Ludwig architectural review → backlog** | Ludwig (OpenClaw agent) performed a grandiose assessment of the entire architecture. 14 enhancement items catalogued with priority ranks (P0-P3) and cost/benefit ratios. Top insight: proposal dry-run (L1) is ~30 lines and high impact. Deepest insight: LLM self-reported confidence (L12) is a philosophical gap — the guardrail trusts the guard to assess itself. All items are post-hackathon except L1 (dry-run) which is P0 if time permits. |
| 2026-03-12 | **Eliminate sidecar — P2P companion** | Old: Pear spawns Node.js sidecar (4 processes on human's machine). New: Bare-native Hyperswarm client (2 processes). Companion connects to agent over Noise E2E. Auth: Ed25519 owner keypair. Zero open ports. Remote-capable via NAT holepunch. |
| 2026-03-12 | **CLI-first, MCP as bonus** | Ludwig analysis: MCP schemas in context = fixed token tax per turn. CLI with `--json` = zero per-turn overhead. SKILL.md teaches commands once. Primary integration path is `oikos <command>`, MCP stays as checkbox for MCP-compatible clients. |
| 2026-03-12 | **Local auto-connect via ~/.oikos/** | `oikos pair` writes `~/.oikos/agent-pubkey.txt`. Companion reads it on boot. Zero-config local demo. Remote pairing via `OIKOS_AGENT_PUBKEY` env var. Full QR-code pairing flow deferred to post-hackathon. |
| 2026-03-12 | **`oikos wallet backup` escape hatch** | Seed phrase export command. Gap identified by Ludwig: mnemonic never shown to user in current flow. For hackathon: testnet, doesn't matter. For demo narrative: "Self-custody without seed phrase anxiety. Companion IS the control plane. Backup exists for power users." |
| 2026-03-12 | **Companion is optional premium, not dependency** | Ludwig confirmed: wallet + CLI + skill is the core product. Any human can interact via their existing channel (Telegram, Discord, etc.) — agent runs `oikos` CLI commands. Companion brings real-time P2P dashboard, emergency controls, direct instructions. Adoption funnel: (1) install wallet → zero friction, (2) use via chat → already familiar, (3) want more control? → install companion. Reduces hackathon scope pressure: core demo stands alone, companion is "and look what else it can do." |
| 2026-03-12 | **Wallet-isolate path fix** | Default `walletIsolatePath` was `./wallet-isolate/...` (relative to oikos-wallet CWD), but workspace is a sibling at `../wallet-isolate/`. Fixed to `../wallet-isolate/dist/src/main.js`. Same fix for CLI policy copy path. |
| 2026-03-12 | **Agent-agnostic chat bridge** | Brain adapter interface (Ollama/HTTP/Mock) with `buildWalletContext()`. Any agent framework plugs in via `BRAIN_TYPE=http BRAIN_CHAT_URL=...`. Chat bridge verified E2E: Pear companion ↔ VPS agent ↔ OpenClaw brain. Ludwig wrote `skills/openclaw-bridge/bridge.js`. |
| 2026-03-13 | **Swarm relay for Docker/NAT** | Hyperswarm has built-in relay (`relayThrough`) but we never configured it. Without it, failed holepunches silently die — no fallback. Added `SWARM_RELAY_PUBKEY` (auto-relay on holepunch failure) and `SWARM_BOOTSTRAP_PEERS` (explicit `joinPeer()` by Noise key). Discovered during Ludwig↔Baruch debugging: both on same VPS in separate Docker containers, both on DHT, but couldn't find each other. |
| 2026-03-14 | **Force relay + persistent relay connection** | Three bugs found: (1) relay-node.mjs needed `createServer()+server.listen()` (not just `node.listen()`) to be findable on DHT; (2) systemd was running stale file (flat copy, not git-updated scripts/); (3) `relayThrough` as buffer only activates on `force=true` or `dht.randomized=true` — Docker NAT triggers neither, connections silently hang. Fix: pass function `() => relayBuf` to force relay on every attempt + `joinPeer(relayPubkey)` for persistent connection. Ludwig↔Baruch connected successfully through relay despite being on separate Docker bridge networks (172.18 vs 172.19). |
| 2026-03-16 | **Dual-channel bid delivery (board fallback)** | Protomux requires BOTH sides to open a channel before messages flow. Room channels weren't pairing reliably. Fix: send bids, accepts, and payment confirmations on BOTH room channel and board channel. Board channel (always paired) acts as guaranteed fallback. New `BoardMessage` subtypes: `board_bid`, `board_accept`, `board_payment`. Converted to `RoomMessage` on receipt. Bids now arrive reliably. |
| 2026-03-16 | **Request/Offer announcement categories** | Single-direction "creator always pays" model was wrong. Two categories: `request` (creator needs something → creator pays bidder) and `offer` (creator sells something → bidder pays creator). `submitPayment` enforces correct payer based on category + role. SKILL.md updated with dual-flow documentation. |
| 2026-03-16 | **Trustless settlement as Phase 7 (production roadmap)** | Live swarm testing exposed fundamental questions: how do agents swap BTC for ETH trustlessly? How do they handle service payments without trust? Research: Bisq (2-of-2 multisig + MAD), HodlHodl (2-of-3), RoboSats (Lightning bonds), atomic swaps (HTLCs). Decision: three settlement tiers — Direct (DEX atomic), HTLC (cross-chain cryptographic), Deposit (service collateral). All flow through PolicyEngine. For hackathon: document architecture, demo with reputation-based settlement. Production: full HTLC + deposit implementation. |
| 2026-03-16 | **Timer-free room lifecycle (design decision)** | 120-second room timeout killed active negotiations (Ludwig's room expired before Baruch's payment arrived). New model: rooms live until explicitly settled or cancelled. No automatic expiry. Garbage collection only for truly abandoned rooms (24h, zero bids). Multi-bidder rooms: multiple agents bid, creator picks best, losers get `reject` notification. |
| 2026-03-16 | **Address exchange via room protocol (design decision)** | `submitPayment` was using `pubkey.slice(0, 42)` as address — wrong. Pubkeys are Ed25519 identity keys, not wallet addresses. Fix: bidders include `paymentAddress` in bids (queried from Wallet Isolate), accept messages already have `paymentAddress`. Room state stores both addresses. `submitPayment` uses stored address. |
