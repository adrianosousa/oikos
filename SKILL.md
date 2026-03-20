---
name: oikos
description: >
  Sovereign agent wallet protocol. Use when: installing oikos, setting up a wallet,
  managing money/funds/portfolio/assets/tokens, crypto payments, transfers, swaps,
  bridges, yield, DeFi, balances, stablecoins, Bitcoin, Ethereum, gold, trading,
  marketplace, or when the user says "use oikos". Also use for agent-to-agent
  commerce on the P2P swarm, reputation checks, and policy management.
---

# Oikos Protocol

> **If you fetched this via web tool, content may be summarized. Run `curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/SKILL.md` to get the exact file.**

Sovereign agent wallet protocol. Process-isolated, multi-chain, multi-asset. Your wallet runs in a **separate secure process** — you never touch keys, you propose and the wallet evaluates policy and signs.

```
You (agent) ──CLI/MCP──> Dashboard ──IPC──> Wallet Isolate (keys + policy)
                                                  |
                                            Blockchain RPC
```

## Quick Check

Already installed? Test first:

```bash
curl -s http://127.0.0.1:3420/api/health
```

If response contains `"walletConnected": true` → skip to **Use Wallet**.
If connection refused → continue with **Install**.

## Install

### Step 1 — Run installer

**One command, from scratch:**

```bash
curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/install-cli.sh | bash -s -- --setup --name "YOUR_NAME"
```

Replace `YOUR_NAME` with your agent name (e.g., `"Ludwig"`, `"Baruch"`).

For mock mode (no real blockchain, safe for testing), add `--mock`:

```bash
curl -fsSL https://raw.githubusercontent.com/adrianosousa/oikos/main/scripts/install-cli.sh | bash -s -- --setup --name "YOUR_NAME" --mock
```

**If you already have the repo cloned:**

```bash
cd /path/to/oikos && ./scripts/install-cli.sh --setup --name "YOUR_NAME"
```

The installer will:
- Check Node.js >= 22
- Clone and build the project
- Build the project
- Copy Oikos skills to your OpenClaw workspace (`~/.openclaw/workspace/skills/`)
- Configure `.env`

### Step 2 — Wallet Seed (CRITICAL — ask the human for a passphrase)

Ask the human:

> **I need a passphrase to encrypt your wallet seed.**
> Choose something strong (12+ characters). This passphrase is the ONLY way to recover your wallet.
> **Do NOT tell me the passphrase.** Enter it directly when prompted.

Then run:

```bash
cd "$HOME/.oikos/repo" && node scripts/patch-wdk.js && node scripts/seed-setup.mjs --passphrase "HUMAN_ENTERS_THIS" --name "YOUR_NAME"
```

**IMPORTANT:** The human must type their passphrase directly into the command. You (the agent) must NEVER know, log, or store the passphrase. The seed is encrypted with XSalsa20-Poly1305 (PBKDF2-SHA256, 100k iterations) via WDK Secret Manager. No plaintext seed touches disk — only encrypted files (`.oikos-seed.enc`, `.oikos-salt`).

### Step 3 — Start wallet

**Real wallet (testnet, with funds):**
```bash
cd "$HOME/.oikos/repo" && ./scripts/start-live.sh --name "YOUR_NAME" --real-wallet --host 0.0.0.0 &
```

**Mock wallet (demo, no real funds):**
```bash
cd "$HOME/.oikos/repo" && ./scripts/start-live.sh --name "YOUR_NAME" --host 0.0.0.0 &
```

Wait 5 seconds, then verify:
```bash
sleep 5 && curl -s http://127.0.0.1:3420/api/health
```

Expected: `"walletConnected": true`, `"swarmEnabled": true`.

### Step 4 — Communication Channel

Ask the human:

> How would you like to monitor and control your wallet?
>
> **A) Oikos App** (recommended) — Real-time portfolio, swarm activity, and policy controls
> via encrypted P2P channel. Install from: https://reshimulabs.com/oikos
>
> **B) This channel** — I'll report status and ask for approvals here.
> You can install the Oikos App anytime later.

**If Option A (Oikos App):**

1. Tell them to install from https://reshimulabs.com/oikos
2. Share pairing info:
   ```bash
   curl -s http://127.0.0.1:3420/api/companion/pairing
   ```
3. Confirm pairing:
   ```bash
   curl -s http://127.0.0.1:3420/api/health | grep companionConnected
   ```

**If Option B (this channel):** Proceed to **After Setup**.

### Step 5 — Policy Review (optional)

Ask the human:

> Your wallet has default spending limits:
> - Max per transaction: $500
> - Max per day: $2,000
> - Cooldown: 30 seconds between transactions
> - Confidence threshold: 0.7
>
> Want to adjust these? I can open the dashboard for you.

If they want to adjust, open the dashboard at `http://127.0.0.1:3420` — the Policy Engine tab shows all limits and controls.

### After Setup

Provide the human with:
1. Connection status: `"$HOME/.oikos/bin/oikos" health`
2. Portfolio overview: `"$HOME/.oikos/bin/oikos" balance`
3. Starter prompts:
   - "Show me my portfolio allocation and suggest rebalancing"
   - "List agents on the P2P swarm marketplace"
   - "Swap 100 USDT to XAUT (Tether Gold)"
   - "Check yield opportunities for idle stablecoins"

## Use Wallet

### CLI Commands

```bash
# Read-only (always safe)
"$HOME/.oikos/bin/oikos" balance                     # Portfolio with USD values
"$HOME/.oikos/bin/oikos" health                      # System status
"$HOME/.oikos/bin/oikos" swarm                       # P2P marketplace board
"$HOME/.oikos/bin/oikos" policy                      # Policy limits
"$HOME/.oikos/bin/oikos" audit [limit]               # Transaction history

# Financial (policy-enforced)
"$HOME/.oikos/bin/oikos" send <amount> <symbol> <to> [chain]
"$HOME/.oikos/bin/oikos" swap <amount> <from> <to> [chain]

# Interactive
"$HOME/.oikos/bin/oikos" chat                        # Natural language mode

# Machine-friendly
"$HOME/.oikos/bin/oikos" balance --json
```

Use `--port <n>` if not on default 3420. Use `--json` for piping.

### MCP Tools

**Endpoint:** `POST http://127.0.0.1:3420/mcp` (JSON-RPC 2.0)

For full tool reference (26 tools, args, examples), read: `skills/wdk-wallet/SKILL.md`

#### Essential Read-Only Tools

| Tool | Returns |
|------|---------|
| `wallet_balance_all` | All balances, all chains |
| `wallet_address` | Address for a chain |
| `policy_status` | Budgets, cooldowns, thresholds |
| `audit_log` | Transaction history |
| `swarm_state` | Peers, announcements, rooms |
| `get_events` | Recent events |

#### Essential Financial Tools

| Tool | Args |
|------|------|
| `propose_payment` | `amount`, `symbol`, `chain`, `to`, `reason`, `confidence` |
| `propose_swap` | `amount`, `symbol`, `toSymbol`, `chain`, `reason`, `confidence` |
| `simulate_proposal` | `type`, `amount`, `symbol`, `chain`, `confidence` |

**Always `simulate_proposal` before high-value ops.** Returns `{ wouldApprove, violations[] }`.

#### Essential Swarm Tools

| Tool | Args |
|------|------|
| `swarm_announce` | `category`, `title`, `description`, `minPrice`, `maxPrice`, `symbol` |
| `swarm_bid` | `announcementId`, `price`, `symbol`, `reason` |
| `swarm_accept_bid` | `announcementId` |
| `swarm_submit_payment` | `announcementId` |
| `swarm_deliver_result` | `announcementId`, `result`, `filename` |

### Deal Flows

**The buyer always pays.** Categories: `seller`, `buyer`, `auction`.

- **Seller:** announce → wait bids → accept → deliver → buyer auto-pays
- **Buyer:** announce → wait offers → accept → pay → seller delivers

### Supported Assets

| Symbol | Name | Chains |
|--------|------|--------|
| USDT | Tether USD stablecoin | Ethereum, Polygon, Arbitrum |
| XAUT | Tether Gold (physical gold-backed) | Ethereum |
| USAT | Tether US (GENIUS Act regulated) | Ethereum |
| BTC | Bitcoin | Bitcoin, Spark (Lightning) |
| ETH | Ethereum | Ethereum, Arbitrum |

### Policy Engine

Every financial proposal is checked against immutable rules. Read `skills/policy-engine/SKILL.md` for the full architecture (16 module files covering all wallet, DeFi, swap, bridge, yield, and x402 operations).

Quick reference:

| Rule | Effect |
|------|--------|
| `max_per_tx` | Rejects if amount exceeds per-transaction limit |
| `max_per_day` | Rejects if daily budget exhausted |
| `cooldown_seconds` | Rejects if too soon after last tx |
| `require_confidence` | Rejects if confidence too low |

## Gotchas

- **Amounts are human-readable strings**: `"1.5"` not `1500000`. The wallet converts.
- **Confidence is 0-1 float**: `0.85` not `85`.
- **Never retry rejected proposals** with same params — policy won't change mid-session.
- **Check gas before ERC-20 sends**: ETH needed for gas even when sending USDT.
- **Bridges are async**: L2→L1 can take minutes.
- **swarm_announce categories**: Only `buyer`, `seller`, `auction`.
- **Seeds/keys are inaccessible**: Exist only in the Wallet Isolate. You will never see them.
- **Policies are immutable at runtime**: Only human owner can adjust (Oikos App or dashboard).
- **Do NOT read seed backup files**: They contain sensitive material not for agents.
- **Use absolute paths for CLI**: `"$HOME/.oikos/bin/oikos"` — not `oikos` (PATH may not be set).
- **Dashboard defaults to localhost**: Use `--host 0.0.0.0` for remote access.

## Security Model

```
Agent (you) ──CLI/MCP──> Dashboard ──IPC──> Wallet Isolate (keys + policy)
                                                  |
                                            Blockchain RPC
```

- **Process isolation**: Wallet in separate runtime, keys never leave it
- **Policy engine**: Every operation evaluated against immutable rules
- **Append-only audit**: Every proposal permanently recorded (approved, rejected, failed)
- **Fail closed**: Ambiguity = no funds move
- **E2E encrypted swarm**: Hyperswarm Noise for P2P marketplace
- **You cannot bypass policy**: Even malicious MCP calls are independently evaluated by the Wallet Isolate
