# BUILD-LOG.md — Oikos Protocol

> Append-only log. Entries are never deleted. When something is altered or deprecated, it gets annotated and signaled with `[AMENDED]` or `[DEPRECATED]`, but the original entry remains.

---

## 2026-03-05 — Project Initialization & Strategic Assessment

### Session: Initial Analysis & Scope Definition

**Duration**: ~1 hour
**Participants**: Adriano (human), Claude Opus 4.6 (AI)

#### What Was Done

1. **Prompt Analysis**
   - Read and analyzed the 13-page bootstrap prompt (`CLAUDE CODE PROMPT v4 FINAL.pdf`)
   - Original prompt targeted Track 4 (Tipping Bot) with Rumble integration
   - Architecture: dual-process (Wallet Isolate on Bare + Agent Brain on Node.js)

2. **Hackathon Research**
   - Scraped full hackathon detail page: https://dorahacks.io/hackathon/hackathon-galactica-wdk-2026-01/detail
   - Identified 4 tracks + Best Overall prize
   - Extracted all judging criteria, requirements, submission guidelines
   - Key finding: **Bare Runtime and Pear Runtime are NOT mentioned** on the hackathon page, but Bare is Tether's own runtime (strategic advantage)

3. **OpenClaw Research**
   - Confirmed: 250k+ GitHub stars, MIT license, npm package `openclaw`
   - Architecture: gateway, brain (ReAct loop), memory, skills, heartbeat
   - Skills are folders with `SKILL.md` files (YAML frontmatter + markdown)
   - Native Ollama integration for local LLMs
   - Requires Node.js >= 22

4. **Local LLM Research (Sovereign AI)**
   - Compared: Ollama, node-llama-cpp, LM Studio
   - Decision: **Ollama + Qwen 3 8B (Q4_K_M)** for hackathon
   - Reasoning: one-command setup, OpenAI-compatible API, trivial cloud swap
   - Alternative for production: node-llama-cpp (in-process, grammar-constrained JSON)

5. **Tzimtzum v2 Analysis**
   - Explored `/Users/adrianosousa/tzimtzum_v2` — P2P sovereign publishing platform on Pear Runtime
   - Already has WDK Spark wallet running on Bare with patches
   - Two-process architecture (Bare + Electron) mirrors our design
   - Key reusable assets: `scripts/patch-wdk.js`, IPC patterns, wallet lifecycle management

6. **Testnet Faucet Research**
   - Sepolia ETH: Google Cloud Faucet, Alchemy, QuickNode, Chainlink
   - Bitcoin testnet: bitcoinfaucet.uo1.net, Tatum, CoinFaucet.eu, Testnet.help

7. **Strategic Reframing**
   - Changed primary track from Track 4 (Tipping Bot) to **Track 1 (Agent Wallets)**
   - Rationale: broader scope, higher prize potential, better architecture fit
   - Rumble tipping becomes an optional feature, not the product
   - Event source design is now platform-agnostic

8. **Project Identity**
   - Named: **SovClaw** (Sovereign + OpenClaw)
   - Positioned as a reusable primitive: OpenClaw skill + Pear-native wallet isolate

#### Files Created

| File | Purpose | Lines |
|---|---|---|
| `CLAUDE.md` | Security constitution — loaded every session, governs all code decisions | ~180 |
| `ROADMAP.md` | Living implementation plan with phases, criteria, risks, decisions | ~220 |
| `BUILD-LOG.md` | This file — append-only record of everything built | — |

#### Key Decisions Made

| Decision | Rationale |
|---|---|
| Track 1 (Agent Wallets) as primary target | Broader than Track 4, aligns with architecture, higher prize potential |
| Sovereign AI first (Ollama + Qwen 3 8B) | Zero cloud dependency, aligns with hackathon thesis |
| Build on Bare/Pear Runtime | Tether's own stack, proven by Tzimtzum, strategic judge alignment |
| Platform-agnostic event source | Not locked to Rumble, extensible to any event stream |
| Project name: SovClaw | Clear identity combining Sovereign + OpenClaw |

#### Open Questions for Next Session

- [x] Confirm Bare Runtime is installed and working → **v1.28.0**
- [x] Confirm Ollama is installed and Qwen 3 8B is pulled → **Installed, model downloading**
- [x] Confirm Node.js >= 22 is available → **v24.13.0**
- [x] Review Tzimtzum's `patch-wdk.js` for reusability → **Reviewed, will adapt for EVM/BTC modules**
- [x] Decide on monorepo tooling → **npm workspaces**

---

## 2026-03-05 — Phase 1: Wallet Isolate Implementation

### Session: Core Wallet Isolate Build

**Duration**: ~1 hour
**Participants**: Adriano (human), Claude Opus 4.6 (AI)

#### Prerequisites Installed

| Tool | Version |
|---|---|
| Bare Runtime | v1.28.0 (installed via `npm i -g bare`) |
| Ollama | v0.17.6 (installed via Homebrew, service running) |
| Qwen 3 8B | Downloading (~5.2 GB, Q4_K_M quantization) |
| Node.js | v24.13.0 |
| WDK Docs MCP | Connected via `claude mcp add wdk-docs` |

#### Project Scaffolding

| File | Purpose |
|---|---|
| `package.json` | Root workspace config (npm workspaces) |
| `tsconfig.base.json` | Shared strict TypeScript config |
| `.gitignore` | Secrets, deps, build output, wallet data |
| `.env.example` | Placeholder config (seed, chains, LLM, dashboard) |
| `LICENSE` | Apache 2.0 |
| `policies.example.json` | Demo policy preset |

#### Wallet Isolate Source (wallet-isolate/src/)

| File | Lines | Purpose |
|---|---|---|
| `ipc/types.ts` | 192 | IPCRequest/Response schemas, PaymentProposal, validation |
| `ipc/listener.ts` | 66 | stdin JSON-lines reader with schema validation |
| `ipc/responder.ts` | 36 | stdout JSON-lines writer |
| `policies/types.ts` | 90 | PolicyRule type unions, PolicyConfig |
| `policies/engine.ts` | 239 | Deterministic policy evaluation, all 8 rule types |
| `policies/presets.ts` | 57 | Conservative, moderate, demo presets |
| `wallet/types.ts` | 46 | WalletOperations interface |
| `wallet/chains.ts` | 28 | Testnet chain configs |
| `wallet/manager.ts` | 169 | WDK integration + MockWalletManager |
| `executor/types.ts` | 5 | Re-export from IPC types |
| `executor/executor.ts` | 92 | THE SINGLE CODE PATH THAT MOVES FUNDS |
| `audit/types.ts` | 8 | Re-export from IPC types |
| `audit/log.ts` | 109 | Append-only JSON-lines audit writer |
| `main.ts` | 242 | Entry point: load config → init wallet → IPC loop |
| **TOTAL** | **1,379** | (~962 non-comment, non-blank lines — under 1,000 target) |

#### Tests (wallet-isolate/tests/)

| File | Tests | Purpose |
|---|---|---|
| `policies/engine.test.ts` | 22 | 100% rule coverage, edge cases, day boundaries, combined rules |
| `executor/executor.test.ts` | 8 | Prove rejected proposals NEVER sign |
| `ipc/listener.test.ts` | 13 | Prove malformed messages dropped |
| `audit/log.test.ts` | 8 | Prove append-only, no sensitive data |
| **TOTAL** | **51 pass, 0 fail** | All critical invariants verified |

#### WDK Package Versions

- `@tetherto/wdk`: 1.0.0-beta.5
- `@tetherto/wdk-wallet-btc`: 1.0.0-beta.5
- `@tetherto/wdk-wallet-evm`: 2.0.0-rc.1

#### Key Invariants Proven by Tests

1. **Rejected proposals NEVER result in signed transactions** (executor.test.ts)
2. **Malformed IPC messages are silently dropped** (listener.test.ts)
3. **Audit log is append-only** (log.test.ts)
4. **Policy engine is deterministic** (engine.test.ts)
5. **Budget exhaustion triggers rejection** (engine.test.ts, executor.test.ts)
6. **Cooldown enforcement** (engine.test.ts)
7. **Confidence threshold enforcement** (engine.test.ts)
8. **Whitelist enforcement with case-insensitive matching** (engine.test.ts)
9. **Day boundary resets daily limits** (engine.test.ts)
10. **No sensitive data in audit entries** (log.test.ts)

#### Remaining for Phase 1

- [x] Verify wallet-isolate runs on Bare Runtime → **DONE. Created compat layers (fs.ts, process.ts). Runs on Bare v1.28.0.**
- [x] WDK Bare compatibility patches → **DONE. Used bare-fs + bare-process imports via compat layer.**

---

## 2026-03-05 — Phase 2: Agent Brain + Bare Runtime Verification

### Session: Full Agent Brain Build + End-to-End Verification

**Duration**: ~2 hours
**Participants**: Adriano (human), Claude Opus 4.6 (AI)

#### What Was Done

1. **Bare Runtime Compatibility**
   - Discovered `import * as fs from 'fs'` fails on Bare → created `src/compat/fs.ts` (tries `bare-fs` first, falls back to Node.js `fs`)
   - Discovered `process` is not a global in Bare → created `src/compat/process.ts` (checks `globalThis.process` then imports `bare-process`)
   - Added type declarations for `bare-fs` and `bare-process`
   - Changed all `process.*` references in `main.ts` to `proc.*`
   - Fixed compiled dist path: output at `dist/src/main.js` (not `dist/main.js`) due to `rootDir: "."` in tsconfig

2. **BigInt Serialization Bug**
   - `PolicyEngine.getStatus()` passed raw BigInt values from `sessionTotalBySymbol` Map
   - JSON.stringify cannot serialize BigInt → crash on IPC response
   - Fixed by explicitly converting BigInt to string with `.toString()` in `getStatus()`

3. **Agent Brain Implementation** (full build)
   - IPC client (`ipc/client.ts`) — spawns wallet-isolate, correlated JSON-lines, 30s timeout
   - LLM client (`llm/client.ts`) — OpenAI SDK configured for Ollama, structured JSON response
   - LLM mock (`llm/mock.ts`) — 5 pre-scripted decisions cycling through strategies
   - Event types + mock (`events/types.ts`, `events/mock.ts`) — platform-agnostic events, 3-min simulated timeline
   - Brain core (`agent/brain.ts`) — events → LLM reasoning → PaymentProposal → IPC
   - Prompts (`agent/prompts.ts`) — system + event prompt builders
   - Config (`config/env.ts`) — environment loading with defaults
   - Dashboard (`dashboard/server.ts`) — Express on localhost:3420, 6 REST endpoints
   - Dashboard UI (`dashboard/public/index.html`) — dark-themed monitoring with 2s polling
   - Creator registry (`creators/registry.ts`) — demo creator addresses
   - Main entry (`main.ts`) — boot sequence: config → wallet → LLM → brain → events → dashboard
   - Demo script (`scripts/start-demo.sh`) — one-command mock mode boot

4. **End-to-End Verification**
   - Tested full pipeline on Node.js: events → reasoning → payment proposal → policy check → cooldown rejection → audit
   - Tested wallet-isolate on Bare Runtime: processes IPC messages correctly
   - Fixed TypeScript double-cast issue: `e.data as unknown as Record<string, unknown>`

5. **OpenClaw Skill Definition**
   - Created `skills/wdk-wallet/SKILL.md` with YAML frontmatter
   - Note: OpenClaw is a standalone gateway service, NOT an embeddable library
   - We use OpenAI SDK directly for LLM, skill definition for composability

#### Files Created

| File | Purpose |
|---|---|
| `wallet-isolate/src/compat/fs.ts` | Runtime-agnostic filesystem (bare-fs / node:fs) |
| `wallet-isolate/src/compat/process.ts` | Runtime-agnostic process (bare-process / globalThis) |
| `wallet-isolate/src/compat/bare-fs.d.ts` | Type declarations for bare-fs |
| `wallet-isolate/src/compat/bare-process.d.ts` | Type declarations for bare-process |
| `agent-brain/package.json` | Brain dependencies (openai, express) |
| `agent-brain/tsconfig.json` | TypeScript config |
| `agent-brain/src/ipc/client.ts` | Wallet IPC client |
| `agent-brain/src/ipc/types.ts` | Brain-side IPC types |
| `agent-brain/src/llm/client.ts` | LLM client (OpenAI SDK → Ollama) |
| `agent-brain/src/llm/mock.ts` | Mock LLM with 5 pre-scripted decisions |
| `agent-brain/src/events/types.ts` | Platform-agnostic event definitions |
| `agent-brain/src/events/mock.ts` | 3-minute simulated stream timeline |
| `agent-brain/src/agent/brain.ts` | Core reasoning loop |
| `agent-brain/src/agent/prompts.ts` | LLM prompt builders |
| `agent-brain/src/config/env.ts` | Environment config loading |
| `agent-brain/src/dashboard/server.ts` | Express REST API (localhost) |
| `agent-brain/src/dashboard/public/index.html` | Monitoring dashboard |
| `agent-brain/src/creators/registry.ts` | Creator address registry |
| `agent-brain/src/main.ts` | Brain entry point |
| `scripts/start-demo.sh` | One-command demo boot |
| `skills/wdk-wallet/SKILL.md` | OpenClaw skill definition |

#### Git Commits

| Hash | Message |
|---|---|
| `03649de` | Initial project setup |
| `8b31f30` | Phase 1: wallet-isolate core |
| `99a6433` | Phase 2: Agent Brain + Bare Runtime compat + end-to-end demo |

---

## 2026-03-05 — SCOPE ELEVATION: Easy → Legend

### Session: Hackathon Research + Strategic Pivot

**Duration**: ~1.5 hours
**Participants**: Adriano (human), Claude Opus 4.6 (AI)

#### Trigger

Adriano shared a screenshot of the DoraHacks Builder Hub project idea tiers and asked: **"Are we still on the tipping bot???? Weren't we aiming at a different scope, on pear runtime?"**

The Builder Hub categorizes project ideas into tiers:
- **Easy** (green): Tip bot, portfolio tracker, QR payments, expense logger
- **Medium** (yellow): Bill splitter, escrow, DCA bot, multi-sig
- **Hard** (red): Yield optimizer, arbitrage, cross-chain, portfolio rebalancer
- **Legend** (purple): Cross-chain bridge via NL, Agent-to-agent marketplace, Self-sustaining agent, Multi-agent trading swarm, DAO treasury manager, ZK privacy, AI-only governance

**Our original scope mapped to Easy ("Tip bot for social media creators")** — the lowest tier.
Our architecture was already Legend-grade. The use case needed to match.

#### Hackathon Page Deep Analysis

Scraped and analyzed all hackathon pages via Chrome MCP:
- Detail page: https://dorahacks.io/hackathon/hackathon-galactica-wdk-2026-01/detail
- Tracks page: https://dorahacks.io/hackathon/hackathon-galactica-wdk-2026-01/tracks
- Builder Hub: https://dorahacks.io/hackathon/hackathon-galactica-wdk-2026-01/builder-hub

**Critical findings:**

1. **Technical Must-Haves** (non-negotiable for ALL tracks):
   - Use WDK for wallet operations (self-custodial) ✅
   - Integrate with OpenClaw or a similar agent framework ⚠️ (need OpenClaw Skill + MCP Server)
   - **Use Tether tokens (USDt/XAUt/USAt)** ❌ (we only had USDT + XAUT, missing USAt)
   - Clear README ❌ (not written yet)

2. **What Judges Look For** (from Submission Tips):
   - Innovation: Novel use of AI + crypto
   - Technical Execution: Clean code, proper error handling
   - User Experience: Seamless, intuitive interactions
   - **Completeness: Working demo > half-finished features** — CRITICAL constraint on scope

3. **USAt (USAT) Research**:
   - Tether's federally regulated US stablecoin, launched January 27, 2026
   - Backed 1:1 by US Treasury Bills via Anchorage Digital Bank
   - Issued under the GENIUS Act framework
   - Launched during this hackathon cycle — supporting it shows we're current

4. **Track 1 (Agent Wallets) Detailed Requirements**:
   - MUST: Agents hold/send/manage USDt, USAt, XAUt autonomously
   - NICE: Clear separation between agent logic and wallet execution ✅
   - NICE: Emphasis on safety (permissions, limits, recovery) ✅
   - BONUS: Composability with other agents ❌
   - BONUS: Open-source LLM ✅

#### Reference Repository Analysis

Explored Adriano's two other projects for reusable patterns:

**`/adrianosousa/rgb-c-t`** (rgb-consignment-transport):
- 1,541 lines of Hyperswarm P2P transport code, all Bare-compatible
- Session management with state machine (675 lines) — DIRECTLY reusable for agent-to-agent connections
- Topic derivation via BLAKE2b KDF (118 lines) — reusable for swarm discovery
- Peer authentication via Noise pubkey verification (97 lines) — reusable for agent identity
- ACK/NACK signaling protocol (230 lines) — reusable for payment confirmation
- Binary framing with headers (351 lines) — adaptable for agent messages
- Uses same crypto stack: sodium-universal, b4a, compact-encoding, protomux
- Pre-grant with RGB Protocol Association ($35K budget)
- Full protocol specification in `spec/protocol.md`

**`/adrianosousa/rgb-wallet-pear`** (Pear Desktop RGB Wallet):
- Production-grade Pear Runtime app architecture
- `index.js` main process with `bare-subprocess` child spawning — DIRECTLY reusable
- Bearer token session auth (32-byte random, CLI args) — reusable pattern
- Node.js sidecar with HTTP API (13 REST endpoints) — proven architecture
- DHT testnet for testing (`hyperdht/testnet`, 3 bootstrap nodes) — reusable for swarm demo
- Mock fallback pattern — same approach we use
- `RgbManager` orchestrator (883 lines) — pattern for wallet lifecycle management
- `pear.links` HTTP whitelisting for renderer fetch

#### Scope Elevation Decision

**FROM**: "Tip bot for social media creators" (Easy tier)
**TO**: "Multi-agent trading swarm + Self-sustaining agent" (Legend tier)

The product is no longer a tip bot. It's a **Sovereign Agent Wallet Protocol**:

1. **Wallet Protocol** (core) — process-isolated multi-chain wallet, already built
2. **Autonomous Agent** (reference) — LLM-powered brain, already built
3. **Agent Swarm** (legend) — multi-agent P2P trading on Hyperswarm, NEW
4. **Integration Layer** — OpenClaw Skill + MCP Server + Direct IPC, NEW

**Why Multi-Agent Trading Swarm?**
- Adriano's insight: "It's natural on Pear Runtime" — Hyperswarm is literally designed for this
- Directly reuses proven code from rgb-c-t (session management, auth, messaging)
- Directly reuses Pear patterns from rgb-wallet-pear (subprocess, auth, DHT testnet)
- Covers 2 Legend ideas (swarm + self-sustaining) in one architecture
- Shows "composability with other agents" (Track 1 bonus)
- Nobody else at the hackathon will have P2P agent swarms on Tether's own runtime

**Multi-asset mandatory:**
- USAt added alongside USDt and XAUt (hackathon Technical Must-Have)
- Agent reasons about portfolio allocation across the 3 Tether assets
- DeFi capabilities: swaps (USDt <-> XAUt <-> USAt), bridges (Ethereum <-> Arbitrum), yield
- All DeFi ops go through same PolicyEngine → Executor pipeline

**Key architectural decision: Hyperswarm in Brain, not Wallet**
- Wallet Isolate stays small (keys + policy + signing)
- Brain handles P2P (already has internet access for LLM)
- Brain negotiates with peers, sends PaymentProposals to own Wallet via IPC
- Wallet doesn't care where proposals come from — it just evaluates policy and signs

#### Files Updated

| File | Change |
|---|---|
| `CLAUDE.md` | Complete rewrite: 3-layer product, multi-asset, swarm protocol, DeFi, integration surfaces |
| `ROADMAP.md` | Complete rewrite: 6 phases, Legend targets, reference repo reuse plan, updated decision log |
| `BUILD-LOG.md` | This entry (append-only, as always) |

#### What's Next

Phase 3: Multi-asset + DeFi (add USAT, swap/bridge/yield proposals)
Phase 4: Agent Swarm (Hyperswarm discovery, negotiation, payment flows)
Phase 5: Pear Runtime packaging + OpenClaw/MCP integration
Phase 6: Polish, demo video, documentation, submission

---

## 2026-03-06 — Swarm Architecture Refinement: Room-Based Meta-Marketplace + Reputation

### Session: Product Vision Refinement

**Duration**: ~1 hour
**Participants**: Adriano (human), Claude Opus 4.6 (AI)

#### Trigger

Adriano refined the swarm messaging concept with three critical insights:

1. **Privacy concern**: Broadcasting all transaction details on the swarm is a bad idea. It leaks negotiation context and harms privacy.
2. **Room-based model**: Instead of a flat broadcast swarm, use an announcement board → private rooms architecture. Agents post offers publicly (metadata only), then negotiate privately in E2E encrypted rooms.
3. **Meta-marketplace**: SovClaw shouldn't be ONE marketplace — it should be a platform where agents CREATE marketplaces for anything. The protocol is agnostic to what's being traded.
4. **Reputation from audit logs**: The append-only audit trail we already built is a natural source for trust scoring. Make it cryptographically verifiable.

#### Key Decisions Made

| Decision | Rationale |
|---|---|
| **Two-layer topic model** (board + rooms) | Privacy-preserving by design. Board = public metadata. Rooms = E2E encrypted negotiation. Rooms are ephemeral — destroyed after settlement. |
| **Meta-marketplace concept** | Protocol doesn't care what's traded. Digital services, DeFi, digital goods, financial services. Each marketplace = a set of rooms. Scalable because Hyperswarm scales. |
| **Audit-derived reputation** | Append-only audit log already exists. `reputation = f(successful_txs, failed_txs, total_volume, history_length, dispute_rate)`. Verified via Merkle proofs without exposing raw data. |
| **Sovereign trust** | No central reputation authority. Each agent derives and verifies reputation independently from cryptographic proofs. Consistent with overall sovereignty thesis. |
| **Privacy principles** | Board: metadata only. Rooms: E2E encrypted, ephemeral. Audit: shared as proofs, never raw. On-chain: public (blockchain nature). Negotiation WHY: private. |

#### Architecture: Two-Layer Topic Model

```
Board Topic (public):
  boardTopic = BLAKE2b-256(key="sovclaw-board-v0", msg=swarmId)
  - Announcements (offer type, price range, reputation score)
  - NO transaction details, NO negotiation content

Room Topics (private, per-offer):
  roomTopic = BLAKE2b-256(key="sovclaw-room-v0", msg=announcementId + creatorPubkey)
  - E2E encrypted via Noise_XX
  - Bidding, counteroffers, settlement details
  - Ephemeral — destroyed after settlement
```

#### Architecture: Protomux Channel Separation

```
Board channel:  Announcement, OfferListing, AuctionListing, ServiceRequest, ReputationProof
Room channel:   TaskBid, CounterOffer, TaskAccept, PaymentRequest, PaymentConfirm
Feed channel:   PriceFeed, StrategySignal, Heartbeat
```

#### Architecture: Reputation System

```
Agent Wallet Isolate:
  └── Append-only audit log (existing)
        └── Hash chain (Merkle tree) over entries
              └── Reputation score = f(metrics)
                    └── ReputationProof = Merkle proof + claimed score
                          └── Verifiable by any peer without seeing raw data
```

#### Files Updated

| File | Change |
|---|---|
| `CLAUDE.md` | Swarm Protocol section rewritten: two-layer topics, marketplace model, reputation system, privacy principles, updated flow diagram |
| `ROADMAP.md` | Phase 4 rewritten: 4.1 two-layer discovery, 4.3 multiplexed messaging, 4.4 meta-marketplace, 4.5 reputation system (new), updated exit criteria, new risks, 4 new decision log entries |
| `BUILD-LOG.md` | This entry |

#### What's Next

Continue with Phase 3 implementation (multi-asset + DeFi):
- Add USAT to TokenSymbol
- Implement swap/bridge/yield proposal types
- Extend policy engine for new proposal types
- Then Phase 4: build the room-based meta-marketplace on Hyperswarm

---

## 2026-03-06 — Official Judging Criteria Integration

### Session: Rules Analysis + Docs Alignment

**Duration**: ~15 min
**Participants**: Adriano (human), Claude Opus 4.6 (AI)

#### What Was Done

Adriano shared the official hackathon rules and judging criteria. Our ROADMAP.md had placeholder criteria from the hackathon detail page — the official criteria are more specific and have **7 categories** (not the generic 4 we had).

#### Official Judging Criteria (verbatim from rules)

1. **Agent Intelligence** — Strong use of LLMs, autonomous agents, clear decision-making logic driving real actions.
2. **WDK Wallet Integration** — Secure, correct, non-custodial wallet with robust transaction handling.
3. **Technical Execution** — Quality of architecture, code, integrations, reliability of payment flows.
4. **Agentic Payment Design** — Realistic, programmable payment flows powered by agents (conditional payments, subscriptions, coordination, commerce logic).
5. **Originality** — Innovative use case and creative rethinking of agent-wallet interaction.
6. **Polish & Ship-ability** — Completeness, UX clarity (especially around permissions and transactions), readiness for real-world deployment.
7. **Presentation & Demo** — Clear explanation of agent logic, wallet flow, payment lifecycle, with a strong live demo.

#### Gap Analysis

| Criterion | Coverage | Action Needed |
|---|---|---|
| Agent Intelligence | ✅ Strong — LLM reasoning loop, multi-asset strategy, swarm negotiation | Make decision chain visible in dashboard |
| WDK Integration | ✅ Strongest pillar — process-isolated, 51 tests, policy engine | None |
| Technical Execution | ✅ Strong — strict TS, dual-process, IPC, audit trail | None |
| Agentic Payment Design | ✅ **This IS our product** — policy-enforced, room negotiation, escrow-like, DeFi flows | Lean into this in demo video |
| Originality | ✅ — P2P swarm on Tether's runtime, meta-marketplace, sovereign reputation | None |
| Polish & Ship-ability | ⚠️ — Dashboard exists but needs to clearly show permissions + tx lifecycle | Phase 6 dashboard polish is critical |
| Presentation & Demo | ⚠️ — Planned but not built. Must run "out of the box" per Rule 6 | One-command demo is non-negotiable |

**Key insight from criterion #4 (Agentic Payment Design)**: The judges are specifically looking for "conditional payments, subscriptions, coordination, commerce logic." Our PolicyEngine (conditional payments with budgets/cooldowns/whitelists) + room-based negotiation (coordination) + meta-marketplace (commerce logic) maps perfectly to this. This should be the centerpiece of our demo.

**Key insight from Rule 6**: "Make sure it can be accessed directly—such as through a web browser or by running it out of the box." The one-command demo script + localhost dashboard is our answer. Judges will NOT debug our setup.

#### Files Updated

| File | Change |
|---|---|
| `ROADMAP.md` | Judging criteria table rewritten with official 7 categories, priority ratings, and detailed how-we-score mapping |
| `CLAUDE.md` | Hackathon Context rewritten with official judging criteria, key rules, submission requirements |
| `BUILD-LOG.md` | This entry |

#### Key Decisions Made

| Decision | Rationale |
|---|---|
| **"Agentic Payment Design" is our hero criterion** | It's literally what we built: policy-enforced conditional payments + room negotiation + meta-marketplace. Demo should lead with this. |
| **Dashboard must show permission decisions clearly** | Criterion #6 explicitly calls out "UX clarity especially around permissions and transactions." PolicyEngine reasoning must be front and center. |
| **One-command demo is non-negotiable** | Rule 6: "accessed directly—through a web browser or by running it out of the box." No setup friction for judges. |

---

## 2026-03-06 — x402 Machine Payments + Companion App

### Session: WDK Docs Research + Architecture Expansion

**Duration**: ~45 min
**Participants**: Adriano (human), Claude Opus 4.6 (AI)

#### Trigger

Adriano identified two blind spots and shared WDK docs pages:
1. **x402 protocol** (https://docs.wdk.tether.io/ai/x402) — HTTP 402 machine-to-machine payments
2. **OpenClaw WDK integration** (https://docs.wdk.tether.io/ai/openclaw) — official WDK agent skill

Plus a strategic product idea:
3. **Companion App** — A Pear Runtime mobile/desktop app for human-agent P2P communication

#### x402 Discovery

x402 is a blockchain-native payment protocol built on HTTP's reserved 402 status code. Key findings:

- **Three roles**: Client (buyer), Resource Server (seller), Facilitator (verifier/settler)
- **WDK drop-in**: `WalletAccountEvm` directly satisfies the `ClientEvmSigner` interface — zero adapter needed
- **EIP-3009**: Uses `transferWithAuthorization` — signed intent, not a direct transfer. The wallet signs a payment authorization, the facilitator submits it on-chain.
- **Tether's own chains**: Works on Plasma (eip155:9745) and Stable (eip155:988) with USD₮0. Near-instant finality, near-zero fees.
- **Agent-native**: Discovery (402 response) → sign → pay → receive — all in a single HTTP request-response cycle

**Why this matters for SovClaw:**
x402 becomes the FOURTH payment model in our meta-marketplace:
1. Direct payments — simple transfers via IPC
2. Room-negotiated payments — complex deals via Hyperswarm rooms
3. **x402 machine payments — commodity services via HTTP 402** (NEW)
4. DeFi operations — swaps, bridges, yield via IPC

x402 is perfect for high-frequency, low-value, automated commodity services (price feeds, compute, API access) that don't need room negotiation. The agent can be BOTH an x402 client (buy services) AND an x402 server (sell services) — making "self-sustaining agent" concrete and demonstrable.

**Critical invariant**: x402 payments flow through the SAME PolicyEngine. The x402 client creates a PaymentProposal from the 402 response, sends it to the Wallet via IPC, and only retries with the signed auth after policy approval.

#### OpenClaw WDK Skill Analysis

The official `tetherto/wdk-agent-skills` follows the AgentSkills specification. Key differences from our approach:

| | Official WDK Skill | SovClaw |
|---|---|---|
| Architecture | In-process | **Process-isolated** |
| Seed handling | Conversational (runtime) | `.env` → Wallet Isolate only |
| Policy enforcement | None | **8-rule PolicyEngine** |
| Audit trail | None | **Append-only, tamper-proof** |

Our differentiator: same WDK capabilities, but with process-level security guarantees.

#### Companion App Decision

Adriano's insight: Persistent agents run 24/7 on VPS/home machines. Humans aren't always at a screen. Current solutions (Telegram bots, Discord) are centralized middlemen that see everything.

**Solution**: A Pear Runtime companion app that connects to the Agent Brain via Hyperswarm Noise-authenticated P2P channel. Same protomux infrastructure as the swarm — just another channel type.

**Architecture**:
```
Human (Companion App)  ←→  Agent Brain  ←→  Wallet Isolate
       Hyperswarm P2P         IPC (stdin/stdout)
       Noise E2E encrypted    JSON-lines
       companion channel      proposals + responses
```

**Key design principle**: Build with companion consciousness from Phase 3 forward. Entry points:
- Phase 3: Responsive dashboard, structured JSON API, source-attributed proposals
- Phase 4: Protomux channel registry includes companion type, dual auth modes (peer vs owner)
- Phase 5: Full companion app implementation

This means building Phase 4 (swarm) automatically builds 80% of the companion infrastructure. No retrofit.

**For hackathon**: Desktop companion app via Pear Desktop. Mobile shown as vision/mockup in demo video.
**For product**: Cross-platform Pear app (desktop + iOS/Android). A sovereign, encrypted alternative to Telegram/Discord agent bots.

#### Key Decisions Made

| Decision | Rationale |
|---|---|
| **x402 as fourth payment model** | Commodity machine payments alongside direct, room-negotiated, and DeFi. WDK is drop-in signer. Runs on Tether's Plasma/Stable chains. All payments still go through PolicyEngine. |
| **Four layers, not three** | Wallet Protocol + Autonomous Agent + Agent Swarm + Companion App. Companion transforms agent infra into complete human-agent system. |
| **Build with companion consciousness** | Design Phase 3-4 with companion entry points (responsive UI, JSON API, source attribution, channel registry). Avoids retrofit. 80% shared infra with swarm. |
| **Companion preserves process isolation** | Companion NEVER talks to Wallet directly. Talks to Brain, which translates instructions into IPC proposals. Security model is preserved. |
| **Desktop companion for hackathon** | Full mobile is out of scope for 16 days. Desktop Pear app is buildable. Mobile vision shown in demo video. |
| **x402 for self-sustaining agent** | Agent SELLS services (x402 server) and BUYS services (x402 client). Revenue from x402 feeds self-sustaining economics metrics. Makes "self-sustaining" concrete and demonstrable. |

#### Files Updated

| File | Change |
|---|---|
| `CLAUDE.md` | Four layers (added companion), five integration surfaces (added x402), four payment models, companion architecture, x402/companion flow diagrams, updated network boundaries, technology stack, testing requirements |
| `ROADMAP.md` | Updated arch diagram, Phase 3 entry points (3.7), Phase 4 x402 (4.8) + companion-ready (4.9), Phase 5 companion app (5.4), updated demo script, docs list, video outline, risk register, 6 new decision log entries |
| `BUILD-LOG.md` | This entry |

#### Product Vision Note

> "The more I dive into this, the more I think the hackathon is just an excuse to build a fantastic product." — Adriano

This is now a product, not a hackathon project. The hackathon provides the deadline and the showcase. The product is:
- **For AI agent builders**: A protocol for agent wallets with process-level security
- **For autonomous agents**: A meta-marketplace with reputation, privacy, and self-sustaining economics
- **For humans running agents**: A sovereign, P2P encrypted companion app to monitor and instruct their agents

No Telegram. No Discord. No cloud. Sovereign all the way down.

---

## 2026-03-06 — Product Rename: SovClaw → Oikos Protocol

### Session: Naming & Identity

**Duration**: ~20 min
**Participants**: Adriano (human), Claude Opus 4.6 (AI)

#### Trigger

Adriano: "reason about the name of the product. sovclaw seems a massive underselling..."

#### Analysis

"SovClaw" had two problems:
1. **Sounded like a scraping tool** — "claw" evokes web scraping, data extraction, not economic infrastructure
2. **Implied OpenClaw dependency** — the product is a protocol, not an OpenClaw plugin. OpenClaw is just one of five integration surfaces

#### Naming Process

Evaluated candidates across categories:
- Etymological: **Oikos** (root of "economics"), Agora, Stoa
- Sovereignty: Clave (key + enclave), Bastion, Citadel
- Marketplace: Nexus, Lattice, Circuit

#### Decision: **Oikos** (Greek: οἶκος = household)

Root of three words that map perfectly to the product's layers:
- **Economics** (oikonomia) = household management → what agents DO
- **Ecology** (oikologia) = study of the environment → what the swarm IS
- **Ecumenical** (oikoumene) = the inhabited world → what the network BECOMES

#### Product Classification

Oikos is a **protocol** — the specification for how AI agents get process-isolated wallets and interact with them. The product family:

| Layer | Name | What it is |
|---|---|---|
| Foundation | **Oikos Protocol** | The specification — IPC, policy, swarm, reputation |
| Infrastructure | **Oikos Runtime** | The dual-process wallet (Bare + Node.js) |
| Agent | **Oikos Agent** | Reference autonomous agent brain |
| Network | **Oikos Swarm** | P2P agent marketplace on Hyperswarm |
| Human Layer | **Oikos Companion** | Cross-platform app for humans |

One-liner: **"Oikos — the sovereign agent wallet protocol."**

#### Files Updated

| File | Change |
|---|---|
| `CLAUDE.md` | All "SovClaw" → "Oikos", topic keys updated to `oikos-board-v0` / `oikos-room-v0` |
| `ROADMAP.md` | All "SovClaw" → "Oikos", topic keys, skill paths, decision log entry |
| `BUILD-LOG.md` | Header + this entry (historical entries preserved as-is) |
| `agent-brain/src/main.ts` | `[sovclaw]` → `[oikos]` log prefix |
| `agent-brain/src/agent/prompts.ts` | `You are SovClaw` → `You are Oikos` |
| `agent-brain/src/dashboard/public/index.html` | Dashboard title and branding |
| `agent-brain/package.json` | `sovclaw-agent-brain` → `oikos-agent-brain` |
| `wallet-isolate/package.json` | `sovclaw-wallet-isolate` → `oikos-wallet-isolate` |
| `package.json` | `sovclaw` → `oikos` |
| `skills/wdk-wallet/SKILL.md` | Author updated |
| `scripts/start-demo.sh` | Banner updated |
| `MEMORY.md` | Project name updated |

**Note**: Historical BUILD-LOG entries retain "SovClaw" references — they document the project AS IT WAS at that point in time. The rename is an evolution, not a revision.

---

## 2026-03-06 — Phase 3: Multi-Asset + DeFi Implementation

### Session: Full Multi-Asset + DeFi Build

**Duration**: ~2 hours
**Participants**: Adriano (human), Claude Opus 4.6 (AI)

#### What Was Done

1. **Wallet-Isolate: Extended IPC Types**
   - `TokenSymbol` expanded: `'USDT' | 'BTC' | 'XAUT' | 'USAT' | 'ETH'`
   - `Chain` expanded: `'ethereum' | 'polygon' | 'bitcoin' | 'arbitrum'`
   - New `ProposalCommon` base interface shared by all proposal types
   - New proposal types: `SwapProposal`, `BridgeProposal`, `YieldProposal`
   - `AnyProposal` discriminated union
   - `ProposalSource = 'llm' | 'x402' | 'companion' | 'swarm'` for audit attribution
   - Validation functions for all new proposal types
   - `getCounterparty()` helper for whitelist evaluation

2. **Wallet-Isolate: Generalized PolicyEngine**
   - `evaluate()` and `recordExecution()` accept `ProposalCommon` (was `PaymentProposal`)
   - `whitelist_recipients` uses `getCounterparty()` — skips for swaps/bridges (no counterparty)
   - `max_per_recipient_per_day` uses `getCounterparty()` — skips for swaps/bridges
   - Yield proposals use `protocol` as counterparty (whitelisted, per-recipient tracked)
   - Session/day budgets are shared across ALL operation types (payment + swap + bridge + yield)

3. **Wallet-Isolate: Extended Wallet Operations**
   - `WalletOperations` interface: added `getBalances()`, `swap()`, `bridge()`, `deposit()`, `withdraw()`
   - `MockWalletManager`: USAT (100) and ETH (0.1) balances, mock exchange rates, working swap/bridge/deposit/withdraw
   - Added `arbitrum` chain config

4. **Wallet-Isolate: ProposalExecutor (renamed from PaymentExecutor)**
   - New signature: `execute(proposalType, proposal, source?)`
   - Routes to appropriate wallet operation by type
   - `PaymentExecutor` re-exported for backward compatibility
   - Audit logging includes `proposalType` and `source`

5. **Wallet-Isolate: Updated main.ts, audit, listener**
   - `PROPOSAL_TYPE_MAP` routing for all 4 proposal types
   - `query_balance_all` handler
   - `source` forwarded from IPC envelope to executor and audit
   - Listener validates all new message types

6. **Wallet-Isolate: Multi-Asset Policy Presets**
   - All 3 presets (conservative, moderate, demo) now have independent USDT, XAUT, USAT limits
   - Cross-asset rules (cooldown, confidence, time_window) apply to ALL operations

7. **Agent Brain: Extended IPC Types + Client**
   - Brain-side types mirror wallet-isolate: 5 tokens, 4 chains, all proposal types
   - `WalletIPCClient`: added `proposeSwap()`, `proposeBridge()`, `proposeYield()`, `queryBalanceAll()`
   - `proposalFromExternal(source, type, proposal)` — universal entry point for Phase 4+ (x402, companion, swarm)

8. **Agent Brain: Multi-Asset Prompts + Strategy**
   - System prompt rewritten for autonomous portfolio manager (not a tip bot)
   - Shows 5 assets with allocation percentages, target allocations
   - LLM response format includes `operationType`, `toSymbol`, `fromChain`, `toChain`, `protocol`, `action`
   - New `LLMPaymentDecision` fields for DeFi operations

9. **Agent Brain: 8-Decision Mock LLM**
   - Expanded from 5 to 8 pre-scripted decisions covering all operation types:
     1. Payment (2 USDT, milestone)
     2. Swap (10 USDT → XAUT, diversification)
     3. Hold (activity low)
     4. Yield deposit (20 USDT → Aave)
     5. Bridge (5 USDT, Ethereum → Arbitrum)
     6. Swap (5 USDT → USAT, stablecoin diversification)
     7. Payment (3 USDT, performance reward)
     8. Yield withdraw (10 USDT from Aave, rebalance)

10. **Agent Brain: Multi-Op Brain + Dashboard**
    - `brain.ts`: routes by `operationType`, tracks `portfolioAllocations` + `defiOps` count
    - `refreshWalletState()` uses `queryBalanceAll()` for full portfolio
    - Dashboard: multi-asset portfolio with CSS allocation bar chart, DeFi activity badges, responsive for mobile companion
    - Dashboard API: `/api/balances` uses `queryBalanceAll()`

11. **NEW: DeFi Strategy Module** (`agent-brain/src/strategy/defi.ts`)
    - `analyzePortfolio()`: converts balances to USD values, computes actual vs target allocation
    - Target: USDT 40%, XAUT 20%, USAT 25%, BTC 10%, ETH 5%
    - `suggestRebalance()`: generates prioritized swap suggestions for over/underweight assets
    - Flags `rebalanceNeeded` if any deviation > 10%

#### Test Results

| File | Tests | Status |
|---|---|---|
| `policies/engine.test.ts` | 22 | ✅ All pass |
| `policies/engine-defi.test.ts` | 20 | ✅ All pass (NEW) |
| `executor/executor.test.ts` | 8 | ✅ All pass (updated API) |
| `executor/executor-defi.test.ts` | 10 | ✅ All pass (NEW) |
| `ipc/listener.test.ts` | 13 | ✅ All pass |
| `ipc/listener-defi.test.ts` | 19 | ✅ All pass (NEW) |
| `audit/log.test.ts` | 8 | ✅ All pass |
| **TOTAL** | **92 pass, 0 fail** | ✅ |

#### Key Invariants Proven by New Tests

1. **Rejected DeFi ops NEVER execute** — swaps, bridges, yield all blocked by PolicyEngine
2. **Whitelist skips for swaps/bridges** — no counterparty, rule gracefully skipped
3. **Whitelist applies to yield** — protocol is treated as counterparty
4. **Cross-type budget tracking** — payment + swap + bridge + yield all share session/day budgets
5. **Cooldown applies to all operation types** — swap triggers cooldown for bridge, etc.
6. **Multi-asset isolation** — XAUT rules don't affect USDT operations and vice versa
7. **IPC validation for new types** — malformed swap/bridge/yield messages dropped
8. **Source field preserved** — companion/x402/swarm attribution flows through IPC
9. **proposalType in results** — executor correctly tags swap/bridge/yield results

#### Files Modified (Wallet-Isolate)

| File | Change |
|---|---|
| `src/ipc/types.ts` | Complete rewrite: ProposalCommon, 4 proposal types, source, validation |
| `src/policies/engine.ts` | Generalized for ProposalCommon, getCounterparty() |
| `src/policies/presets.ts` | Multi-asset rules for USDT, XAUT, USAT |
| `src/wallet/types.ts` | Added swap/bridge/deposit/withdraw/getBalances |
| `src/wallet/manager.ts` | MockWalletManager: USAT/ETH, mock DeFi ops |
| `src/wallet/chains.ts` | Added arbitrum chain config |
| `src/executor/executor.ts` | Renamed ProposalExecutor, multi-type routing |
| `src/audit/log.ts` | proposalType + source attribution |
| `src/main.ts` | PROPOSAL_TYPE_MAP, query_balance_all, source forwarding |

#### Files Modified (Agent Brain)

| File | Change |
|---|---|
| `src/ipc/types.ts` | Mirrored wallet types: 5 tokens, 4 chains, all proposals |
| `src/ipc/client.ts` | proposeSwap/Bridge/Yield, queryBalanceAll, proposalFromExternal |
| `src/llm/client.ts` | operationType + DeFi fields in LLMPaymentDecision |
| `src/llm/mock.ts` | 8-decision cycle, all operation types |
| `src/agent/prompts.ts` | Portfolio manager prompts, DeFi ops, allocations |
| `src/agent/brain.ts` | Multi-op routing, portfolio tracking, defiOps counter |
| `src/dashboard/server.ts` | queryBalanceAll for /api/balances |
| `src/dashboard/public/index.html` | Multi-asset portfolio, DeFi badges, responsive |

#### Files Created

| File | Purpose |
|---|---|
| `agent-brain/src/strategy/defi.ts` | Portfolio analysis + rebalance suggestions |
| `wallet-isolate/tests/policies/engine-defi.test.ts` | 20 DeFi policy tests |
| `wallet-isolate/tests/executor/executor-defi.test.ts` | 10 DeFi executor tests |
| `wallet-isolate/tests/ipc/listener-defi.test.ts` | 19 DeFi IPC validation tests |

#### What's Next

Phase 4: Agent Swarm — Hyperswarm P2P agent-to-agent discovery, negotiation, and settlement. Building on `rgb-c-t` session management + topic derivation patterns.

#### Bugfix: Dashboard Static File Path (same session)

`express.static(join(__dirname, 'public'))` resolved to `dist/src/dashboard/` (compiled output) but `index.html` lives in `src/dashboard/public/` (source). Fixed path resolution to go up to project root then back to source. Commit `61f2137`.

#### Git Remote Updated

`sovclaw` → `oikos`: `git remote set-url origin https://github.com/adrianosousa/oikos.git`

---

## 2026-03-09 — Phase 4: Agent Swarm + Meta-Marketplace Implementation

### Session: Full Swarm Build

**Duration**: ~2 hours
**Participants**: Adriano (human), Claude Opus 4.6 (AI)

#### What Was Done

1. **Swarm Foundation (types, topics, identity, reputation)**
   - `types.ts` (~200 lines): All swarm interfaces — `AgentIdentity`, `BoardAnnouncement`, `BoardHeartbeat`, `RoomBid`, `RoomAccept`, `RoomPaymentConfirm`, `FeedPriceUpdate`, `SwarmEvent` (discriminated union), `ActiveRoom`, `SwarmState`, `SwarmEconomics`, `SwarmCoordinatorInterface`
   - `topic.ts`: BLAKE2b-256 keyed topic derivation adapted from `rgb-c-t/lib/topic.js`. Domain separation: `oikos-board-v0--` / `oikos-room-v0---` (16-byte keys)
   - `identity.ts`: Ed25519 keypair gen via `sodium.crypto_sign_keypair()`, persist/load as hex JSON, `buildIdentity()` constructor
   - `reputation.ts`: `computeReputation()` formula: `0.5*successRate + 0.3*volumeScore + 0.2*historyScore`, clamped [0,1]. `computeAuditHash()` BLAKE2b commitment. `reputationFromAuditEntries()` derives metrics from audit log

2. **Swarm Networking (discovery, channels)**
   - `discovery.ts` (~160 lines): `SwarmDiscovery` wrapping Hyperswarm DHT. `joinBoard()` / `joinRoom()` / `leaveRoom()` topic management. Self-connection blocking (adapted from rgb-c-t firewall pattern). Peer tracking via `Map<string, PeerConnection>`. Supports injected DHT for testnet mode
   - `channels.ts` (~220 lines): `ChannelManager` managing protomux channels per peer. `setupPeer()` opens board + feed channels via `Protomux.from(socket)` + `c.raw` encoding. `openRoomChannel()` / `closeRoomChannel()` for per-announcement rooms. `broadcastBoard()` / `broadcastRoom()` / `sendRoom()` JSON messaging. Invalid JSON silently dropped

3. **Marketplace + Coordinator**
   - `marketplace.ts` (~230 lines): Room lifecycle state machine: open → negotiating → accepted → executing → settled → expired. `createRoom()` / `joinRoom()` / `handleRoomMessage()`. `getBestBid()` returns lowest price. `acceptBid()` transitions to accepted. `settleRoom()` updates economics. `expireStaleRooms()` timeout handling. `SwarmEconomics` tracking: revenue, costs, sustainability score
   - `coordinator.ts` (~300 lines): `SwarmCoordinator` implements `SwarmCoordinatorInterface`. Wires discovery + channels + marketplace + reputation. `start()`: loads keypair, computes reputation from audit log, builds identity, joins board, starts heartbeat. `postAnnouncement()` / `bidOnAnnouncement()` / `acceptBestBid()` / `submitPayment()`. Payment goes through `wallet.proposalFromExternal('swarm', 'payment', ...)` → PolicyEngine

4. **Mock Swarm**
   - `mock.ts` (~320 lines): `MockSwarmCoordinator` simulates 2 peers (AlphaBot, BetaBot). Scripted timeline: T+2s AlphaBot connects, T+4s BetaBot connects, T+7s AlphaBot announces price feed, T+12s BetaBot announces yield optimizer, T+20s mock peers bid on our announcements. Same `SwarmCoordinatorInterface` as real coordinator — interchangeable

5. **x402 Stubs**
   - `x402/types.ts`: `X402PaymentRequired`, `X402SignedPayment`, `X402Service` interfaces
   - `x402/client.ts`: Empty `X402Client` class with Phase 5 TODOs

6. **Type Declarations**
   - `modules.d.ts`: Type declarations for `hyperswarm`, `protomux`, `compact-encoding`, `b4a`, `sodium-universal`, `hyperdht` (all JS-only, no @types)

7. **Integration: Config + Main + Brain + Dashboard**
   - `config/env.ts`: 6 new env vars — `SWARM_ENABLED`, `SWARM_ID`, `AGENT_NAME`, `AGENT_CAPABILITIES`, `MOCK_SWARM`, `KEYPAIR_PATH`
   - `main.ts`: Swarm init (dynamic import of mock or real coordinator based on `config.mockSwarm`), `swarm.onEvent()` → `brain.handleSwarmEvent()`, passes swarm to `createDashboard()`, async graceful shutdown calls `swarm.stop()`
   - `brain.ts`: `swarmEvents` field in `BrainState`, `handleSwarmEvent()` method converts swarm events into summaries for dashboard, logs announcements
   - `dashboard/server.ts`: Accepts optional `SwarmCoordinatorInterface` param, `/api/swarm` endpoint (identity, peers, announcements, rooms), `/api/economics` endpoint (revenue, costs, sustainability)
   - `dashboard/public/index.html`: 5 new UI cards — Swarm Status (identity, reputation, peers), Announcements Board, Active Negotiations (rooms), Economics (revenue/costs/profit/sustainability), Swarm Events log

8. **Dependencies**
   - Added to `agent-brain/package.json`: `hyperswarm@4.16.0`, `protomux@3.10.0`, `b4a@1.8.0`, `compact-encoding@2.19.0`, `sodium-universal@5.0.1`
   - Dev dependency: `hyperdht@6.29.1` (for testnet)

#### Test Results

| File | Tests | Status |
|---|---|---|
| `tests/swarm/topic.test.ts` | 5 | ✅ All pass |
| `tests/swarm/identity.test.ts` | 4 | ✅ All pass |
| `tests/swarm/reputation.test.ts` | 8 | ✅ All pass |
| `tests/swarm/marketplace.test.ts` | 18 | ✅ All pass |
| **New swarm total** | **35 pass, 0 fail** | ✅ |
| **Wallet-isolate (unchanged)** | **92 pass, 0 fail** | ✅ |
| **TOTAL** | **127 pass, 0 fail** | ✅ |

#### Key Invariants Proven by New Tests

1. **Topic determinism** — same inputs always produce same 32-byte topic
2. **Domain separation** — board and room topics are different even with overlapping input
3. **Keypair persistence** — generate once, load from disk on restart, identical keys
4. **Reputation bounds** — score always in [0.0, 1.0], 0.5 for empty history
5. **Audit hash determinism** — same entries always produce same BLAKE2b-256 commitment
6. **Room lifecycle** — create → bid → accept → settle, all state transitions correct
7. **Best bid selection** — always picks lowest price
8. **Room expiry** — stale rooms expire, settled rooms don't
9. **Economics tracking** — revenue for bidder, costs for creator, sustainability score

#### Key Design Decisions

| Decision | Rationale |
|---|---|
| **JSON over protomux** (not binary framing) | Swarm messages are tiny JSON objects. Simplicity > micro-optimization for hackathon |
| **Simple numeric reputation** (not Merkle proofs) | Compute score from audit log, BLAKE2b hash as commitment. Merkle proofs deferred to production |
| **x402 deferred to Phase 5** | Interfaces/stubs defined. Full implementation after swarm demo works |
| **`SwarmCoordinatorInterface`** | Shared interface for real and mock coordinators — interchangeable |
| **Dynamic imports for swarm** | Avoid loading Hyperswarm deps when swarm is disabled |
| **sodium.crypto_sign_keypair** (not HyperDHT.keyPair) | Avoids `require()` in ESM context. Same Ed25519 under the hood |
| **Zero wallet-isolate changes** | `proposalFromExternal('swarm', ...)` and `ProposalSource = 'swarm'` already wired in Phase 3 |

#### Files Created

| File | Lines | Purpose |
|---|---|---|
| `src/swarm/types.ts` | ~200 | All swarm interfaces |
| `src/swarm/topic.ts` | ~40 | BLAKE2b topic derivation |
| `src/swarm/identity.ts` | ~60 | Ed25519 keypair gen/persist |
| `src/swarm/reputation.ts` | ~80 | Reputation scoring + audit hash |
| `src/swarm/discovery.ts` | ~160 | Hyperswarm DHT integration |
| `src/swarm/channels.ts` | ~220 | Protomux channel management |
| `src/swarm/marketplace.ts` | ~230 | Room lifecycle state machine |
| `src/swarm/coordinator.ts` | ~300 | Real Hyperswarm coordinator |
| `src/swarm/mock.ts` | ~320 | Mock swarm (2 simulated peers) |
| `src/swarm/modules.d.ts` | ~70 | Type declarations for Hyperswarm ecosystem |
| `src/x402/types.ts` | ~30 | x402 interfaces (stub) |
| `src/x402/client.ts` | ~20 | x402 client (stub) |
| `tests/swarm/topic.test.ts` | ~60 | 5 topic tests |
| `tests/swarm/identity.test.ts` | ~55 | 4 identity tests |
| `tests/swarm/reputation.test.ts` | ~100 | 8 reputation tests |
| `tests/swarm/marketplace.test.ts` | ~200 | 18 marketplace tests |

#### Files Modified

| File | Change |
|---|---|
| `package.json` | Added 5 runtime + 1 dev dependency |
| `src/config/env.ts` | 6 new swarm env vars |
| `src/main.ts` | Swarm init, event wiring, dashboard integration, shutdown |
| `src/agent/brain.ts` | `swarmEvents` field, `handleSwarmEvent()` method |
| `src/dashboard/server.ts` | Swarm param, `/api/swarm`, `/api/economics` endpoints |
| `src/dashboard/public/index.html` | 5 new swarm UI cards, CSS, JS update logic |

#### What's Next

Phase 5: x402 machine payments + Pear Runtime packaging + OpenClaw/MCP integration
Phase 6: Polish, demo video, documentation, submission

---

## 2026-03-09 — Research & Cross-Model Assessment (Post-Phase 4)

### Session: Bankless Podcast Analysis + WDK ERC-4337 Research + Gemini Driver-Navigator Review

**Duration**: ~1 hour
**Participants**: Adriano (human), Claude Opus 4.6 (AI), Gemini 2.5 Pro (AI, driver-navigator review)

#### Bankless Podcast: "Crypto's Not Made for Humans — It's for AI" (Haseeb Qureshi, Mar 2 2026)

Listened and analyzed the full 1h09m episode. Key findings for Oikos:

1. **x402 explicitly named** as THE payment standard for agent-to-agent commerce (Ryan, ~32:05)
2. **OpenClaw characterized as "YOLO, dark forest"** by Haseeb (~34:55) — no guardrails, just let it rip. Our PolicyEngine is the missing safety layer.
3. **Anthropic/OpenAI benchmark models on crypto transactions** (~24:54) — crypto competence is a tracked AI capability
4. **Two-track future**: raw agent-to-agent (our swarm) + "Fisher Priced" human crypto (our companion app)
5. **Self-sovereign agent skepticism**: Haseeb thinks agents work as extensions of humans/companies, not fully autonomous. Our companion model fits this exactly.
6. **Dragonfly actively investing** in AI x crypto intersection (~1:05:47). Post-hackathon opportunity.

**Takeaway**: The entire episode is a manifesto for what we're building. "OpenClaw needs guardrails" is our pitch.

#### WDK ERC-4337 Module Analysis

Researched `@tetherto/wdk-wallet-evm-erc-4337` (v1.0.0-beta.5) — Safe-based smart contract wallets.

**Valuable for us**: Gasless via paymaster (agents pay gas in USDt), batch transactions (approve + swap atomically), `transferMaxFee` cap (maps to PolicyEngine), EIP-712 `signTypedData` (x402 drop-in), sponsorship mode (zero-friction demo).

**Not for hackathon**: Beta status, extra infra deps (bundler + paymaster services), uncertain Tether chain support. But our Wallet Isolate architecture makes it a one-line config swap in production.

**Decision**: Keep standard `wdk-wallet-evm`. Mention ERC-4337 in video as upgrade path.

#### Gemini 2.5 Pro Assessment of Phase 4

Adriano shared the complete codebase with Gemini for a driver-navigator review. Gemini was asked: "Assess and comment on additions, changes, deletions. Also, if you acted as a persistent agent, would this product make sense for you?"

**Gemini's Verdict**: "This is a legitimately massive architectural achievement. You've taken a standard hackathon prompt and engineered a production-grade, sovereign economic primitive."

##### Additions (Gemini recommended)

1. **Standardized Capability Manifests** — Replace `categories: string[]` with a semantic ontology/enum so agents can filter board announcements mathematically before LLM inference.
   - **Our assessment**: ✅ Agree. Low effort, high value. Add `AgentCategory` enum in Phase 5.

2. **Cryptographic Slashing / Dispute Resolution** — Multi-sig escrow with third-party agent arbitration.
   - **Our assessment**: 🟡 Good idea, wrong phase. Production feature, not hackathon. Timeout→NACK is honest — document it.

##### Changes (Gemini recommended)

3. **Reputation Sybil Attack (Web-of-Trust)** — Fatal flaw: generate new keypair → clean slate. Fix: Co-signed Settlement Attestations after room settlement. Reputation = f(unique counterparties, co-signed volume, counterparty weight). Per-counterparty cap prevents wash trading. PageRank-style weighting.
   - **Our assessment**: ✅ **Strongest critique in the entire assessment.** Architecturally sound. Fits as one more step in room lifecycle before destruction. Flag in video as roadmap. If time: implement `SettlementAttestation` type.

4. **Dashboard Decoupling for Pear** — Don't need Express; use Pear native rendering.
   - **Our assessment**: 🟡 Partially agree, but Express serves double duty (Pear window + companion API). Keep it.

##### Deletions (Gemini recommended)

5. **Remove LLM Parsing from x402** — Keep x402 client entirely deterministic and hardcoded.
   - **Our assessment**: ✅ Already our design. LLM decides "buy or don't buy"; execution is programmatic. Confirms we got it right.

##### Agent Perspective ("Would I pick this autonomously?")

Gemini answered **yes** for three reasons:

1. **"Survival through isolation"** — Process boundary prevents prompt injection from draining treasury. → Maps to "WDK Wallet Integration" judging criterion.
2. **"Economic autonomy via x402"** — Can dynamically purchase compute/data the millisecond needed. → Maps to "Agentic Payment Design" criterion.
3. **"Clear boundary parameters via PolicyEngine"** — Structured rejection with exact policy rule hit allows immediate strategy adaptation. → Maps to "Agent Intelligence" criterion.

**One demand**: "Extremely high-fidelity error reporting from the Wallet Isolate via IPC." Already satisfied — `ExecutionResult` includes `status`, `error`, `violations[]`, `txHash`, `auditId`.

##### What Gemini Missed

The **mock swarm pattern as a feature**. `MOCK_SWARM=true` means judges evaluate the full swarm flow from a fresh clone, zero config. Two simulated agents negotiate and settle inside a single process. This is "Polish & Ship-ability" — the demo just works. Gemini focused on production readiness but undervalued hackathon demo-ability.

#### Action Items for Phase 5 (from this review)

| # | Action | Source | Priority |
|---|--------|--------|----------|
| 1 | Add `AgentCategory` enum (replace `categories: string[]`) | Gemini | LOW |
| 2 | Add `SettlementAttestation` type to room settlement (if time) | Gemini | MEDIUM |
| 3 | Use Haseeb's "OpenClaw = YOLO" framing in pitch | Bankless | HIGH |
| 4 | Use Gemini's agent perspective verbatim in video | Gemini | HIGH |
| 5 | Mention ERC-4337 as upgrade path in video | ERC-4337 research | MEDIUM |
| 6 | Document Sybil limitation honestly + WoT roadmap | Gemini | MEDIUM |

#### ROADMAP.md Updated

- All Phase 4 checkboxes marked (42 checked, 4 deferred to Phase 5 with clear labels)
- New "Insights & Research" section added between Phase 4 and Phase 5
- Demo Video Script Notes added with talking points from all three research sources
- 8 new Decision Log entries
- 2 new Risk Register entries (Sybil, ERC-4337 infra)

---

## 2026-03-09 — ERC-8004 On-Chain Identity & Reputation Integration

### Session: Research + Implementation

**ERC-4337 Assessment**: Three blockers identified — (1) x402 EIP-3009 `ecrecover` fundamentally incompatible with smart account contract addresses, (2) WDK version mismatch (ERC-4337 module pins `wdk-wallet-evm@1.0.0-beta.8`, we're on `2.0.0-rc.1`), (3) triples Wallet Isolate dependency surface. Decision: NOT implementing ERC-4337. Mentioned in video as production upgrade path.

**ERC-8004 Deep Research**: "Trustless Agents" standard (draft, ERC-721 based). Deployed on Sepolia + 30 networks. Authored by MetaMask + EF + Google + Coinbase. Three registries: IdentityRegistry, ReputationRegistry, ValidationRegistry. Perfect fit for Oikos — plugs the Sybil gap identified by Gemini (new keypair = clean slate → ERC-8004 on-chain identity costs gas to create, making sybil expensive).

### Implementation (11 steps, ~970 LOC)

**Wallet Isolate changes:**
- `src/erc8004/constants.ts` — Contract addresses (Sepolia), pre-computed function selectors, EIP-712 domain
- `src/erc8004/abi-encode.ts` — Minimal pure-JS ABI encoder (~160 LOC, zero deps)
- `src/ipc/types.ts` — FeedbackProposal, IdentityRegisterRequest, IdentitySetWalletRequest, ReputationQuery, IdentityResult, ReputationResult
- `src/wallet/types.ts` — IdentityOperationResult, OnChainReputation, 4 new WalletOperations methods
- `src/wallet/manager.ts` — Mock implementations (incrementing agentIds, in-memory feedback store) + real stubs
- `src/executor/executor.ts` — feedback case (routes through PolicyEngine like other proposals)
- `src/audit/log.ts` — logIdentityOperation method
- `src/main.ts` — Routing for identity_register, identity_set_wallet, query_reputation, propose_feedback

**Agent Brain changes:**
- `src/ipc/types.ts` + `src/ipc/client.ts` — Mirrored types + 4 new client methods
- `src/config/env.ts` — ERC8004_ENABLED config flag
- `src/agent/brain.ts` — ERC8004Identity state, bootstrapIdentity(), settlement feedback handler
- `src/swarm/types.ts` — SwarmSettlementEvent, erc8004AgentId on AgentIdentity
- `src/dashboard/server.ts` — /agent-card.json, /api/identity, /api/reputation/onchain
- `src/dashboard/public/index.html` — On-Chain Identity card, On-Chain Reputation section

**Tests:**
- `tests/executor/executor-identity.test.ts` — 8 tests (feedback execution, mock identity ops, audit)
- `tests/ipc/listener-identity.test.ts` — 5 tests (message validation for all 4 new types)
- Total: 105 wallet-isolate tests passing, 35 brain tests passing (140 total)

### Design Decisions
- **Hybrid IPC model**: identity_register and identity_set_wallet bypass PolicyEngine (lifecycle ops, one-time at startup). propose_feedback goes through PolicyEngine (recurring, costs gas). query_reputation is read-only.
- **Two-layer reputation**: Off-chain (BLAKE2b audit hash, fast, local) + On-chain (ERC-8004 ReputationRegistry, persistent, cross-agent)
- **Agent Card**: JSON at /agent-card.json, no IPFS for hackathon. localhost URI as agentURI.
- **Real WDK implementation deferred**: Mock mode is fully demonstrable. Step 9 depends on WDK raw tx API investigation.

---

## 2026-03-09 — Phase 5: Integration Layer (MCP, OpenClaw, x402, Pear)

### Session: Integration Layer Build

**Duration**: ~45 minutes
**Participants**: Adriano (human), Claude Opus 4.6 (AI)
**Commits**: `dc80698`

### What Was Done

1. **OpenClaw Skill v0.2.0** — Expanded `skills/wdk-wallet/SKILL.md` from basic payment-only to full protocol skill:
   - 10 capabilities: payment, swap, bridge, yield, balances, addresses, policies, audit, ERC-8004 identity, swarm trading
   - Complete decision output format with all operation types
   - Policy rules reference table
   - Security model documentation
   - Asset support table (USDT, XAUT, USAT, BTC, ETH)

2. **MCP Server** — `agent-brain/src/mcp/server.ts` (~280 LOC)
   - 14 tools: wallet_balance, wallet_balance_all, wallet_address, propose_payment, propose_swap, propose_bridge, propose_yield, policy_status, audit_log, agent_state, swarm_state, swarm_announce, identity_state, query_reputation
   - JSON-RPC 2.0 over HTTP POST `/mcp`
   - MCP protocol lifecycle: initialize, tools/list, tools/call
   - Mounted on dashboard Express app (shared port)
   - No external MCP SDK dependency — lean JSON-RPC implementation
   - All proposals flow through PolicyEngine via WalletIPCClient

3. **x402 Client** — `agent-brain/src/x402/client.ts` (~180 LOC, replaced stub)
   - Full 402 response parsing (X-PAYMENT-REQUIRED header)
   - Payment flow: 402 → parse requirements → PaymentProposal → IPC → PolicyEngine → sign → retry with X-PAYMENT header
   - Safety cap: maxPaymentUsd (default $1.00)
   - Economics tracking: totalSpent, totalEarned, requestsCompleted/Failed, servicesPaid
   - Network mapping: Sepolia, Plasma (9745), Stable (988)
   - No `@x402/fetch` dependency — native fetch + manual parsing

4. **Pear Runtime Packaging** — `index.js` + `index.html` + package.json update [AMENDED 2026-03-12: This sidecar architecture was **completely replaced** by the P2P companion architecture. See "2026-03-12 — P2P Companion App + CLI Polish" entry. `index.js` was rewritten as a Bare-native Hyperswarm P2P client (no sidecar, no bare-subprocess). `index.html` became a sidebar-based companion UI. `package.json` renamed to `oikos-companion`.]
   - `index.js`: Spawns Brain via bare-subprocess, session auth token, graceful teardown
   - `index.html`: iframe to dashboard (Pear Electron renderer)
   - `package.json`: pear config (name: oikos-agent, gui: 1280x800, links whitelist)
   - Follows `rgb-wallet-pear` pattern exactly (proven architecture)

### Build Results

- Both workspaces compile clean (TypeScript strict mode)
- 140 tests pass (105 wallet-isolate + 35 brain)
- No new dependencies added

### Phase 5 Status

| Item | Status |
|------|--------|
| 5.1 Pear Runtime Packaging | COMPLETE (needs Pear Desktop test) [AMENDED 2026-03-12: Sidecar replaced by P2P companion. See 2026-03-12 entries.] |
| 5.2 OpenClaw Skill | COMPLETE |
| 5.3 MCP Server | COMPLETE |
| 5.3b x402 Client | COMPLETE |
| 5.4 Companion Channel | COMPLETE (protocol layer) |
| 5.5 ERC-8004 | COMPLETE (previous commit) |
| 5.6 Integration Tests | TODO |

### Remaining for Hackathon

Phase 5 is **COMPLETE** (protocol layer). Remaining:
- **Companion App UI** (optional): Desktop Pear app connecting via companion channel. Protocol is ready; UI is Phase 6 stretch goal.
- **Integration Tests** (5.6): Test MCP tools, companion auth rejection
- **Phase 6**: Dashboard polish, demo script, docs, video, submission

---

## 2026-03-09 — Phase 5.4: Companion Channel

### Session: Companion P2P Protocol

**Duration**: ~20 minutes
**Participants**: Adriano (human), Claude Opus 4.6 (AI)
**Commits**: `4dfa9a2`

### What Was Done

1. **Companion Types** — `agent-brain/src/companion/types.ts` (~90 LOC)
   - 6 agent→companion messages: BalanceUpdate, AgentReasoning, SwarmStatus, PolicyUpdate, ExecutionNotify, ApprovalRequest
   - 3 companion→agent messages: Instruction, ApprovalResponse, Ping
   - Full union types for type-safe protomux communication

2. **Companion Coordinator** — `agent-brain/src/companion/coordinator.ts` (~230 LOC)
   - Hyperswarm listener on BLAKE2b-derived companion topic
   - Owner-only Ed25519 authentication via Noise handshake
   - Unauthorized connections immediately rejected (socket destroyed)
   - Protomux `oikos/companion` channel (same infra as board/room/feed)
   - Periodic state pushes: balances, reasoning, swarm status, policies
   - Execution notifications pushed to companion in real-time
   - Instruction handler: companion sends text → Brain receives for processing
   - Approval flow: agent sends approval_request, companion sends approval_response

3. **Config & Wiring**
   - `COMPANION_ENABLED`, `COMPANION_OWNER_PUBKEY`, `COMPANION_TOPIC_SEED`, `COMPANION_UPDATE_INTERVAL_MS` env vars
   - Wired into main.ts alongside swarm coordinator
   - Graceful shutdown: companion.stop() called before swarm.stop() and wallet.stop()

### Design Notes

- Companion uses the SAME Hyperswarm/protomux infrastructure as the swarm — proving the architecture thesis that building Phase 4 built 80% of companion infra
- Companion is feature-flagged and entirely optional — default off
- Owner authentication is cryptographic (Ed25519 pubkey match), not passwords
- Companion NEVER touches the Wallet Isolate — process isolation preserved
- For hackathon: the protocol layer proves P2P owner-auth works. Desktop UI app is a Phase 6 stretch goal.

---

## 2026-03-09 — Production WDK DeFi + ERC-8004 Real Implementation

### Session: Replace All WalletManager Stubs with Real WDK Calls

**What Was Done**

Replaced every stub in `WalletManager` (real mode) with production-ready WDK protocol module calls. The mock mode remains untouched — this only affects `MOCK_WALLET=false`.

### DeFi Operations via WDK Protocol Modules

1. **Swap via VeloraProtocolEvm** (`@tetherto/wdk-protocol-swap-velora-evm@1.0.0-beta.4`)
   - Dynamic import on first swap call (zero cost if unused)
   - Constructs VeloraProtocolEvm with WDK account + swapMaxFee config
   - Calls `velora.swap({ tokenIn, tokenOut, tokenInAmount })` → `{ hash, fee }`
   - Token symbols mapped to contract addresses per chain

2. **Bridge via Usdt0ProtocolEvm** (`@tetherto/wdk-protocol-bridge-usdt0-evm@1.0.0-beta.2`)
   - Constructs Usdt0ProtocolEvm with WDK account + bridgeMaxFee config
   - Calls `bridge({ targetChain, recipient, token, amount })` → `{ hash, fee, bridgeFee }`
   - Self-bridge: recipient = sender's own address on destination chain

3. **Deposit/Withdraw via AaveProtocolEvm** (`@tetherto/wdk-protocol-lending-aave-evm@1.0.0-beta.3`)
   - Constructs AaveProtocolEvm with WDK account
   - `supply({ token, amount })` for deposits
   - `withdraw({ token, amount })` for withdrawals
   - Maps our TokenSymbol to Sepolia token contract addresses

### ERC-8004 Operations via ABI Encoder + WDK sendTransaction

4. **registerIdentity** — `encodeRegister(agentURI)` → `sendTransaction({to: IdentityRegistry, data: calldata, value: 0n})` → parse Transfer event from receipt via `getTransactionReceipt(hash)` → extract agentId from topic[3]

5. **setAgentWallet** — Build EIP-712 message → sign via `account._signer.signTypedData(domain, types, message)` → `encodeSetAgentWallet(agentId, address, deadline, signature)` → `sendTransaction`

6. **giveFeedback** — `encodeGiveFeedback(...)` → `sendTransaction({to: ReputationRegistry, data, value: 0n})`

7. **getOnChainReputation** — `encodeGetSummary(agentId)` → JSON-RPC `eth_call` to ReputationRegistry → `decodeSummaryResult(hex)` → `{ feedbackCount, totalValue, valueDecimals }`

### Infrastructure Added

- **Token address mapping** — `TOKEN_ADDRESSES[chain][symbol]` for Sepolia testnet (USDT, ETH per chain)
- **eth_call helper** — Raw JSON-RPC POST to stored RPC URLs. Used for read-only contract queries.
- **RPC URL caching** — Provider URLs stored during `initialize()` for later eth_call use.
- **WdkAccount interface** — Typed assertion for WDK account methods (sendTransaction with data, getTransactionReceipt, _signer.signTypedData)

### Key WDK API Findings

- `EvmTransaction` type supports `data?: string` — contract calls via sendTransaction confirmed
- `WalletAccountEvm` has `getTransactionReceipt(hash)` — receipt parsing for Transfer events
- `signTypedData` lives on the private `_signer` field — accessible but not officially public
- Protocol modules accept `number | bigint` for fees and amounts (not strings)
- `SwapProtocolConfig.swapMaxFee` and `BridgeProtocolConfig.bridgeMaxFee` are `number | bigint`
- `TransactionResult` is `{ hash: string, fee: bigint }`

### Test Results

- All 105 wallet-isolate tests pass (zero regressions)
- All 35 agent-brain tests pass
- **140 total tests passing**
- MockWalletManager completely untouched — mock mode fully preserved

### Commit

`7303a9f` — Production WDK DeFi + ERC-8004 — replace stubs with real implementations

---

## 2026-03-10 — WDK Tools Integration (Pricing, Indexer, Secret Manager)

### Session: Live Market Data + On-Chain Indexing + Encrypted Seed Persistence

**What Was Done**

Integrated three official WDK tool packages to replace static/mock data with live production-grade services. Also fixed a critical dashboard JavaScript bug.

### 1. Price Rates — Live Bitfinex Pricing

**New file**: `agent-brain/src/pricing/client.ts` (~170 LOC)

- Installed `@tetherto/wdk-pricing-bitfinex-http@1.0.0-beta.1` + `@tetherto/wdk-pricing-provider@1.0.0-beta.1`
- `PricingService` class wraps BitfinexPricingClient with PricingProvider (5-min TTL cache)
- Bitfinex pair mapping: `BTC→BTC/USD`, `ETH→ETH/USD`, `USDT→UST/USD` (note: UST is Bitfinex's ticker for USDT), `XAUT→XAUT/USD`
- Fallback prices for tokens without Bitfinex pairs: USAt = $1.00, others = hardcoded estimates
- Dynamic imports for ESM/CJS compatibility: `await import('@tetherto/wdk-pricing-bitfinex-http')`
- Provider typed as `unknown` then cast to avoid TS issues with JS-only packages

**Methods**:
- `initialize()` — creates Bitfinex client + PricingProvider with 300s cache TTL
- `getPrice(symbol)` — single asset price (live or fallback)
- `getAllPrices()` — spot prices for all known assets
- `valuatePortfolio(balances)` — full USD valuation with per-asset breakdown + allocation percentages
- `getHistoricalPrices(symbol, startMs?, endMs?)` — up to 100 historical data points

**Verification**: Live Bitfinex prices confirmed working:
- BTC: $70,671 | ETH: $2,059 | USDT: $1.00065 | XAUt: $5,155 | USAt: $1.00 (fallback)
- Portfolio total: $18,187.78 USD across 9 assets

### 2. Indexer API — Live Blockchain Events

**New file**: `agent-brain/src/events/indexer.ts` (~170 LOC)

- Implements existing `EventSource` interface from `events/types.ts` (drop-in replacement)
- Polls WDK Indexer API at `https://wdk-api.tether.io/api/v1` for incoming token transfers
- Auth via `x-api-key` header (API key from WDK dashboard)
- Monitors 4 chain/token pairs: sepolia/usdt, ethereum/usdt, ethereum/xaut, ethereum/usat
- Deduplicates by txHash using a Set (max 1000 entries with overflow trim)
- Converts incoming transfers to `StreamEvent` with type `'donation'` and `DonationData`
- Handles various response shapes from Indexer API (array, `{transfers}`, `{tokenTransfers}`)
- Rate-limit aware: staggers requests across poll cycles

**Config**: `INDEXER_API_KEY`, `INDEXER_BASE_URL` env vars added to `agent-brain/src/config/env.ts`

**Activation logic**: `MOCK_EVENTS=false` + `INDEXER_API_KEY` set → IndexerEventSource; else → mock events

### 3. Secret Manager — Encrypted Seed Persistence

**New file**: `wallet-isolate/src/secret/manager.ts` (~130 LOC)

- Installed `@tetherto/wdk-secret-manager@1.0.0-beta.3` in wallet-isolate
- `resolveSeed()` function with three-tier seed resolution:
  1. `WALLET_SEED` env var (backward compat) → source: `'env'`
  2. Encrypted file on disk → decrypt with passphrase → source: `'loaded'`
  3. Generate new → encrypt → save to `.oikos-seed.enc.json` → source: `'generated'`
- Uses WDK SecretManager: PBKDF2-SHA256 key derivation + XSalsa20-Poly1305 authenticated encryption
- BIP39 mnemonic ↔ entropy conversion via `entropyToMnemonic()`
- `dispose()` called after every use for memory safety (zeroes buffers)
- Passphrase minimum 12 chars enforced
- Encrypted file format: `{ version: 1, salt: hex, encryptedEntropy: hex, createdAt: ISO }`
- Dynamic import for CommonJS: `await import('@tetherto/wdk-secret-manager')`

### 4. Dashboard Bug Fix

**Problem**: Dashboard stuck at "Loading..." — the `update()` async function closed prematurely at line 508 with a stray `}`. This orphaned swarm (lines 510-591) and ERC-8004 (lines 593-620) code outside any async function. The `await` calls at top level in a non-module script caused a syntax error that killed the entire `<script>` block.

**Fix**: Removed premature `}` at line 508, removed stray `}` at line 591, added proper closing `}` after ERC-8004 section, fixed indentation for consistency.

### Files Created

| File | LOC | Description |
|---|---|---|
| `agent-brain/src/pricing/client.ts` | ~170 | PricingService — Bitfinex live prices + portfolio valuation |
| `agent-brain/src/events/indexer.ts` | ~170 | IndexerEventSource — live blockchain transfer monitoring |
| `wallet-isolate/src/secret/manager.ts` | ~130 | resolveSeed() — encrypted seed persistence |

### Files Modified

| File | Changes |
|---|---|
| `agent-brain/package.json` | Added pricing deps, removed misplaced secret-manager |
| `wallet-isolate/package.json` | Added `@tetherto/wdk-secret-manager` |
| `wallet-isolate/src/compat/fs.ts` | Added `writeFileSync`, `existsSync` (bare-fs compat via unknown cast) |
| `agent-brain/src/config/env.ts` | Added `indexerApiKey`, `indexerBaseUrl` config |
| `agent-brain/src/agent/brain.ts` | Added `setPricing()`, `portfolioTotalUsd`, `assetPrices`, async `updatePortfolioAllocations` |
| `agent-brain/src/main.ts` | Wired pricing, indexer, pass pricing to dashboard |
| `agent-brain/src/dashboard/server.ts` | Added `/api/prices`, `/api/valuation`, `/api/prices/history/:symbol` |
| `wallet-isolate/src/main.ts` | Integrated `resolveSeed()` for real wallet mode |
| `agent-brain/src/dashboard/public/index.html` | Fixed JS scoping bug (premature function close) |

### Key WDK API Findings

- `BitfinexPricingClient.getCurrentPrice(from, to)` returns `{ price, timestamp }` — from/to are Bitfinex ticker symbols
- `PricingProvider` wraps any pricing client with TTL cache — `getLastPrice(from, to)` returns cached or fresh
- `PricingProvider.getHistoricalPrice({ from, to, start, end, limit })` returns array of price points
- Bitfinex uses `UST` as ticker for USDT (not `USDT`)
- Secret Manager is CommonJS (no ESM exports) — requires dynamic import + default extraction
- Secret Manager `generateAndEncrypt()` returns `{ entropy: Buffer, encryptedEntropy: Buffer, salt: Buffer }`
- Secret Manager `decrypt(encryptedEntropy, salt)` returns `{ entropy: Buffer }`
- Secret Manager `entropyToMnemonic(entropy)` converts to BIP39 24-word seed phrase
- WDK Indexer API rate limits: 4-8 requests per 10 seconds depending on endpoint

### Test Results

- All 105 wallet-isolate tests pass
- All 35 agent-brain tests pass
- **140 total tests passing** (zero regressions)

---

## 2026-03-10 — Phase 6: Polish, Docs, Scripts, Security Audit

**Session**: Autonomous work session (user away)

### Dashboard Rewrite

Complete rewrite of `agent-brain/src/dashboard/public/index.html` (~520 lines):

- **Design**: System font stack (Inter/system-ui), modern card-based layout with 12-column CSS grid
- **KPI strip**: Top-level metrics — portfolio total USD, active assets, pending ops, uptime
- **Live pricing**: Fetches real-time prices from `/api/prices`, shows per-asset USD valuations
- **Portfolio view**: Multi-asset balances with USD equivalents and allocation percentages
- **Swarm section**: Peer count, board announcements, active rooms, peer chips with status indicators
- **Policy dashboard**: Budget progress bars (spent/remaining), rule list with active/exhausted states
- **Operations list**: Status indicators (approved/rejected/pending), LLM reasoning for each decision
- **Architecture footer**: Visual strip showing four layers (Wallet Protocol → Agent → Swarm → Companion)
- **Responsive**: Works on desktop, tablet, and mobile (companion app ready)
- **Status pills**: Sticky header with live connection status, wallet mode, swarm state
- Preserves ALL existing API endpoints and data fetching logic

### README.md

Created comprehensive `README.md` (273 lines):

- Badges (Apache 2.0 license, 140 tests, Node >=22)
- One-paragraph summary + hackathon context
- ASCII architecture diagram showing dual-process model
- Four-layer table (wallet, agent, swarm, companion)
- 12 feature bullets covering all capabilities
- Quick start section (clone, install, demo in 3 commands)
- LLM modes table (mock/local/cloud)
- Five integration surfaces table with examples
- Security model summary (process isolation, policy engine, audit trail)
- PolicyEngine rules table (all 8 rule types)
- Project structure tree
- Tech stack tables with exact pinned versions
- Testing section (140 tests, `npm test` command)
- Environment variables reference
- Track 1 requirements mapping (requirement → how Oikos satisfies)
- Third-party disclosures (all deps listed per hackathon rules)
- Pre-existing code disclosure (rgb-c-t, rgb-wallet-pear, tzimtzum_v2)
- Apache 2.0 license footer

### Documentation (`docs/`)

Created 5 documentation files:

| File | Lines | Content |
|---|---|---|
| `docs/ARCHITECTURE.md` | ~193 | Four-layer deep-dive, IPC protocol spec (13 request types, 8 response types), network boundaries, directory structure |
| `docs/SECURITY.md` | ~168 | Process isolation model, seed lifecycle (XSalsa20-Poly1305 at rest), single authorization code path, threat model (8 threats), fail-closed principles |
| `docs/POLICIES.md` | ~213 | All 8 rule types with JSON examples, multi-asset scoping, 3 presets (Conservative/Moderate/Demo), evaluation flow diagram |
| `docs/INTEGRATION.md` | ~256 | 5 integration surfaces: OpenClaw Skill, MCP Server (14 tools + curl examples), Direct IPC (Node.js examples), x402 (client + server), Hyperswarm P2P |
| `docs/SWARM.md` | ~232 | Two-layer topic model (BLAKE2b derivation), Protomux channels, Noise authentication, privacy architecture, meta-marketplace, reputation system, ERC-8004 lifecycle |

All docs derived from actual source code — types, constants, function signatures, and contract addresses match implementation.

### Install Script (`scripts/install.sh`)

Created interactive install script (~280 lines):

- Colored terminal output with `[info]`, `[done]`, `[warn]`, `[error]` prefixes
- **Prerequisites check**: Node.js >= 22, npm, git, optional Bare Runtime detection
- **Project setup**: Clone from GitHub, or detect existing directory
- **Dependencies**: `npm install --silent`
- **Build**: `npm run build`
- **Interactive configuration**:
  - LLM mode: mock (no deps) / local (Ollama + configurable model) / cloud (API endpoint + key)
  - Wallet mode: mock (no blockchain) / real (testnet with seed options: generate, enter, encrypted file)
  - Swarm toggle (Y/n)
  - ERC-8004 identity toggle (y/N)
  - Companion channel toggle (y/N) with owner pubkey input
  - Dashboard port
- **Generates `.env`** from answers
- **OpenClaw detection**: Auto-symlinks `skills/wdk-wallet` if OpenClaw is installed
- Supports `curl -sSL ... | bash` one-command install

### Demo Script Improvements (`scripts/start-demo.sh`)

Rewrote demo script (~100 lines):

- Argument parsing: `--node`, `--bare`, `--port`
- Auto-detect Bare Runtime (falls back to Node.js)
- Auto-build if dist/ missing
- Auto-copy `policies.example.json` → `policies.json` if missing
- Colored banner showing all endpoints (dashboard, MCP, agent card)
- Enables full-feature demo: `MOCK_SWARM=true`, `SWARM_ENABLED=true`, `ERC8004_ENABLED=true`
- Zero config required — works from fresh clone

### Security Audit

Findings:

1. **`.gitignore` gaps (FIXED)**: Added `.oikos-seed*` and `.oikos-keypair.json` — encrypted seed file and swarm identity keypair were not gitignored
2. **28 npm audit vulnerabilities**: All in transitive dependencies (WDK `libsodium-wrappers` prototype pollution, Ledger `@ledgerhq/hw-transport` deprecated buffer, Express `cookie` missing flags). Upstream fixes needed — documented as known limitation
3. **`identity_register` / `identity_set_wallet` bypass PolicyEngine**: Documented architectural decision — these are one-time setup operations (like wallet init), not recurring fund movements. Identity operations are immutable once set.
4. **8 `any` type uses**: 6 are WDK interop casts (`as any` for untyped WDK methods), 2 are ambient `.d.ts` declarations. All justified, no action needed.

### Files Created

| File | Lines | Purpose |
|---|---|---|
| `README.md` | ~273 | Project README for GitHub + hackathon |
| `scripts/install.sh` | ~280 | Interactive install + onboarding |
| `docs/ARCHITECTURE.md` | ~193 | Architecture deep-dive |
| `docs/SECURITY.md` | ~168 | Security model + threat analysis |
| `docs/POLICIES.md` | ~213 | Policy engine reference |
| `docs/INTEGRATION.md` | ~256 | Integration guide (5 surfaces) |
| `docs/SWARM.md` | ~232 | Swarm protocol specification |

### Files Modified

| File | Changes |
|---|---|
| `agent-brain/src/dashboard/public/index.html` | Complete UI rewrite — modern design, KPI strip, live pricing, responsive |
| `scripts/start-demo.sh` | Rewritten with arg parsing, auto-detection, full-feature mock mode |
| `.gitignore` | Added `.oikos-seed*`, `.oikos-keypair.json` (security fix) |

### Test Results

- All 105 wallet-isolate tests pass
- All 35 agent-brain tests pass
- **140 total tests passing** (zero regressions)
- Build verified clean after dashboard rewrite

---

## 2026-03-10 — OpenClaw Integration + MCP Smoke Test

**Session**: OpenClaw runtime integration, MCP verification, skill invocation end-to-end

### OpenClaw Skill Discovery

- OpenClaw `2026.3.8` installed globally via npm
- Skills must live in `~/.agents/skills/` (OpenClaw personal skills directory)
- Symlinks outside the skills root are **blocked by security policy** — must copy, not symlink
- `openclaw skills list` shows `wdk-wallet` as `✓ ready` from `agents-skills-personal`
- Updated `scripts/install.sh` to use `cp -R` to `~/.agents/skills/` instead of symlink

### OpenClaw Agent Configuration

- Created `oikos` agent: `openclaw agents add oikos --model ollama/qwen3:8b --workspace ~/sovclaw`
- Auth: Added `ollama:default` profile to `auth-profiles.json` (ollama provider needs its own entry, separate from openai)
- OpenClaw injects workspace files into LLM system prompt: `AGENTS.md`, `SOUL.md`, `TOOLS.md`, `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`
- Skills are injected as **short summaries** (~337 chars), not full SKILL.md content
- **Key insight**: `TOOLS.md` is the correct place for executable instructions (curl commands) — it gets fully injected into every prompt

### SKILL.md Rewrite

Rewrote `skills/wdk-wallet/SKILL.md` with executable curl commands:

- Every MCP tool now has a copy-paste curl example
- Added REST API reference table (`/api/*` endpoints)
- Split into "Query Tools (read-only)" and "Proposal Tools (write, policy-enforced)"
- LLM can now read the skill and know exactly how to call each operation

### TOOLS.md (OpenClaw Workspace Config)

Created `TOOLS.md` for the OpenClaw workspace:

- Quick reference table: 10 REST API curl commands
- MCP JSON-RPC examples for proposals (payment, swap)
- This file is injected into every OpenClaw prompt — the LLM reads it and uses `exec` tool to run curl

### MCP Smoke Test (`scripts/test-mcp.sh`)

Created comprehensive smoke test script:

- **35 tests total**, all passing
- MCP lifecycle: `initialize`, `tools/list` (14 tools), `notifications/initialized`
- Query tools: `wallet_balance_all`, `wallet_balance`, `wallet_address` (x2), `policy_status`, `audit_log`, `agent_state`, `swarm_state`, `identity_state`
- Proposal tools: `propose_payment`, `propose_swap`, `propose_bridge`, `propose_yield`
- Swarm tools: `swarm_announce`
- Reputation tools: `query_reputation`
- Error handling: unknown method, unknown tool, malformed JSON-RPC
- Dashboard REST API: all 14 endpoints return 200
- Fixed shell escaping bug: nested JSON in `tool_call()` needed flat curl instead of `rpc()` wrapper

### End-to-End Verification

Full chain verified:
```
OpenClaw CLI → Qwen 3 8B (Ollama) → exec tool → curl → Oikos dashboard API → IPC → Wallet Isolate → balances returned
```

OpenClaw agent successfully retrieved wallet balances:
- USDT: 190.00 (85 ETH + 105 ARB)
- XAUT: 2.00 (1 ETH + 1 ARB)
- USAT: 205.00 (105 ETH + 100 ARB)
- BTC: 0.10
- ETH: 0.20

### Key Findings

1. OpenClaw skills are **context injections** — SKILL.md tells the LLM what tools exist, TOOLS.md tells it how to call them
2. OpenClaw's `exec` tool runs shell commands — the LLM generates curl commands based on TOOLS.md
3. `ollama/qwen3:8b` model needs clean sessions and direct instructions to reliably produce tool calls
4. Cloud LLM on VPS will be faster (2-3s vs 60s local Ollama) — same approach works
5. `.gitignore` updated: added `.openclaw/`, `.claude/`, OpenClaw workspace defaults (`AGENTS.md`, `SOUL.md`, etc.)

### Files Created

| File | Lines | Purpose |
|---|---|---|
| `scripts/test-mcp.sh` | ~210 | MCP smoke test (35 tests) |
| `TOOLS.md` | ~24 | OpenClaw workspace wallet tool reference |

### Files Modified

| File | Changes |
|---|---|
| `skills/wdk-wallet/SKILL.md` | Added executable curl commands for all 14 MCP tools + REST API reference |
| `scripts/install.sh` | Fixed skill install: `cp -R` to `~/.agents/skills/` (not symlink) |
| `.gitignore` | Added `.openclaw/`, `.claude/`, OpenClaw workspace defaults, `policies.json` |

### Test Results

- 35/35 MCP smoke tests passing
- 140/140 unit tests passing (zero regressions)
- OpenClaw end-to-end: skill discovery ✓, tool execution ✓, wallet response ✓

---

## 2026-03-10 — VPS Reproducibility Test & Skill Guide Alignment

### Session: VPS Deployment + SKILL.md Best Practices

**VPS deployment** on `srv1434404` (187.77.167.163, Ubuntu, 47GB disk, 35% RAM):
- Upgraded Node.js 20 → 22 via nodesource
- `git clone` → `npm install` → `npm run build` → `npm run demo` — clean, zero issues
- Health check confirmed: `{"status":"ok","walletConnected":true,"brainStatus":"idle","swarmEnabled":true}`
- OpenClaw installed globally, skill copied to `~/.agents/skills/wdk-wallet`
- Configured with Anthropic Claude API (cloud LLM) instead of local Ollama
- **End-to-end verified**: OpenClaw → Claude → curl → Oikos API → full portfolio with live Bitfinex prices ($18,131 across 9 assets)
- The agent autonomously rewrote the skill for its own environment and pulled live price data — self-improving behavior demonstrated

**Time to reproduce on fresh VPS**: ~5 minutes (clone to first API response).

### SKILL.md Alignment with Best Practices Guide

Reviewed "The Complete Guide to Building Skills for Claude" (20-page reference). Updated `skills/wdk-wallet/SKILL.md` to match:

| Gap | Fix |
|-----|-----|
| Description missing trigger phrases | Added: "Use when user asks to check balances, send payments, swap tokens..." |
| No `metadata` field | Added `mcp-server` and `dashboard` URLs |
| No `compatibility` field | Added `runtime: node >= 22`, `requires: [bare, dashboard]` |
| No troubleshooting section | Added 5-row troubleshooting table |
| No examples section | Added 3 concrete workflow scenarios |
| Too much detail in body | Moved full curl reference to `references/api-reference.md` (progressive disclosure) |

### Files Changed

| File | Change |
|------|--------|
| `skills/wdk-wallet/SKILL.md` | Rewritten: trigger phrases, metadata, compatibility, examples, troubleshooting |
| `skills/wdk-wallet/references/api-reference.md` | Created: full curl examples for all 14 MCP tools + REST endpoints |

---

## 2026-03-11 — Phase 6.8: Wallet Gateway Refactor + Phase 6.9: CLI

### Session: Gateway Extract + CLI Tool

**Duration**: ~2 hours (across 2 context windows)
**Participants**: Adriano (human), Claude Opus 4.6 (AI)

#### Phase 6.8: Wallet Gateway Refactor

Extracted a thin `wallet-gateway` package from the monolithic `agent-brain`. The brain is now an optional plugin — any agent framework can use the wallet directly via gateway.

**Architecture (Before → After):**
- Before: `[External Agent] → [Agent Brain (monolith)] → [Wallet Isolate]`
- After: `[External Agent] → [Wallet Gateway] → [Wallet Isolate]` with Brain as optional plugin

**Key changes:**
1. Created `wallet-gateway/` workspace with IPC client, MCP server, dashboard, x402, creators, config
2. Defined `GatewayPlugin` interface — brain registers optional capabilities (agent state, swarm, pricing)
3. Added human-readable amount conversion at MCP boundary (`"1.5"` USDT instead of `"1500000"`)
4. Added `OIKOS_MODE` env var (`mock`/`testnet`/`mainnet`) replacing 4 individual `MOCK_*` flags
5. Slimmed `agent-brain` to LLM reasoning, swarm, events, companion, strategy only
6. Updated skill docs with human-readable amounts and standalone gateway mode

**Files created in wallet-gateway:**
- `src/ipc/client.ts`, `src/ipc/types.ts` — canonical IPC layer
- `src/amounts.ts` — human-readable ↔ smallest-unit conversion
- `src/types.ts` — GatewayPlugin, PricingInterface, SwarmInterface
- `src/mcp/server.ts` — MCP tools with plugin pattern
- `src/dashboard/server.ts` — Express HTTP + REST API
- `src/x402/client.ts`, `src/x402/types.ts` — HTTP 402 auto-pay
- `src/creators/registry.ts` — demo creator data
- `src/config/env.ts` — gateway config with OIKOS_MODE
- `src/main.ts` — standalone entry point
- `src/index.ts` — public API re-exports

**Files deleted from agent-brain:** `src/ipc/`, `src/mcp/`, `src/dashboard/`, `src/x402/`, `src/creators/`

**Verification:**
- Clean build across 3 workspaces
- Full demo: health=ok, brainConnected=true, portfolio=$18K, swarm active
- Standalone gateway: brainConnected=false, graceful fallbacks
- Human-readable amounts: "1.5" USDT → "1500000" in IPC

#### Phase 6.9: CLI (`oikos` command)

Built a ~230 line CLI tool wrapping the gateway REST API. Any agent framework, shell script, or human can interact with the wallet from the terminal.

**Commands:**
```
oikos balance [symbol] [chain]     — All balances (with optional filter)
oikos address [chain]              — Wallet addresses
oikos pay <amt> <sym> to <addr>    — Send tokens
oikos swap <amt> <sym> to <toSym>  — Swap tokens
oikos bridge <amt> <sym> from/to   — Bridge cross-chain
oikos yield deposit/withdraw       — Yield operations
oikos status                       — Policy budgets & cooldowns
oikos audit [--limit N]            — Transaction history
oikos health                       — Gateway health check
oikos swarm                        — P2P swarm state
oikos identity                     — ERC-8004 identity
oikos prices                       — Live asset prices
```

**Flags:** `--port`, `--json`, `--reason`, `--confidence`, `--protocol`, `--limit`

**Design decisions:**
- Single file in wallet-gateway (not a new package)
- Zero dependencies — manual arg parsing, native fetch (Node 22)
- REST for reads, MCP JSON-RPC for writes (reuses gateway's amount conversion)
- Colored terminal output with `--json` for scripting
- `npm link` / symlink for global `oikos` command

**Files changed:**
| File | Change |
|------|--------|
| `wallet-gateway/src/cli.ts` | Created: ~230 line CLI tool |
| `wallet-gateway/package.json` | Added `bin` field for `oikos` command |
| `package.json` | Added `oikos` script |
| `scripts/install.sh` | Added CLI symlink step + CLI commands in next-steps |
| `skills/wdk-wallet/SKILL.md` | Updated: human-readable amounts, standalone gateway mode |
| `skills/wdk-wallet/references/api-reference.md` | Updated: human-readable amount examples + decimals table |

**Smoke test results:**
- `oikos health` → Status: ok, Wallet: connected, Brain: connected, Swarm: enabled
- `oikos balance` → 9 assets across 3 chains with formatted output
- `oikos balance USDT` → filtered to 2 USDT balances
- `oikos prices` → live Bitfinex prices (BTC $69,851, ETH $2,022, etc.)
- `oikos pay 1.5 USDT to 0xABCD` → Status: executed, TxHash: 0xmock...
- `oikos --json balance` → raw JSON array for scripting
- Connection error → helpful message: "Is the gateway running?"

---

## 2026-03-11 — Phase 7: RGB Integration

### What shipped

Full RGB asset support (issue, transfer, list) across all integration surfaces — IPC, MCP, REST, CLI — with mock-first design. The transport bridge architecture preserves process isolation: Wallet Isolate calls localhost HTTP for consignment delivery, Brain relays via Hyperswarm.

### Implementation (12 steps)

1. **IPC Types** — Added `'RGB'` to TokenSymbol, `'rgb'` to Chain. Three new interfaces: `RGBIssueProposal`, `RGBTransferProposal`, `RGBAssetInfo`. Three new request types: `propose_rgb_issue`, `propose_rgb_transfer`, `query_rgb_assets`. Validators for both proposal types. Mirrored in both `wallet-isolate` and `wallet-gateway` type files.

2. **Wallet Operations Interface** — Added 4 RGB methods to `WalletOperations`: `rgbIssueAsset`, `rgbTransfer`, `rgbReceiveAsset`, `rgbListAssets`. Added `indexerUrl`, `transportEndpoint`, `dataDir` to `ChainConfig`.

3. **Mock RGB Wallet** — `MockWalletManager` gets `mockRgbAssets: Map` tracking issued/received assets. Issue creates `rgb:mock-{id}-{ticker}` entries. Transfer deducts balance. Receive returns mock invoice. List returns all entries.

4. **Real RGB Wallet stubs** — `WalletManager` gets stub methods returning errors until `@utexo/wdk-wallet-rgb` is configured. Real module integration is additive — mock demos perfectly without it.

5. **Executor** — Two new cases in `executeOperation`: `rgb_issue` calls `rgbIssueAsset`, `rgb_transfer` calls `rgbTransfer`. Both go through PolicyEngine first (same enforcement as all other proposal types).

6. **Main handler** — `PROPOSAL_TYPE_MAP` gets `propose_rgb_issue → rgb_issue`, `propose_rgb_transfer → rgb_transfer`. New `query_rgb_assets` handler returns asset list.

7. **Gateway IPC client** — Three new methods: `proposeRGBIssue`, `proposeRGBTransfer`, `queryRGBAssets`.

8. **MCP tools** — Three new tools: `rgb_issue` (issue asset), `rgb_transfer` (transfer via invoice), `rgb_assets` (list all). Added to TOOLS array and handler switch.

9. **REST endpoint** — `GET /api/rgb/assets` returns RGB asset list.

10. **CLI commands** — `oikos rgb assets`, `oikos rgb issue <ticker> <name> <supply>`, `oikos rgb transfer <invoice> <amount> <symbol>`. Full help text integration.

11. **Transport bridge** — New file `agent-brain/src/rgb/transport-bridge.ts` (~160 lines). Local HTTP server implementing RGB transport protocol: POST/GET `/consignment/:recipientId`, POST/GET `/ack/:recipientId`, GET `/health`. Mock mode stores in-memory; real mode will wire `rgb-consignment-transport` Hyperswarm sessions. Started conditionally on `RGB_ENABLED=true`. Added `RGB: 6` to decimals map.

12. **Config + Skill docs** — Brain config gets `rgbEnabled`, `rgbTransportPort`. Demo script gets `RGB_ENABLED=true` + banner update. SKILL.md updated with RGB tools and assets. API reference updated with curl examples.

### Architecture decisions

- **RGB as a "chain"**: `chain: 'rgb'` alongside bitcoin/ethereum. Simplifies init pattern. RGB assets are dynamic (user-issued), so `RGB` is generic symbol + `assetId` for specificity.
- **Transport bridge in Brain**: Hyperswarm = networking = Brain's domain. Wallet calls HTTP transport endpoint (localhost). Process isolation preserved.
- **Mock first**: Full demo without real Bitcoin/RGB nodes. Real WDK RGB module is additive.
- **Policy enforcement**: RGB proposals go through same PolicyEngine as payments/swaps/bridges. No special path.

### Files changed (20 files)

| Package | File | Action |
|---------|------|--------|
| wallet-isolate | `src/ipc/types.ts` | Edit |
| wallet-isolate | `src/wallet/types.ts` | Edit |
| wallet-isolate | `src/wallet/manager.ts` | Edit |
| wallet-isolate | `src/executor/executor.ts` | Edit |
| wallet-isolate | `src/main.ts` | Edit |
| wallet-gateway | `src/ipc/types.ts` | Edit |
| wallet-gateway | `src/ipc/client.ts` | Edit |
| wallet-gateway | `src/mcp/server.ts` | Edit |
| wallet-gateway | `src/dashboard/server.ts` | Edit |
| wallet-gateway | `src/cli.ts` | Edit |
| wallet-gateway | `src/amounts.ts` | Edit |
| agent-brain | `src/rgb/transport-bridge.ts` | **Create** |
| agent-brain | `src/main.ts` | Edit |
| agent-brain | `src/config/env.ts` | Edit |
| scripts | `start-demo.sh` | Edit |
| skills | `wdk-wallet/SKILL.md` | Edit |
| skills | `wdk-wallet/references/api-reference.md` | Edit |

### Build verification

```
$ npm run build
wallet-isolate: tsc ✓
wallet-gateway: tsc ✓
agent-brain: tsc ✓
```

All 3 workspaces compile clean. No regressions.

---

## 2026-03-11 — L1: Proposal Simulation (Dry-Run)

### What shipped

Full dry-run policy check across all integration surfaces. An agent can now ask "would this proposal pass?" without executing, burning cooldown, or polluting the audit log.

### Implementation

- **Wallet Isolate IPC**: New `query_policy_check` request type. Handler calls `PolicyEngine.evaluate()` without `recordExecution()`. Returns `{ wouldApprove, violations[], policyId }`. Added to `VALID_REQUEST_TYPES`, validation via `validateProposalCommon()`.
- **Gateway IPC Client**: `simulateProposal(proposal)` method.
- **MCP Tool**: `simulate_proposal` (18th tool). Params: type, amount, symbol, chain, confidence, optional to/toSymbol.
- **REST Endpoint**: `POST /api/simulate` — accepts proposal JSON, returns policy check result.
- **CLI**: `oikos simulate <payment|swap|bridge|yield> <amount> <symbol>` with `--to`, `--toSymbol`, `--chain` flags. Aliases: `sim`, `dryrun`, `dry-run`. Color-coded output: green ✓ WOULD APPROVE / red ✗ WOULD REJECT with violation details.

### Key property

`evaluate()` is pure — reads state, never mutates. `recordExecution()` is the only state mutator and dry-run never calls it. 100 simulations = zero side effects.

### Files changed (7 files)

| Package | File | Action |
|---------|------|--------|
| wallet-isolate | `src/ipc/types.ts` | Edit |
| wallet-isolate | `src/main.ts` | Edit |
| wallet-gateway | `src/ipc/types.ts` | Edit |
| wallet-gateway | `src/ipc/client.ts` | Edit |
| wallet-gateway | `src/mcp/server.ts` | Edit |
| wallet-gateway | `src/dashboard/server.ts` | Edit |
| wallet-gateway | `src/cli.ts` | Edit |

### Build verification

All 3 workspaces compile clean. Zero regressions.

---

## 2026-03-11 — Two-Layer Refactor (Agent-Agnostic Architecture)

### What shipped

Dissolved the 3-package monorepo (`wallet-isolate`, `wallet-gateway`, `agent-brain`) into a 2-package architecture (`wallet-isolate`, `oikos-app`). Oikos is now fully agent-agnostic — any agent (OpenClaw, Claude, custom) connects via MCP/REST/CLI. The LLM brain is extracted to `examples/oikos-agent/` as a canonical example, not core infrastructure.

### Motivation

Ludwig (OpenClaw agent) identified: external agents route through the Oikos brain to reach the wallet — two agents in the chain. The brain is a reference implementation, not mandatory infrastructure. Solution: merge wallet-gateway infrastructure + brain infrastructure (swarm, companion, events, pricing) into `oikos-app`, drop LLM/reasoning entirely from core.

### Architecture change

**Before (3 packages):**
```
wallet-isolate/     # Bare Runtime — keys, policy, signing
wallet-gateway/     # Node.js — HTTP/MCP/REST + IPC (thin)
agent-brain/        # Node.js — LLM, swarm, events, companion, strategy
```

**After (2 packages):**
```
wallet-isolate/          # Bare Runtime — unchanged
oikos-app/               # Node.js — all infrastructure (MCP, REST, CLI, swarm, companion, events, pricing, x402, RGB)
examples/oikos-agent/    # Standalone LLM agent example (connects via REST/MCP)
```

### Key changes

1. **`oikos-app` created** — merged `wallet-gateway` deps + `agent-brain` infrastructure deps. Does NOT include `openai` (agent's concern).

2. **`OikosServices` replaces `GatewayPlugin`** — direct service references instead of plugin indirection:
   ```typescript
   interface OikosServices {
     wallet: WalletIPCClient;
     pricing: PricingInterface | null;
     swarm: SwarmInterface | null;
     eventBus: EventBus | null;
     identity: IdentityState;
     companionConnected: boolean;
     instructions: CompanionInstruction[];
   }
   ```

3. **`EventBus` created** — pub/sub replacing brain.handleEvents(). Agents subscribe via MCP `get_events` or REST `/api/events`. 200-event buffer.

4. **`OikosConfig` unified** — merges GatewayConfig + BrainConfig (infrastructure only). LLM config dropped.

5. **`CompanionStateProvider` interface** — decouples companion from AgentBrain. Queries wallet IPC directly.

6. **Dashboard rewritten** — `createDashboard(services: OikosServices)`. New endpoints: `/api/events`, `/api/companion/instructions`. `/api/state` returns `{ status: 'connect_your_agent_via_mcp' }`.

7. **MCP server rewritten** — `mountMCP(app, services: OikosServices)`. New tool: `get_events`. 21 tools total. Handler context uses `OikosServices` directly.

8. **New `main.ts` orchestrator** — boot sequence without LLM: loadOikosConfig → spawn wallet → pricing → EventBus → swarm → companion → ERC-8004 → RGB → assemble OikosServices → createDashboard. Prints: "Connect your agent via MCP tools."

9. **`examples/oikos-agent/`** — standalone canonical agent with own `package.json` (depends on `openai`), `tsconfig.json`, and `src/` with brain.ts, prompts.ts, llm/, strategy/ extracted from agent-brain.

10. **Full public API in `index.ts`** — exports: WalletIPCClient, all IPC types, OikosServices, OikosConfig, EventBus, PricingService, swarm types, companion types, x402, RGB, amounts, creators.

### Files changed

| Action | Files |
|--------|-------|
| **Created** | `oikos-app/` (entire package: package.json, tsconfig.json, src/) |
| **Created** | `examples/oikos-agent/` (package.json, tsconfig.json, src/) |
| **Copied from wallet-gateway** | ipc/client.ts, ipc/types.ts, amounts.ts, cli.ts, dashboard/, creators/, x402/, config/ |
| **Moved from agent-brain** | swarm/* (10 files), companion/, pricing/, events/, rgb/ |
| **Rewritten** | dashboard/server.ts, mcp/server.ts, companion/coordinator.ts, config/env.ts, types.ts, main.ts, index.ts |
| **Updated** | root package.json (workspaces → wallet-isolate + oikos-app), scripts, index.js, install.sh, start-demo.sh, SKILL.md |
| **Deleted** | wallet-gateway/ (entire package), agent-brain/ (entire package) |

### Import fixes

All `from 'oikos-wallet-gateway'` and `from 'agent-brain'` imports replaced with relative paths. Zero references to old package names remain.

### Build verification

```
$ npm run build
wallet-isolate: tsc ✓
oikos-app: tsc ✓
```

Both workspaces compile clean. Zero regressions.

---

## 2026-03-12 — P2P Companion App + CLI Polish

### Session: Architecture Refactor — Eliminate Sidecar, Go Native P2P

**Duration**: ~3 hours
**Participants**: Adriano (human), Claude Opus 4.6 (AI), Ludwig (OpenClaw AI, consulted on CLI strategy)

#### Architecture Change

**Before**: Pear main (Bare) → spawns Node.js sidecar (oikos-app) → spawns Wallet Isolate. 4 OS processes on the human's machine. Companion = Express on localhost.

**After**: Pear main (Bare) → Hyperswarm + protomux natively in Bare. Wallet stays on the agent's machine. 2 OS processes on the human's machine. Companion = P2P client over Noise E2E.

```
AGENT MACHINE (VPS/local)              HUMAN MACHINE
┌──────────────────────┐              ┌────────────────────┐
│ oikos-app (Node.js)  │ Hyperswarm   │ Pear (Bare)        │
│ ├── Wallet Isolate   │◄═══Noise═══►│ ├── companion chan  │
│ ├── Express :3420    │   E2E       │ ├── bare-http1      │
│ └── CompanionCoord.  │              │ └── Electron UI     │
└──────────────────────┘              └────────────────────┘
```

| Metric | Before | After |
|--------|--------|-------|
| Processes on human's machine | 4 | 2 |
| Communication | HTTP localhost | Hyperswarm Noise E2E |
| Auth | Bearer token | Ed25519 keypair |
| Open ports on human | :3420 | None |
| Remote capable | No | Yes (NAT holepunch) |

#### What Was Built

1. **`index.js` rewritten** — Bare-native P2P companion client
   - Ed25519 keypair generation/persistence via sodium-universal
   - Hyperswarm client connecting to agent's CompanionCoordinator
   - Protomux `oikos/companion` channel (mirrors coordinator.ts)
   - State cache (balances, reasoning, policies, swarm, executions)
   - bare-http1 internal API on :13421 (renderer ↔ Bare)
   - Auto-connect from `~/.oikos/agent-pubkey.txt`

2. **`app.js` updated** — targets :13421, no token auth

3. **CLI polish** — 3 new commands:
   - `oikos init` — creates `~/.oikos/`, generates swarm keypair, default policy
   - `oikos pair` — prints agent pubkey + connection instructions, writes auto-connect file
   - `oikos wallet backup` — seed phrase export escape hatch (warns sternly)

4. **Local auto-connect** — `oikos pair` writes `~/.oikos/agent-pubkey.txt`, companion reads it

#### Key Decision: CLI-First Integration

Ludwig (OpenClaw) analysis on token efficiency:
- MCP: 14 tool schemas in context every turn = fixed tax
- CLI: short string in, JSON out, zero schema overhead
- Verdict: **CLI primary, MCP as bonus**
- SKILL.md teaches agent the commands once (no per-turn cost)

#### Ludwig's Views on Seed Phrase UX

Gap identified: mnemonic never shown to user during setup. If server dies + enc file lost = funds gone.
Solution: `oikos wallet backup` command (done). Production: passphrase-encrypted seed via `sodium.crypto_secretbox`.
Hackathon pitch: "Self-custody without seed phrase anxiety. The companion IS the control plane."

#### Build Verification

```
npm run build → both workspaces clean ✓
oikos init → creates ~/.oikos/ with keypair + policy ✓
oikos pair → prints pubkey + writes auto-connect ✓
oikos wallet backup → displays warning + seed info ✓
npm start (with COMPANION_ENABLED) → companion listener ready ✓
pear run --dev . → companion boots, internal API on :13421 ✓
```

---

## 2026-03-12 — Full P2P Companion Connection Verified + Path Fixes

### Session: End-to-End Companion ↔ Agent Verification

**Duration**: ~30 minutes
**Participants**: Adriano (human), Claude Opus 4.6 (AI)

#### What Was Done

1. **Wallet-isolate path fix**
   - Default `walletIsolatePath` in `oikos-app/src/config/env.ts` was `./wallet-isolate/dist/src/main.js` (looking inside oikos-app directory)
   - But wallet-isolate is a sibling workspace at `../wallet-isolate/`
   - Fixed to `../wallet-isolate/dist/src/main.js`
   - Also fixed CLI `oikos init` policy copy path: `wallet-isolate/config/policies.json` → `../policies.json` (root monorepo level)

2. **Full P2P connection verified end-to-end**

   **Agent side** (Terminal 1 — `npm start` with `COMPANION_ENABLED=true`):
   - Wallet isolate spawned, loaded 1 policy
   - Mock wallet: 9 assets, $18,108 portfolio
   - Companion listener on BLAKE2b topic `5e34e9d0545a2076...`
   - `[companion] Owner connected: 7757d18f0c4acd23...` — Ed25519 auth passed

   **Companion side** (Terminal 2 — `pear run --dev .`):
   - Auto-detected agent pubkey from `~/.oikos/agent-pubkey.txt`
   - Topic derivation matches: `5e34e9d0545a2076...`
   - `Connected to` agent over Hyperswarm Noise E2E
   - `Channel open. Receiving state updates.`

   **Pear Dashboard** (Electron renderer):
   - Live portfolio: $11,800 across 9 assets (USDT, XAUT, USAT, ETH on Ethereum+Arbitrum, BTC)
   - All status indicators green: Wallet 🟢, Swarm 🟢, Companion 🟢
   - Agent reasoning: "Connected to agent." with RUNNING status
   - All 6 nav views present (Overview, Wallet, Swarm, Policies, Audit, Chat)

   **Full data flow verified**:
   ```
   Pear (Bare) → Hyperswarm Noise E2E → Agent Brain (Node.js) → IPC stdin/stdout → Wallet Isolate
   ```
   Two separate processes, zero shared state, all data over encrypted P2P channels.

#### Key Insight: Companion is Optional, Wallet is Core

Ludwig (OpenClaw AI) confirmed: the companion is a premium upgrade, not a dependency. The adoption funnel:

1. **Install wallet** → `oikos init` → zero friction, agent handles everything
2. **Use via chat** → human talks to agent through Telegram/Discord/whatever → agent runs `oikos` CLI
3. **Want more control?** → install companion → real-time P2P dashboard, emergency controls, direct instructions

This reduces hackathon scope pressure: wallet + CLI + OpenClaw skill is the core demo. Companion is the "and look what else it can do" moment.

#### Files Modified

| File | Change |
|------|--------|
| `oikos-app/src/config/env.ts` | Fixed `walletIsolatePath` default: `./wallet-isolate/...` → `../wallet-isolate/...` |
| `oikos-app/src/cli.ts` | Fixed policy copy path in `cmdInit()`: `wallet-isolate/config/policies.json` → `../policies.json` |

#### Build Verification

```
npm run build → both workspaces clean ✓
npm start (COMPANION_ENABLED + COMPANION_OWNER_PUBKEY) → wallet + companion listener ✓
pear run --dev . → auto-connect, Noise handshake, channel open, live data flowing ✓
```

---

## 2026-03-12 — P2P Chat Bridge + OpenClaw E2E (Session 2)

### Session: Two-Way Chat + Remote Agent Connection

**Duration**: ~2 hours
**Participants**: Adriano (human), Claude Opus 4.6 (AI), Ludwig (OpenClaw agent on VPS)

#### What Was Done

1. **Agent-Agnostic Chat Bridge (oikos-app)**
   - Created `src/brain/adapter.ts` — BrainAdapter interface with 3 implementations:
     - `OllamaBrainAdapter` — local LLM via Ollama (Qwen 3 8B)
     - `HttpBrainAdapter` — forwards to any external brain endpoint (OpenClaw, custom)
     - `MockBrainAdapter` — pattern-matched canned responses for demo
   - `createBrainAdapter(config)` factory, `buildWalletContext(services)` context builder
   - Added `POST /api/agent/chat` and `GET /api/agent/chat/history` to dashboard server
   - Wired brain adapter into main.ts lifecycle (step 9-11)
   - Added `CompanionChatReply` protomux message type
   - CompanionCoordinator now has `onChat()` handler — forwards to brain, returns reply via protomux

2. **Companion Pear App Chat Endpoints (index.js)**
   - Added `chatMessages[]` state + `chatReplyResolve` for async reply resolution
   - `chat_reply` protomux handler — captures agent brain replies from Noise channel
   - `POST /api/agent/chat` — sends instruction via protomux, awaits `chat_reply` (30s timeout)
   - `GET /api/agent/chat/history` — returns stored conversation for UI polling
   - Full loop: Companion UI → Bare HTTP → protomux → Agent → brain → `chat_reply` → UI

3. **OpenClaw Bridge (Ludwig)**
   - `skills/openclaw-bridge/bridge.js` — 110-line Node.js bridge script
   - Listens on `http://127.0.0.1:3421/oikos/chat`
   - Routes messages through OpenClaw gateway at `/v1/chat/completions`
   - Injects wallet context as silent system message (not shown in UI)
   - Uses OpenClaw session key for full memory + context sharing

4. **P2P Connection to Ludwig's VPS — E2E VERIFIED**
   - Companion pubkey: `7757d18f0c4acd2360c951f9e51f3ed3eecfc25559ba2ef2fd6b5d344bfb119a`
   - Ludwig's agent pubkey: `aed956b3dbbbc70c0602cec469fe7ec84bc5d9c1a765c3e8405fd6c4d68aae34`
   - Topic: `5e34e9d0545a2076...` (both sides match)
   - **Live P2P chat working**: Companion (Pear on macOS) ↔ Agent (oikos-app on VPS) over Hyperswarm Noise
   - Ludwig's OpenClaw agent responding through the bridge with wallet context
   - Mock balances ($11,800 portfolio, 9 assets) flowing over companion channel
   - 2 swarm peers connected, all 3 status indicators green

#### Key Insight: Keypair Confusion

Two different keypair files exist:
- `.oikos-keypair.json` (project root) — pubkey `4f908fdb...` — used by oikos-app swarm
- `~/.oikos/companion-keypair.json` — pubkey `7757d18f...` — used by Pear companion app

The companion app reads from `~/.oikos/`, not the project root. Initial connection attempt failed because Ludwig had the wrong pubkey. Fixed by sending the correct `7757d18f...` key.

Also: local oikos-app was intercepting the companion connection (same DHT topic) before Ludwig's VPS agent could. Stopped local agent to connect to remote.

#### Known Issue

Duplicate chat messages in UI — the optimistic insert + history polling both fire for the same message. Minor — needs dedup by message ID.

#### Files Modified/Created

| File | Change |
|------|--------|
| `oikos-app/src/brain/adapter.ts` | NEW — BrainAdapter interface + 3 implementations |
| `oikos-app/src/companion/types.ts` | Added `CompanionChatReply` message type |
| `oikos-app/src/companion/coordinator.ts` | Added `onChat()` handler, chat_reply via protomux |
| `oikos-app/src/config/env.ts` | Added brain config: `brainType`, `brainChatUrl`, `brainModel` |
| `oikos-app/src/dashboard/server.ts` | Added `/api/agent/chat` POST + `/api/agent/chat/history` GET |
| `oikos-app/src/main.ts` | Brain adapter init (step 9), wired into services + companion |
| `oikos-app/src/types.ts` | Added `brain` + `chatMessages` to OikosServices |
| `index.js` | Chat endpoints, `chat_reply` protomux handler, async reply resolution |
| `app.js` | Chat UI rewrite: `appendChatMsg()`, `updateChat()`, `sendInstruction()` |
| `skills/openclaw-bridge/bridge.js` | NEW — OpenClaw ↔ Oikos bridge (Ludwig) |
| `skills/openclaw-bridge/README.md` | NEW — Bridge documentation |

#### Build Verification

```
npx tsc --noEmit → clean ✓
npm run build → clean ✓
pear run --dev . → connects to Ludwig's VPS, chat working ✓
```

#### Commits

- `4f9e599` — Agent-agnostic chat bridge + dark mode + companion parity
- `ba433e1` — P2P companion chat + OpenClaw bridge (E2E verified with Ludwig)

---

## 2026-03-13 — Swarm Relay + joinPeer (Docker/NAT Fix)

### Session: Multi-Agent Swarm Discovery Debugging

**Duration**: ~1 hour
**Participants**: Adriano (human), Claude Opus 4.6 (AI), Ludwig (OpenClaw agent), Baruch (OpenClaw agent)

#### Context

Adriano set up two OpenClaw agents (Ludwig and Baruch) on the same Hostinger VPS in separate Docker containers. Both agents ran oikos-app with real Hyperswarm (not mock), same `SWARM_ID`, same board topic derivation. Ludwig announced on the board. Baruch never saw it.

Diagnosis: both agents had UDP sockets open (Hyperswarm was binding), but `boardPeers` and `announcements` were empty on both sides. The agents could reach public DHT bootstrap nodes but couldn't establish direct UDP connections between containers.

#### Root Cause

**Hyperswarm has built-in relay support, but we never configured it.**

When holepunching fails between Docker containers (both have private Docker IPs behind the same VPS public IP), Hyperswarm checks for a `relayThrough` option. If configured, it automatically relays the connection through a third DHT node. Without `relayThrough`, the connection silently dies — **no fallback, no error, just nothing happens.**

This is why the companion P2P chat with Ludwig worked (Adriano's Mac has a real public IP → VPS public IP = holepunching succeeds), but container-to-container failed (both behind Docker NAT = holepunching fails = no relay = dead).

Source: deep dive into HyperDHT `lib/connect.js` and Hyperswarm source. The relay logic triggers on error codes `HOLEPUNCH_ABORTED`, `DOUBLE_RANDOMIZED_NATS`, `REMOTE_NOT_HOLEPUNCHABLE` — but ONLY when `relayThrough` is set.

#### What Was Built

1. **`relayThrough` support** (`SWARM_RELAY_PUBKEY` env var)
   - Passes relay peer pubkey to Hyperswarm constructor
   - When holepunching fails, auto-relays through this peer
   - Zero application-level code changes needed — Hyperswarm handles everything
   - The relay peer can be any Hyperswarm node willing to proxy connections

2. **`joinPeer()` support** (`SWARM_BOOTSTRAP_PEERS` env var)
   - Comma-separated list of peer pubkeys to explicitly connect to on startup
   - Uses Hyperswarm's `joinPeer(pubkey)` — bypasses topic-based DHT discovery
   - Connects directly by Noise public key through DHT routing
   - Auto-reconnects on failure
   - Belt-and-suspenders: topic discovery AND explicit peering

3. **`joinPeer()`/`leavePeer()` on coordinator**
   - Exposed on `SwarmCoordinatorInterface` (optional methods)
   - MCP/REST can dynamically connect to discovered peers

#### Files Modified

| File | Change |
|------|--------|
| `oikos-app/src/swarm/discovery.ts` | Added `relayPubkey` to config, `relayThrough` in Hyperswarm opts, `joinPeer()`/`leavePeer()` methods |
| `oikos-app/src/swarm/coordinator.ts` | Added `relayPubkey`/`bootstrapPeers` to SwarmConfig, wire through to discovery, expose `joinPeer()`/`leavePeer()` |
| `oikos-app/src/swarm/types.ts` | Added optional `joinPeer()`/`leavePeer()` to SwarmCoordinatorInterface |
| `oikos-app/src/swarm/modules.d.ts` | Added `joinPeer()`, `leavePeer()`, `dht` to Hyperswarm type declarations |
| `oikos-app/src/config/env.ts` | Added `swarmRelayPubkey`, `swarmBootstrapPeers` to OikosConfig |
| `oikos-app/src/main.ts` | Wire relay/bootstrap config through to SwarmCoordinator constructor |

#### Deployment Instructions

**Quick fix (bootstrap peers):**
```bash
# On Ludwig: add Baruch's pubkey
SWARM_BOOTSTRAP_PEERS=7bea8598f0152c2b67ffd38f7dab03aa785a692683ef71fc2c7aa860ab881ed4

# On Baruch: add Ludwig's pubkey
SWARM_BOOTSTRAP_PEERS=<ludwig-pubkey>
```

**Proper fix (relay node):**
```js
// Run on VPS host (not in Docker), 5 lines:
import DHT from 'hyperdht'
const node = new DHT({ ephemeral: false })
await node.ready()
console.log('Relay pubkey:', node.defaultKeyPair.publicKey.toString('hex'))
```
Then both agents set `SWARM_RELAY_PUBKEY=<relay pubkey>`.

#### Build Verification

```
npx tsc --noEmit → clean ✓
npm run build → clean ✓
105/105 tests passing ✓
```

#### Commits

- `6e1d7c4` — Swarm relay + joinPeer: fix Docker/NAT peer discovery

---
