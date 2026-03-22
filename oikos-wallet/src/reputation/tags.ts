/**
 * ERC-8004 Feedback Tag Taxonomy for Oikos Protocol.
 *
 * Tags are the cross-chain glue: every on-chain feedback entry on Sepolia
 * carries tag1 (category) and tag2 (sub-category) that encode what chain
 * and operation type the feedback relates to — Bitcoin, Lightning/Spark,
 * EVM, DeFi, swarm settlements, x402 payments, and more.
 *
 * This lets agents query ERC-8004 reputation filtered by operation type:
 *   getSummary(agentId, [], "payment", "btc-transfer")
 *   → "What's this agent's Bitcoin payment reputation?" — answered from Sepolia.
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */

// ── Tag Constants ──

/**
 * tag1 categories — broad operation types.
 * ERC-8004 stores tag1 on-chain, so keep them short and stable.
 */
export const TAG1 = {
  PAYMENT: 'payment',
  TRADE: 'trade',
  SERVICE: 'service',
  SETTLEMENT: 'settlement',
  UPTIME: 'uptime',
} as const;

export type Tag1 = typeof TAG1[keyof typeof TAG1];

/**
 * tag2 sub-categories — chain-specific or operation-specific detail.
 * Grouped by tag1 for clarity, but any combination is technically valid.
 */
export const TAG2 = {
  // payment sub-types
  EVM_TRANSFER: 'evm-transfer',
  BTC_TRANSFER: 'btc-transfer',
  SPARK_TRANSFER: 'spark-transfer',
  X402: 'x402',

  // trade sub-types
  SWAP: 'swap',
  BRIDGE: 'bridge',
  YIELD_DEPOSIT: 'yield-deposit',
  YIELD_WITHDRAW: 'yield-withdraw',

  // service sub-types
  PRICE_FEED: 'price-feed',
  COMPUTE: 'compute',
  DATA_PROVIDER: 'data-provider',
  ANALYSIS: 'analysis',

  // settlement sub-types
  SWARM_DEAL: 'swarm-deal',
  ROOM_NEGOTIATION: 'room-negotiation',
  AUCTION: 'auction',

  // uptime sub-types
  AVAILABILITY: 'availability',
  RESPONSE_TIME: 'response-time',
} as const;

export type Tag2 = typeof TAG2[keyof typeof TAG2];

/** Resolved tag pair for an ERC-8004 feedback entry. */
export interface FeedbackTags {
  tag1: Tag1;
  tag2: Tag2;
}

// ── Tag Resolution ──

/**
 * Resolve tags from a swarm settlement event.
 *
 * The settlement chain + symbol determine the tag2 sub-category.
 * tag1 is always "settlement" for swarm deals, but we also add
 * a payment-type tag for the underlying transfer.
 */
export function resolveSettlementTags(_chain: string, _symbol: string): FeedbackTags {
  return {
    tag1: TAG1.SETTLEMENT,
    tag2: TAG2.SWARM_DEAL,
  };
}

/**
 * Resolve tags for the payment leg of a settlement.
 * This is a separate feedback entry from the settlement itself —
 * it rates the payment reliability, not the deal outcome.
 */
export function resolvePaymentTags(chain: string): FeedbackTags {
  let tag2: Tag2;
  switch (chain) {
    case 'bitcoin':
      tag2 = TAG2.BTC_TRANSFER;
      break;
    case 'spark':
      tag2 = TAG2.SPARK_TRANSFER;
      break;
    default:
      tag2 = TAG2.EVM_TRANSFER;
      break;
  }
  return { tag1: TAG1.PAYMENT, tag2 };
}

/**
 * Resolve tags for an x402 machine payment.
 */
export function resolveX402Tags(): FeedbackTags {
  return { tag1: TAG1.PAYMENT, tag2: TAG2.X402 };
}

/**
 * Resolve tags for a DeFi operation (swap, bridge, yield).
 */
export function resolveTradeTags(action: string): FeedbackTags {
  let tag2: Tag2;
  switch (action) {
    case 'swap':
      tag2 = TAG2.SWAP;
      break;
    case 'bridge':
      tag2 = TAG2.BRIDGE;
      break;
    case 'deposit':
      tag2 = TAG2.YIELD_DEPOSIT;
      break;
    case 'withdraw':
      tag2 = TAG2.YIELD_WITHDRAW;
      break;
    default:
      tag2 = TAG2.SWAP;
      break;
  }
  return { tag1: TAG1.TRADE, tag2 };
}

/**
 * Resolve tags for a service quality rating.
 */
export function resolveServiceTags(serviceType: string): FeedbackTags {
  let tag2: Tag2;
  switch (serviceType) {
    case 'price-feed':
      tag2 = TAG2.PRICE_FEED;
      break;
    case 'compute':
      tag2 = TAG2.COMPUTE;
      break;
    case 'data-provider':
      tag2 = TAG2.DATA_PROVIDER;
      break;
    case 'analysis':
      tag2 = TAG2.ANALYSIS;
      break;
    default:
      tag2 = TAG2.DATA_PROVIDER;
      break;
  }
  return { tag1: TAG1.SERVICE, tag2 };
}

/**
 * All tag1 categories — used for dashboard tag breakdown queries.
 */
export const ALL_TAG1_CATEGORIES: readonly Tag1[] = Object.values(TAG1);

/**
 * Human-readable labels for tag1 categories (dashboard display).
 */
export const TAG1_LABELS: Record<Tag1, string> = {
  payment: 'Payments',
  trade: 'DeFi Trades',
  service: 'Services',
  settlement: 'Settlements',
  uptime: 'Uptime',
};

/**
 * ERC-8004 feedback value ranges.
 * The spec uses int128 with configurable decimals.
 * We use a simple 0-100 scale (valueDecimals=0) for Oikos.
 */
export const FEEDBACK_SCALE = {
  /** Excellent outcome — full satisfaction */
  EXCELLENT: 100,
  /** Good outcome — minor issues */
  GOOD: 80,
  /** Acceptable — met minimum expectations */
  ACCEPTABLE: 60,
  /** Poor — below expectations */
  POOR: 30,
  /** Failed — did not deliver */
  FAILED: 0,
  /** Negative — caused harm (scam, lost funds) */
  NEGATIVE: -50,
} as const;

/**
 * Derive a feedback value from a settlement outcome.
 * Simple heuristic: success → GOOD, failure → POOR.
 */
export function deriveFeedbackValue(success: boolean, timeliness?: 'fast' | 'normal' | 'slow'): number {
  if (!success) return FEEDBACK_SCALE.POOR;
  if (timeliness === 'fast') return FEEDBACK_SCALE.EXCELLENT;
  if (timeliness === 'slow') return FEEDBACK_SCALE.ACCEPTABLE;
  return FEEDBACK_SCALE.GOOD;
}
