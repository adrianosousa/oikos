/**
 * Prompt templates for the Oikos Agent.
 *
 * The system prompt defines the agent's role as an autonomous portfolio
 * manager across 5 assets (USDt, XAUt, USAt, BTC, ETH).
 */

import type { BalanceResponse, PolicyStatus } from '../oikos-client.js';

/** Compute portfolio allocation percentages from balances */
function computeAllocations(balances: BalanceResponse[]): Array<{
  symbol: string;
  chain: string;
  formatted: string;
  percentage: string;
}> {
  const pricesUsd: Record<string, number> = {
    USDT: 1, USAT: 1, XAUT: 2400, BTC: 60000, ETH: 3000,
  };
  const decimals: Record<string, number> = {
    USDT: 6, USAT: 6, XAUT: 6, BTC: 8, ETH: 18,
  };

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
    percentage: totalUsd > 0 ? (e.usdValue / totalUsd * 100).toFixed(1) : '0.0',
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
1. **payment** — Send tokens to a recipient address
2. **swap** — Exchange one token for another (e.g., USDT -> XAUT)
3. **bridge** — Move tokens cross-chain (e.g., ethereum -> arbitrum)
4. **yield** — Deposit into or withdraw from yield protocols
5. **hold** — Take no action this cycle

## Decision Rules
Respond with valid JSON. Fields: shouldPay, operationType, reason, confidence, amount, symbol, chain, to, strategy, reasoning, toSymbol, fromChain, toChain, protocol, action.

## Critical Constraints
- You CANNOT modify wallet policies
- You CANNOT access private keys
- Proposals go through a PolicyEngine that enforces spending limits
- A rejected proposal means you are spending too much — back off`;
}

/** Build context prompt from recent events */
export function buildEventPrompt(
  events: Array<{ type: string; data: Record<string, unknown>; timestamp: string }>
): string {
  if (events.length === 0) {
    return 'No new events. Assess your portfolio and decide. Respond with JSON.';
  }

  const summaries = events.map(e => {
    const data = e.data;
    switch (data['type']) {
      case 'incoming_transfer':
        return `[${e.timestamp}] TRANSFER: ${String(data['amount'])} ${String(data['symbol'])} from ${String(data['from'])}`;
      case 'market_signal':
        return `[${e.timestamp}] SIGNAL: ${String(data['signal'])} (${String(data['magnitude'])}x)`;
      case 'threshold_reached':
        return `[${e.timestamp}] THRESHOLD: ${String(data['name'])} reached ${String(data['value'])}`;
      case 'agent_message':
        return `[${e.timestamp}] AGENT: ${String(data['message'])}`;
      case 'network_activity':
        return `[${e.timestamp}] NETWORK: ${String(data['chain'])} — ${String(data['txCount'])} txs`;
      default:
        return `[${e.timestamp}] Event: ${JSON.stringify(data).slice(0, 100)}`;
    }
  });

  return `Latest events:\n\n${summaries.join('\n')}\n\nDecide on an operation. Respond with JSON.`;
}
