/**
 * Prompt templates for the Agent Brain.
 *
 * The system prompt defines the agent's role as an autonomous portfolio
 * manager across 5 assets (USDt, XAUt, USAt, BTC, ETH).
 * The user prompt provides current context for decision-making.
 */

import type { BalanceResponse, PolicyStatus } from 'oikos-wallet-gateway';

/** Compute portfolio allocation percentages from balances */
function computeAllocations(balances: BalanceResponse[]): Array<{
  symbol: string;
  chain: string;
  formatted: string;
  percentage: string;
}> {
  // Hardcoded USD prices for portfolio valuation (demo/testnet)
  const pricesUsd: Record<string, number> = {
    USDT: 1,
    USAT: 1,
    XAUT: 2400,
    BTC: 60000,
    ETH: 3000,
  };

  const decimals: Record<string, number> = {
    USDT: 6,
    USAT: 6,
    XAUT: 6,
    BTC: 8,
    ETH: 18,
  };

  // Calculate USD values
  const entries = balances.map(b => {
    const rawBalance = BigInt(b.balance || '0');
    const dec = decimals[b.symbol] ?? 18;
    const humanBalance = Number(rawBalance) / Math.pow(10, dec);
    const usdValue = humanBalance * (pricesUsd[b.symbol] ?? 0);
    return { ...b, usdValue };
  });

  const totalUsd = entries.reduce((sum, e) => sum + e.usdValue, 0);

  return entries.map(e => ({
    symbol: e.symbol,
    chain: e.chain,
    formatted: e.formatted,
    percentage: totalUsd > 0
      ? (e.usdValue / totalUsd * 100).toFixed(1)
      : '0.0',
  }));
}

/** Build the agent's system prompt */
export function buildSystemPrompt(
  balances: BalanceResponse[],
  policies: PolicyStatus[],
  creatorAddress: string,
): string {
  const allocations = computeAllocations(balances);
  const balanceInfo = allocations.map(a =>
    `  ${a.chain}/${a.symbol}: ${a.formatted} (${a.percentage}% of portfolio)`
  ).join('\n');

  const policyInfo = policies.map(p => {
    const session = Object.entries(p.state.sessionTotals)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    return `  ${p.name} — session spent: ${session || 'none'}`;
  }).join('\n');

  return `You are Oikos, an autonomous AI portfolio manager operating a multi-asset, multi-chain self-custodial wallet.
Your job is to analyze market signals, portfolio state, and events, then decide on optimal portfolio operations.

## Your Portfolio
${balanceInfo || '  No balances available'}

## Supported Assets
- USDt (USDT) — Tether USD stablecoin (stable base)
- XAUt (XAUT) — Tether Gold, gold-backed token (gold hedge)
- USAt (USAT) — Tether US regulated stablecoin (regulated stablecoin)
- BTC — Bitcoin (digital gold)
- ETH — Ethereum (gas reserve, DeFi utility)

## Active Policies
${policyInfo || '  No active policies'}

## Target Address
Default recipient: ${creatorAddress}
Default chain: ethereum

## Available Operations
You can perform five types of operations:

1. **payment** — Send tokens to a recipient address
2. **swap** — Exchange one token for another (e.g., USDT -> XAUT)
3. **bridge** — Move tokens cross-chain (e.g., ethereum -> arbitrum)
4. **yield** — Deposit into or withdraw from yield protocols (e.g., aave)
5. **hold** — Take no action this cycle

## Decision Rules
1. You MUST respond with valid JSON containing these fields:
   - "shouldPay": boolean — whether to execute an operation (false = hold)
   - "operationType": "payment" | "swap" | "bridge" | "yield" | "hold"
   - "reason": string — why you made this decision (be specific)
   - "confidence": number (0.0 to 1.0) — how confident you are
   - "amount": string — amount in smallest unit (e.g., "2000000" = 2 USDT)
   - "symbol": "USDT" | "XAUT" | "USAT" | "BTC" | "ETH"
   - "chain": "ethereum" | "polygon" | "bitcoin" | "arbitrum"
   - "to": string — recipient address (for payments)
   - "strategy": string — decision strategy label
   - "reasoning": string — your full reasoning process
   - "toSymbol": string — target token symbol (for swaps, e.g., "XAUT")
   - "fromChain": string — source chain (for bridges)
   - "toChain": string — destination chain (for bridges)
   - "protocol": string — DeFi protocol name (for yield, e.g., "aave")
   - "action": "deposit" | "withdraw" — yield action type

2. Operation triggers:
   - Portfolio imbalance detected (deviation > 10% from target allocation)
   - Favorable market conditions for rebalancing
   - Gas optimization opportunities (bridge to lower-cost chains)
   - Yield opportunities exceeding threshold APY
   - Milestone payments or strategic disbursements
   - Revenue events or incoming payments

3. DO NOT operate when:
   - Portfolio is well-balanced and no signals warrant action
   - Wallet balance is too low for meaningful operations
   - Recent operations suggest cooldown is needed
   - Confidence is below 0.5

4. Amount guidelines:
   - Small operations: 1-5 USDT equivalent (routine rebalancing)
   - Medium operations: 5-20 USDT equivalent (strategic swaps/yield)
   - Large operations: 20+ USDT equivalent (major rebalancing, only when confident)

5. Target portfolio allocation:
   - USDT: 40% (stable base)
   - XAUT: 20% (gold hedge)
   - USAT: 25% (regulated stablecoin)
   - BTC: 10% (digital gold)
   - ETH: 5% (gas reserve)

## Critical Constraints
- You CANNOT modify wallet policies
- You CANNOT access private keys
- Your proposals go through a PolicyEngine that enforces spending limits
- A rejected proposal means you are spending too much — back off
- All DeFi operations (swaps, bridges, yield) are policy-enforced`;
}

/** Build context prompt from recent events */
export function buildEventPrompt(
  events: Array<{ type: string; data: Record<string, unknown>; timestamp: string }>
): string {
  if (events.length === 0) {
    return 'No new events in this cycle. Assess your portfolio and decide on an operation. Respond with JSON.';
  }

  const eventSummaries = events.map(e => {
    const data = e.data;
    switch (data['type']) {
      case 'viewer_count':
        return `[${e.timestamp}] Viewers: ${String(data['count'])} (${Number(data['delta']) > 0 ? '+' : ''}${String(data['delta'])})`;
      case 'chat_message':
        return `[${e.timestamp}] Chat (${String(data['sentiment'] ?? 'unknown')}): ${String(data['username'])}: "${String(data['message'])}"`;
      case 'donation':
        return `[${e.timestamp}] DONATION: ${String(data['username'])} donated $${String(data['amount'])} — "${String(data['message'] ?? '')}"`;
      case 'milestone':
        return `[${e.timestamp}] MILESTONE: ${String(data['name'])} reached (${String(data['value'])}/${String(data['threshold'])})`;
      case 'engagement_spike':
        return `[${e.timestamp}] ENGAGEMENT SPIKE: Chat rate ${String(data['chatRate'])}/min (${String(data['multiplier'])}x increase)`;
      case 'stream_status':
        return `[${e.timestamp}] Stream status: ${String(data['status'])}`;
      case 'price_update':
        return `[${e.timestamp}] PRICE: ${String(data['symbol'])} = $${String(data['price'])}`;
      case 'yield_rate':
        return `[${e.timestamp}] YIELD: ${String(data['protocol'])} ${String(data['symbol'])} APY: ${String(data['apy'])}%`;
      default:
        return `[${e.timestamp}] Event: ${JSON.stringify(data).slice(0, 100)}`;
    }
  });

  return `Here are the latest events and signals:\n\n${eventSummaries.join('\n')}\n\nBased on these events and your portfolio state, decide on an operation. Respond with JSON.`;
}
