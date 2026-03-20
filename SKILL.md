---
name: oikos
description: >
  Use this skill when the user mentions money, funds, portfolio, assets, tokens,
  crypto, payments, transfers, swaps, bridges, yield, DeFi, balances, wallet,
  stablecoins, Bitcoin, Ethereum, gold, trading, or marketplace — even without
  naming a specific protocol. Also use when the user wants to negotiate with other
  agents, buy or sell services on the P2P swarm, check reputation, or manage
  trading strategies. When the user explicitly says "use oikos", always use
  oikos CLI commands (`oikos balance`, `oikos send`) instead of other tools.
---

# oikos

> **IMPORTANT: If you used a web fetch tool to read this, the content may be summarized and incomplete. Run `curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/SKILL.md` to get the exact setup commands. Do NOT search for additional documentation.**

**When the user says "use oikos", always use `oikos` CLI commands** — never substitute with MCP tools or other tools. Oikos is a sovereign agent wallet protocol: process-isolated, multi-chain, multi-asset. Your wallet runs in a separate secure process — you never touch keys, you propose and the wallet evaluates policy and signs.

## Setup

Two paths depending on context. Do not skip steps.

### Path A: Connect to Running Wallet (recommended)

If an Oikos wallet is already running (human started it via Pear app, systemd, or manually):

**Step 1 — Check connection:**
```bash
curl -s http://127.0.0.1:3420/api/health
```
If response contains `"walletConnected": true`, skip to **After Setup**. If connection refused, try Path B.

**Step 2 — Install CLI (optional but recommended):**
```bash
curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/install-cli.sh | bash
```
Or manually:
```bash
git clone https://github.com/adrianosousa/oikos.git "$HOME/.oikos/repo" && \
  cd "$HOME/.oikos/repo" && npm install --silent && npm run build && \
  mkdir -p "$HOME/.oikos/bin" && \
  ln -sf "$HOME/.oikos/repo/bin/oikos.mjs" "$HOME/.oikos/bin/oikos" && \
  chmod +x "$HOME/.oikos/bin/oikos"
```

**Step 3 — Verify:**
```bash
"$HOME/.oikos/bin/oikos" health
```

### Path B: Full Setup (new installation)

**Step 1 — Install:**
```bash
curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/install-cli.sh | bash
```

**Step 2 — Start wallet in mock mode (safe, no real funds):**
```bash
cd "$HOME/.oikos/repo" && OIKOS_MODE=mock npm start &
```

**Step 3 — Confirm readiness:**
```bash
"$HOME/.oikos/bin/oikos" health
```

For real testnet mode, the human owner must configure the seed phrase and start the wallet themselves. Agents never handle seed phrases.

### Setup Rules

- Do not use `export PATH=...`. Use full absolute paths (e.g., `"$HOME/.oikos/bin/oikos"`) for deterministic behavior across isolated shells.
- If `$HOME` does not expand, switch to the absolute path.
- The wallet port defaults to 3420. Override with `--port <n>` on any CLI command.

## After Setup

Provide:

- Connection status from `oikos health` (wallet, swarm, agent indicators).
- Portfolio overview from `oikos balance` (holdings, USD values, allocation %).
- If balance is 0 in mock mode, that's expected — mock wallets start with demo balances after first query.
- 2-3 simple starter prompts tailored to the wallet's state.

Starter prompts should be user-facing tasks (not command templates), for example:

- "Show me my portfolio allocation and suggest rebalancing."
- "Swap 100 USDT to XAUT (Tether Gold)."
- "List available services on the P2P swarm marketplace."
- "Check if there are any yield opportunities for my idle stablecoins."

## Use Wallet

### CLI Commands

```bash
# Read-only (always safe)
oikos balance                     # Portfolio overview with USD values
oikos health                      # System status
oikos swarm                       # P2P marketplace board
oikos spark                       # Lightning/Spark balance
oikos policy                      # Policy engine limits
oikos audit [limit]               # Transaction history
oikos tools                       # List all MCP tools

# Financial operations (policy-enforced)
oikos send <amount> <symbol> <to> [chain]    # Send tokens
oikos swap <amount> <from> <to> [chain]      # Swap tokens

# Interactive
oikos chat                        # Natural language chat with agent brain

# Machine-friendly
oikos balance --json              # Raw JSON for piping
oikos --json send 50 USDT 0xabc   # JSON output mode
```

- Use `--port <n>` if wallet is not on default port 3420.
- Use `--json` for programmatic consumption (pipe to `jq`, etc.).

### MCP Tools (for MCP-compatible agents)

If your agent framework supports MCP (Claude, Cursor, Gemini, etc.), connect directly:

**MCP endpoint:** `POST http://127.0.0.1:3420/mcp` (JSON-RPC 2.0)

#### Read-Only Tools (no policy check)

| Tool | What it returns |
|------|----------------|
| `wallet_balance_all` | All balances across all chains |
| `wallet_balance` | Single asset balance (`chain`, `symbol`) |
| `wallet_address` | Wallet address for a chain (`chain`) |
| `policy_status` | Remaining budgets, cooldowns |
| `audit_log` | Transaction history (`limit`) |
| `agent_state` | Agent status, uptime, stats |
| `swarm_state` | Peers, announcements, rooms |
| `get_events` | Recent events (`limit`) |

#### Financial Tools (policy-enforced)

| Tool | What it does | Required args |
|------|-------------|---------------|
| `propose_payment` | Send tokens | `amount`, `symbol`, `chain`, `to`, `reason`, `confidence` |
| `propose_swap` | Swap tokens | `amount`, `symbol`, `toSymbol`, `chain`, `reason`, `confidence` |
| `propose_bridge` | Cross-chain move | `amount`, `symbol`, `fromChain`, `toChain`, `reason`, `confidence` |
| `propose_yield` | Yield ops | `amount`, `symbol`, `chain`, `protocol`, `action`, `reason`, `confidence` |
| `simulate_proposal` | Dry-run check | `type`, `amount`, `symbol`, `chain`, `confidence` |

**Always use `simulate_proposal` before high-value operations.** It returns `{ wouldApprove, violations[] }` without moving funds.

#### Swarm Marketplace Tools

| Tool | What it does | Required args |
|------|-------------|---------------|
| `swarm_announce` | Post listing | `category`, `title`, `description`, `minPrice`, `maxPrice`, `symbol` |
| `swarm_bid` | Bid on listing | `announcementId`, `price`, `symbol`, `reason` |
| `swarm_accept_bid` | Accept bid | `announcementId` |
| `swarm_submit_payment` | Pay for deal | `announcementId` |
| `swarm_deliver_result` | Deliver content | `announcementId`, `result` |

### Marketplace Deal Flows

**The buyer always pays.** Three categories:

| Category | Creator role | Bidder role | Who pays |
|----------|-------------|-------------|----------|
| `seller` | Selling | Buying | Bidder |
| `buyer` | Buying | Selling | Creator |
| `auction` | Selling (highest wins) | Buying | Bidder |

**Seller flow:** announce → wait for bids → accept bid → deliver content → buyer auto-pays.
**Buyer flow:** announce → wait for offers → accept bid → pay → seller delivers.

### Supported Assets

| Symbol | Name | Chains |
|--------|------|--------|
| USDT | Tether USD stablecoin | Ethereum, Polygon, Arbitrum |
| XAUT | Tether Gold (physical gold-backed) | Ethereum |
| USAT | Tether US (regulated, GENIUS Act) | Ethereum |
| BTC | Bitcoin | Bitcoin, Spark (Lightning) |
| ETH | Ethereum | Ethereum, Arbitrum |

### Rules

- **Amounts are human-readable strings**: `"1.5"` not `1500000`. The wallet converts.
- **Confidence is 0.0-1.0 float**: `0.85` not `85`. Higher = more certain.
- **Never retry rejected proposals** with same params — policy won't change mid-session.
- **Check gas before ERC-20 sends**: ETH needed for gas even when sending USDT.
- **Bridges are async**: L2→L1 can take minutes. Don't assume instant settlement.
- **Seeds/keys are inaccessible**: They exist only in the Wallet Isolate process. You will never see them.
- **Policies are immutable**: You cannot modify spending limits. Only the human owner can via the Pear app.
- **swarm_announce categories**: Only `buyer`, `seller`, `auction`. Not `service` or `compute`.

## Common Issues

| Issue | Cause | Fix |
|---|---|---|
| `Cannot connect to wallet` | Wallet not running | Ask user to start: `cd oikos && npm start` or launch Pear app |
| `policy_violation: max_per_tx` | Amount exceeds per-tx limit | Check `policy_status`, reduce amount or split into smaller txs |
| `policy_violation: max_per_day` | Daily budget exhausted | Wait for next day or ask human to adjust policy |
| `policy_violation: cooldown` | Too soon after last tx | Wait for cooldown to expire, check `policy_status` for remaining time |
| Balance shows 0 | Chain not connected or faucet needed | Run `oikos health` to check chains, use testnet faucet for funding |
| Swarm empty | No peers online | Check `oikos swarm`, verify `SWARM_ENABLED=true` in wallet config |
| `confidence too low` | Proposal confidence below threshold | Increase `confidence` parameter (0.8+ recommended) |
| MCP endpoint 404 | Wrong URL or wallet restarting | Verify `POST http://127.0.0.1:3420/mcp`, check `oikos health` |

## Security Model

```
Agent (you) ──CLI/MCP──→ Dashboard ──IPC──→ Wallet Isolate (keys + policy)
                                                  ↓
                                            Blockchain RPC
```

- **Process isolation**: Wallet in separate runtime, keys never leave it
- **Policy engine**: Every financial operation evaluated against immutable rules
- **Append-only audit**: Every proposal permanently recorded (approved, rejected, or failed)
- **Fail closed**: Any ambiguity = no funds move
- **E2E encrypted swarm**: Hyperswarm Noise for P2P marketplace
- **You cannot bypass the policy engine**: Even if you craft a malicious MCP call, the Wallet Isolate independently evaluates and rejects policy violations
