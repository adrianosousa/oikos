/**
 * DeFi Strategy Reasoner — Portfolio analysis and rebalancing suggestions.
 *
 * Analyzes multi-asset portfolio state against target allocations
 * and suggests DeFi operations (swaps, bridges, yield) to optimize.
 *
 * Uses hardcoded demo prices for portfolio valuation.
 * In production, prices would come from oracle feeds or x402 price services.
 */

import type { BalanceResponse } from 'oikos-wallet-gateway';

export interface PortfolioAnalysis {
  totalValueUsd: number;
  allocations: Record<string, { balance: number; percentage: number; targetPercentage: number }>;
  deviations: Record<string, number>; // actual - target
  rebalanceNeeded: boolean;
}

export interface DeFiSuggestion {
  type: 'swap' | 'bridge' | 'yield';
  reason: string;
  priority: number; // 0-1
  details: Record<string, string>;
}

/** Target allocation (for portfolio reasoning) */
const TARGET_ALLOCATION: Record<string, number> = {
  USDT: 0.40,  // 40% in USDt (stable base)
  XAUT: 0.20,  // 20% in XAUt (gold hedge)
  USAT: 0.25,  // 25% in USAt (regulated stablecoin)
  BTC: 0.10,   // 10% in BTC
  ETH: 0.05,   // 5% in ETH (gas reserve)
};

/** Hardcoded USD prices for portfolio valuation (demo) */
const PRICES_USD: Record<string, number> = {
  USDT: 1,
  USAT: 1,
  XAUT: 2400,
  BTC: 60000,
  ETH: 3000,
};

/** Decimals per token */
const DECIMALS: Record<string, number> = {
  USDT: 6,
  USAT: 6,
  XAUT: 6,
  BTC: 8,
  ETH: 18,
};

/** Deviation threshold (10%) beyond which rebalancing is suggested */
const REBALANCE_THRESHOLD = 0.10;

/** Minimum ETH reserve percentage before suggesting a swap to ETH */
const MIN_ETH_RESERVE = 0.02;

/**
 * Analyze portfolio state against target allocations.
 *
 * Converts raw balance strings to USD values using demo prices,
 * calculates allocation percentages, and flags rebalancing need.
 */
export function analyzePortfolio(balances: BalanceResponse[]): PortfolioAnalysis {
  // Aggregate balances by symbol (in case of multi-chain balances)
  const aggregatedUsd: Record<string, number> = {};
  const aggregatedBalance: Record<string, number> = {};

  for (const b of balances) {
    const rawBalance = BigInt(b.balance || '0');
    const dec = DECIMALS[b.symbol] ?? 18;
    const humanBalance = Number(rawBalance) / Math.pow(10, dec);
    const usdValue = humanBalance * (PRICES_USD[b.symbol] ?? 0);

    aggregatedUsd[b.symbol] = (aggregatedUsd[b.symbol] ?? 0) + usdValue;
    aggregatedBalance[b.symbol] = (aggregatedBalance[b.symbol] ?? 0) + humanBalance;
  }

  const totalValueUsd = Object.values(aggregatedUsd).reduce((sum, v) => sum + v, 0);

  // Compute allocations and deviations for all target assets
  const allocations: Record<string, { balance: number; percentage: number; targetPercentage: number }> = {};
  const deviations: Record<string, number> = {};
  let rebalanceNeeded = false;

  for (const [symbol, target] of Object.entries(TARGET_ALLOCATION)) {
    const balance = aggregatedBalance[symbol] ?? 0;
    const usdValue = aggregatedUsd[symbol] ?? 0;
    const percentage = totalValueUsd > 0 ? usdValue / totalValueUsd : 0;
    const deviation = percentage - target;

    allocations[symbol] = {
      balance,
      percentage,
      targetPercentage: target,
    };
    deviations[symbol] = deviation;

    if (Math.abs(deviation) > REBALANCE_THRESHOLD) {
      rebalanceNeeded = true;
    }
  }

  return {
    totalValueUsd,
    allocations,
    deviations,
    rebalanceNeeded,
  };
}

/**
 * Suggest DeFi operations to rebalance the portfolio.
 *
 * Analyzes deviations from target and produces actionable suggestions:
 * - Overweight assets: suggest swapping to underweight assets
 * - Low ETH reserve: suggest swapping to ETH for gas
 *
 * Returns suggestions sorted by priority (highest first).
 */
export function suggestRebalance(analysis: PortfolioAnalysis): DeFiSuggestion[] {
  const suggestions: DeFiSuggestion[] = [];

  if (analysis.totalValueUsd === 0) {
    return suggestions;
  }

  // Find overweight and underweight assets
  const overweight: Array<{ symbol: string; deviation: number }> = [];
  const underweight: Array<{ symbol: string; deviation: number }> = [];

  for (const [symbol, deviation] of Object.entries(analysis.deviations)) {
    if (deviation > REBALANCE_THRESHOLD) {
      overweight.push({ symbol, deviation });
    } else if (deviation < -REBALANCE_THRESHOLD) {
      underweight.push({ symbol, deviation });
    }
  }

  // Sort by absolute deviation (largest first)
  overweight.sort((a, b) => b.deviation - a.deviation);
  underweight.sort((a, b) => a.deviation - b.deviation);

  // Priority 1: ETH reserve too low
  const ethAllocation = analysis.allocations['ETH'];
  if (ethAllocation && ethAllocation.percentage < MIN_ETH_RESERVE) {
    const ethTarget = TARGET_ALLOCATION['ETH'] ?? 0.05;
    const ethDeficit = ethTarget - ethAllocation.percentage;
    const swapAmountUsd = ethDeficit * analysis.totalValueUsd;

    // Find the most overweight asset to swap from
    const fromSymbol = overweight.length > 0
      ? overweight[0]?.symbol ?? 'USDT'
      : 'USDT';

    suggestions.push({
      type: 'swap',
      reason: `ETH reserve critically low (${(ethAllocation.percentage * 100).toFixed(1)}%). Need ETH for gas fees. Swap from ${fromSymbol}.`,
      priority: 0.95,
      details: {
        fromSymbol,
        toSymbol: 'ETH',
        estimatedAmountUsd: swapAmountUsd.toFixed(2),
      },
    });
  }

  // Priority 2: Pair overweight with underweight for swaps
  for (const over of overweight) {
    for (const under of underweight) {
      // Skip ETH if we already handled it above
      if (under.symbol === 'ETH' && ethAllocation && ethAllocation.percentage < MIN_ETH_RESERVE) {
        continue;
      }

      const swapDeviation = Math.min(over.deviation, Math.abs(under.deviation));
      const swapAmountUsd = swapDeviation * analysis.totalValueUsd;
      const priority = Math.min(0.9, 0.5 + swapDeviation);

      suggestions.push({
        type: 'swap',
        reason: `${over.symbol} overweight by ${(over.deviation * 100).toFixed(1)}%, ${under.symbol} underweight by ${(Math.abs(under.deviation) * 100).toFixed(1)}%. Rebalance via swap.`,
        priority,
        details: {
          fromSymbol: over.symbol,
          toSymbol: under.symbol,
          estimatedAmountUsd: swapAmountUsd.toFixed(2),
        },
      });
    }
  }

  // Sort by priority (highest first)
  suggestions.sort((a, b) => b.priority - a.priority);

  return suggestions;
}
