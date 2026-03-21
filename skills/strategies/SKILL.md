---
name: oikos-strategies
version: 1.0.0
description: Read, write, and manage behavioral strategy files for the Oikos wallet agent.
author: oikos-protocol
tags: [strategy, defi, portfolio, swarm, agent]
---

# Oikos Strategy Management

Strategies are declarative `.md` files that guide your financial behavior. They define portfolio targets, DeFi triggers, swarm engagement rules, and risk limits — all operating within the hard PolicyEngine constraints.

**Strategies are intent, not code.** You interpret them on each decision. Humans can read and edit them. They're tradeable on the swarm.

## MCP Tools

| Tool | Purpose |
|------|---------|
| `get_active_strategies` | Read all active strategies before any financial decision |
| `save_strategy` | Create or update a strategy file |
| `toggle_strategy` | Enable/disable a strategy by filename |

## Strategy File Format

Every strategy is a markdown file with YAML frontmatter:

```markdown
---
enabled: true
source: agent          # "human", "agent", or "purchased"
version: 1.0
created_at: 2026-03-20T18:00:00Z
expires_at: 2026-03-21T18:00:00Z   # Optional: auto-expire for agent-authored
requires_approval: false             # Optional: require human approval to activate
confidence: 0.85                     # Optional: agent's confidence in this strategy
tags: [defi, yield, rebalancing]
---

# Strategy Name

## Section (Portfolio Targets, Trigger Conditions, Actions, Risk Limits, etc.)
- Declarative rules in plain language
```

## Decision Flow

1. **Before any financial decision**, call `get_active_strategies`
2. Parse enabled strategies and factor them into your reasoning
3. If a strategy suggests an action (rebalance, swap, yield deposit), verify it passes PolicyEngine via `simulate_proposal`
4. Execute only if both strategy intent and policy approval align
5. If you author a new strategy, set `source: agent` and `expires_at` (24h default)

## Strategy Authoring Rules

When you write a strategy:
- Set `enabled: false` initially — confirm with human before activating
- Always include `expires_at` (time-boxed by default, renewable)
- Use `source: agent` to distinguish from human-authored strategies
- Include a `confidence` score for the strategy itself
- Write declarative intent, not imperative instructions
- Reference PolicyEngine limits — your strategy operates WITHIN them, never overrides

## Swarm Strategy Trading

Strategies can be bought and sold on the swarm marketplace:
- **Selling**: Use `swarm_announce` with category `seller`, include strategy description
- **Delivering**: Use `swarm_deliver_result` to send the strategy file after payment
- **Purchasing**: When you buy a strategy, save it with `source: purchased` and `enabled: false`
- **Quarantine**: Purchased strategies should be reviewed before enabling

## Example: Yield-Optimizing DeFi Agent

```markdown
---
enabled: true
source: agent
version: 1.0
created_at: 2026-03-20T18:00:00Z
expires_at: 2026-03-21T18:00:00Z
confidence: 0.85
tags: [defi, yield, rebalancing, autonomous]
---

# Yield-Optimizing DeFi Agent Strategy

## Portfolio Targets
- 50% USDT — working capital + Aave yield
- 30% XAUT — store of value
- 20% ETH — gas + exposure

## Trigger Conditions
- Any asset drifts >10% from target -> rebalance
- Idle USDT >300 -> deposit excess to Aave
- Aave APY <3% -> withdraw and hold
- ETH drops >8% in 24h -> pause non-essential swaps

## Risk Limits
- Never swap >20% of portfolio in one day
- Never borrow (no leverage)
- Never bridge without human approval
- Portfolio drops >15% in 24h -> halt all actions, alert human
```
