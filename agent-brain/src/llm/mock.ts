/**
 * Mock LLM — Deterministic responses for testing and demo.
 *
 * Produces predictable operation decisions across an 8-step cycle
 * covering all operation types: payment, swap, bridge, yield, hold.
 * No actual LLM needed.
 */

import type { LLMResult, LLMPaymentDecision } from './client.js';

/** Extended decision type for mock DeFi operations */
interface MockDecision extends LLMPaymentDecision {
  operationType: string;
  toSymbol?: string;
  fromChain?: string;
  toChain?: string;
  protocol?: string;
  action?: string;
}

/** Pre-scripted 8-decision cycle mixing all operation types */
const DEMO_DECISIONS: Array<MockDecision | null> = [
  // 1. Payment: 2 USDT to creator (milestone)
  {
    shouldPay: true,
    reason: 'Milestone payment: First portfolio cycle complete. Disbursing 2 USDT to creator.',
    confidence: 0.92,
    amount: '2000000', // 2 USDT
    symbol: 'USDT',
    chain: 'ethereum',
    to: '0xCREATOR1000000000000000000000000000000001',
    strategy: 'milestone',
    operationType: 'payment',
  },
  // 2. Swap: 10 USDT -> XAUT (portfolio diversification)
  {
    shouldPay: true,
    reason: 'Portfolio diversification: XAUt allocation below target (20%). Swapping 10 USDT to XAUT for gold exposure.',
    confidence: 0.88,
    amount: '10000000', // 10 USDT
    symbol: 'USDT',
    chain: 'ethereum',
    to: '',
    strategy: 'rebalance',
    operationType: 'swap',
    toSymbol: 'XAUT',
  },
  // 3. Hold: activity low
  null,
  // 4. Yield: deposit 20 USDT into aave (earn yield)
  {
    shouldPay: true,
    reason: 'Yield optimization: Depositing 20 USDT into Aave lending pool. Current APY favorable for idle stablecoins.',
    confidence: 0.85,
    amount: '20000000', // 20 USDT
    symbol: 'USDT',
    chain: 'ethereum',
    to: '',
    strategy: 'yield_optimization',
    operationType: 'yield',
    protocol: 'aave',
    action: 'deposit',
  },
  // 5. Bridge: 5 USDT Ethereum -> Arbitrum (gas optimization)
  {
    shouldPay: true,
    reason: 'Gas optimization: Bridging 5 USDT from Ethereum to Arbitrum for lower transaction costs.',
    confidence: 0.80,
    amount: '5000000', // 5 USDT
    symbol: 'USDT',
    chain: 'ethereum',
    to: '',
    strategy: 'gas_optimization',
    operationType: 'bridge',
    fromChain: 'ethereum',
    toChain: 'arbitrum',
  },
  // 6. Swap: 5 USDT -> USAT (stablecoin diversification)
  {
    shouldPay: true,
    reason: 'Stablecoin diversification: USAt allocation below target (25%). Swapping 5 USDT to USAT for regulated stablecoin exposure.',
    confidence: 0.82,
    amount: '5000000', // 5 USDT
    symbol: 'USDT',
    chain: 'ethereum',
    to: '',
    strategy: 'rebalance',
    operationType: 'swap',
    toSymbol: 'USAT',
  },
  // 7. Payment: 3 USDT to creator (large donation)
  {
    shouldPay: true,
    reason: 'Strategic disbursement: Community engagement high. Sending 3 USDT to creator as performance reward.',
    confidence: 0.90,
    amount: '3000000', // 3 USDT
    symbol: 'USDT',
    chain: 'ethereum',
    to: '0xCREATOR1000000000000000000000000000000001',
    strategy: 'sentiment',
    operationType: 'payment',
  },
  // 8. Yield: withdraw 10 USDT from aave (rebalance)
  {
    shouldPay: true,
    reason: 'Portfolio rebalance: Withdrawing 10 USDT from Aave to increase liquid USDT reserves for upcoming operations.',
    confidence: 0.78,
    amount: '10000000', // 10 USDT
    symbol: 'USDT',
    chain: 'ethereum',
    to: '',
    strategy: 'rebalance',
    operationType: 'yield',
    protocol: 'aave',
    action: 'withdraw',
  },
];

const DEMO_REASONING = [
  'Analyzing portfolio state... First cycle complete. Creator address configured. Disbursing milestone payment of 2 USDT. Portfolio is 100% USDT — diversification needed in upcoming cycles.',
  'Portfolio analysis... XAUt allocation is 0% vs target 20%. Gold provides hedge against stablecoin depegging risk. Swapping 10 USDT to XAUT via DEX. Expected slippage minimal on testnet.',
  'Market signals quiet... No significant events. Portfolio recently rebalanced. All allocations within acceptable deviation. Holding position. Will re-evaluate next cycle.',
  'Yield opportunity detected... Aave lending pool offering favorable APY on USDT. Depositing 20 USDT to generate passive yield. Remaining liquid balance sufficient for operational needs.',
  'Gas cost analysis... Ethereum L1 gas prices elevated. Bridging 5 USDT to Arbitrum for lower transaction costs on future operations. Bridge time ~15 minutes via canonical bridge.',
  'Stablecoin analysis... USAt (regulated, Treasury-backed) allocation at 0% vs target 25%. Diversifying stablecoin holdings for regulatory compliance edge. Swapping 5 USDT to USAT.',
  'Community engagement spike... Positive signals detected. Creator performance metrics strong. Allocating 3 USDT as performance-based disbursement. Remaining budget within policy limits.',
  'Portfolio rebalance... Liquid USDT reserves below optimal threshold after yield deposits. Withdrawing 10 USDT from Aave to maintain operational liquidity for upcoming payment and swap cycles.',
];

export class MockLLM {
  private decisionIndex = 0;

  /**
   * Produce a mock reasoning result.
   * Cycles through 8 pre-scripted decisions covering all operation types.
   */
  async reason(_systemPrompt: string, _userPrompt: string): Promise<LLMResult> {
    const idx = this.decisionIndex % DEMO_DECISIONS.length;
    const decision = DEMO_DECISIONS[idx] ?? null;
    const reasoning = DEMO_REASONING[idx] ?? 'No reasoning available';

    this.decisionIndex++;

    // Simulate LLM latency
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));

    return {
      decision: decision as LLMPaymentDecision | null,
      reasoning,
      model: 'mock-qwen3-8b',
      tokensUsed: 150 + Math.floor(Math.random() * 100),
    };
  }

  /** Reset to the beginning of the demo sequence */
  reset(): void {
    this.decisionIndex = 0;
  }
}
