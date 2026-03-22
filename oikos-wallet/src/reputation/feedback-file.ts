/**
 * Off-Chain Feedback File Generator for ERC-8004.
 *
 * ERC-8004's `giveFeedback()` accepts a `feedbackURI` and `feedbackHash`.
 * The URI points to a JSON file with detailed evidence; the hash is
 * keccak256 of that JSON for integrity verification.
 *
 * This module generates those files and stores them in memory for
 * serving via the dashboard at `GET /api/feedback/:feedbackId`.
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */

import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import type { Tag1, Tag2 } from './tags.js';

// ── Types ──

/** ERC-8004 compliant off-chain feedback JSON structure. */
export interface OffChainFeedback {
  /** Schema version */
  version: '1.0';
  /** ERC-8004 agent registry identifier */
  agentRegistry: string;
  /** Target agent's on-chain ID */
  agentId: number;
  /** Submitter's address (eip155 format) */
  clientAddress: string;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** Feedback value (matches on-chain) */
  value: number;
  /** Decimal places for value */
  valueDecimals: number;
  /** Primary category tag */
  tag1: Tag1;
  /** Sub-category tag */
  tag2: Tag2;
  /** Service endpoint being rated (optional) */
  endpoint?: string;
  /** Proof of payment for the underlying transaction */
  proofOfPayment?: {
    fromAddress: string;
    toAddress: string;
    chainId: string;
    txHash: string;
  };
  /** Settlement context (for swarm deals) */
  settlement?: {
    announcementId: string;
    agreedPrice: string;
    agreedSymbol: string;
    chain: string;
    success: boolean;
  };
  /** MCP tools used (if applicable) */
  mcp?: {
    tool?: string;
  };
}

/** Context needed to generate a feedback file. */
export interface FeedbackFileContext {
  /** Target agent's ERC-8004 agentId */
  targetAgentId: string;
  /** This agent's wallet address */
  clientAddress: string;
  /** Feedback value (0-100 scale) */
  feedbackValue: number;
  /** Resolved tags */
  tag1: Tag1;
  tag2: Tag2;
  /** Service endpoint (optional) */
  endpoint?: string;
  /** Transaction hash (proof of payment) */
  txHash?: string;
  /** From/to addresses */
  fromAddress?: string;
  toAddress?: string;
  /** Chain identifier */
  chain?: string;
  /** Chain ID (numeric) */
  chainId?: string;
  /** Settlement details (for swarm deals) */
  announcementId?: string;
  agreedPrice?: string;
  agreedSymbol?: string;
  settlementSuccess?: boolean;
}

// ── In-Memory Store ──

const feedbackStore = new Map<string, OffChainFeedback>();

let feedbackCounter = 0;

// ── Public API ──

/**
 * Generate a unique feedback ID.
 */
export function generateFeedbackId(): string {
  feedbackCounter++;
  return `fb-${Date.now()}-${feedbackCounter}`;
}

/**
 * Generate an ERC-8004 compliant off-chain feedback JSON file.
 *
 * Stores the file in memory and returns the feedbackId for URL construction.
 */
export function generateFeedbackFile(
  feedbackId: string,
  ctx: FeedbackFileContext,
): OffChainFeedback {
  const feedback: OffChainFeedback = {
    version: '1.0',
    agentRegistry: 'eip155:11155111:0x8004A818BFB912233c491871b3d84c89A494BD9e',
    agentId: Number(ctx.targetAgentId),
    clientAddress: ctx.clientAddress ? `eip155:11155111:${ctx.clientAddress}` : '',
    createdAt: new Date().toISOString(),
    value: ctx.feedbackValue,
    valueDecimals: 0,
    tag1: ctx.tag1,
    tag2: ctx.tag2,
  };

  if (ctx.endpoint) {
    feedback.endpoint = ctx.endpoint;
  }

  if (ctx.txHash) {
    feedback.proofOfPayment = {
      fromAddress: ctx.fromAddress ?? '',
      toAddress: ctx.toAddress ?? '',
      chainId: ctx.chainId ?? '11155111',
      txHash: ctx.txHash,
    };
  }

  if (ctx.announcementId) {
    feedback.settlement = {
      announcementId: ctx.announcementId,
      agreedPrice: ctx.agreedPrice ?? '0',
      agreedSymbol: ctx.agreedSymbol ?? 'USDT',
      chain: ctx.chain ?? 'ethereum',
      success: ctx.settlementSuccess ?? true,
    };
  }

  // Store for serving via dashboard
  feedbackStore.set(feedbackId, feedback);

  return feedback;
}

/**
 * Compute keccak256 hash of an off-chain feedback file.
 *
 * Returns bytes32 hex string (with 0x prefix) for the `feedbackHash`
 * parameter in `giveFeedback()`.
 */
export function hashFeedbackFile(feedback: OffChainFeedback): string {
  const json = JSON.stringify(feedback);
  const bytes = new TextEncoder().encode(json);
  const hash = keccak_256(bytes);
  return '0x' + bytesToHex(hash);
}

/**
 * Retrieve a stored feedback file by ID.
 * Returns undefined if not found.
 */
export function getFeedbackFile(feedbackId: string): OffChainFeedback | undefined {
  return feedbackStore.get(feedbackId);
}

/**
 * Get all stored feedback IDs (for listing).
 */
export function listFeedbackIds(): string[] {
  return Array.from(feedbackStore.keys());
}

/**
 * Get the total count of feedback files stored.
 */
export function getFeedbackCount(): number {
  return feedbackStore.size;
}
