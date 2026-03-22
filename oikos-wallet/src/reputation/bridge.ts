/**
 * Reputation Bridge — Auto-submits ERC-8004 on-chain feedback after settlements.
 *
 * This is the core "off-chain → on-chain" reputation flow:
 *
 *   SwarmSettlementEvent → ReputationBridge → FeedbackProposal → IPC
 *   → Wallet Isolate → PolicyEngine → giveFeedback() on Sepolia
 *
 * The bridge makes ERC-8004 the universal reputation anchor for all chains.
 * A BTC Lightning payment, an EVM swap, an x402 micropayment — all become
 * tagged on-chain feedback entries, queryable via getSummary(agentId, [], tag1, tag2).
 *
 * Rate limiting: max 1 feedback per peer per hour (gas conservation).
 * Config: AUTO_FEEDBACK_ENABLED env var (default: true when ERC8004_ENABLED=true).
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */

import type { WalletIPCClient } from '../ipc/client.js';
import type { FeedbackProposal, ExecutionResult } from '../ipc/types.js';
import type { SwarmSettlementEvent, SwarmPeerInfo } from '../swarm/types.js';
import {
  resolveSettlementTags,
  resolvePaymentTags,
  resolveX402Tags,
  deriveFeedbackValue,
} from './tags.js';
import {
  generateFeedbackId,
  generateFeedbackFile,
  hashFeedbackFile,
} from './feedback-file.js';
import type { FeedbackFileContext } from './feedback-file.js';

// ── Types ──

/** Identity state from the main application. */
export interface IdentityState {
  registered: boolean;
  agentId?: string;
  walletAddress?: string;
}

/** Minimal peer info needed for bridge lookups. */
export interface PeerLookup {
  /** Look up a peer's ERC-8004 agentId by their swarm pubkey. Returns undefined if not registered. */
  getErc8004AgentId(peerPubkey: string): string | undefined;
  /** Look up peer info by pubkey. */
  getPeerInfo(peerPubkey: string): SwarmPeerInfo | undefined;
}

/** Configuration for the ReputationBridge. */
export interface ReputationBridgeConfig {
  /** Whether auto-feedback is enabled */
  enabled: boolean;
  /** Base URL for feedback file hosting (dashboard URL) */
  dashboardBaseUrl: string;
  /** Max feedback per peer per hour (default: 1) */
  rateLimit: number;
}

// ── Rate Limiter ──

/** Simple per-peer rate limiter. */
class RateLimiter {
  private timestamps: Map<string, number[]> = new Map();
  private maxPerHour: number;

  constructor(maxPerHour: number) {
    this.maxPerHour = maxPerHour;
  }

  /** Returns true if the action is allowed (not rate-limited). */
  allow(key: string): boolean {
    const now = Date.now();
    const hourAgo = now - 3600_000;
    const entries = this.timestamps.get(key) ?? [];
    // Prune old entries
    const recent = entries.filter((t) => t > hourAgo);
    if (recent.length >= this.maxPerHour) {
      return false;
    }
    recent.push(now);
    this.timestamps.set(key, recent);
    return true;
  }

  /** Get remaining allowance for a key. */
  remaining(key: string): number {
    const now = Date.now();
    const hourAgo = now - 3600_000;
    const entries = this.timestamps.get(key) ?? [];
    const recent = entries.filter((t) => t > hourAgo);
    return Math.max(0, this.maxPerHour - recent.length);
  }
}

// ── ReputationBridge ──

export class ReputationBridge {
  private wallet: WalletIPCClient;
  private identity: IdentityState;
  private peerLookup: PeerLookup;
  private config: ReputationBridgeConfig;
  private rateLimiter: RateLimiter;

  /** Count of feedback submissions attempted */
  private feedbackAttempted = 0;
  /** Count of feedback submissions succeeded */
  private feedbackSucceeded = 0;
  /** Count of feedback skipped (rate limited or no on-chain identity) */
  private feedbackSkipped = 0;

  constructor(
    wallet: WalletIPCClient,
    identity: IdentityState,
    peerLookup: PeerLookup,
    config: ReputationBridgeConfig,
  ) {
    this.wallet = wallet;
    this.identity = identity;
    this.peerLookup = peerLookup;
    this.config = config;
    this.rateLimiter = new RateLimiter(config.rateLimit);
  }

  /**
   * Handle a swarm settlement event.
   *
   * Generates two feedback entries:
   * 1. Settlement quality (tag1="settlement", tag2="swarm-deal")
   * 2. Payment reliability (tag1="payment", tag2=chain-specific)
   *
   * Both entries are submitted as FeedbackProposals through the same
   * PolicyEngine → Executor pipeline as all other proposals.
   */
  async onSettlement(event: SwarmSettlementEvent): Promise<void> {
    if (!this.config.enabled) return;
    if (!this.identity.registered || !this.identity.agentId) return;

    // Look up peer's ERC-8004 identity
    const peerAgentId = this.peerLookup.getErc8004AgentId(event.peerPubkey);
    if (!peerAgentId) {
      this.feedbackSkipped++;
      return; // Peer has no on-chain identity — skip
    }

    // Rate limit check
    if (!this.rateLimiter.allow(event.peerPubkey)) {
      this.feedbackSkipped++;
      return;
    }

    // Determine feedback value based on outcome
    const feedbackValue = deriveFeedbackValue(event.success);

    // Get peer info for endpoint construction
    const peerInfo = this.peerLookup.getPeerInfo(event.peerPubkey);
    const endpoint = peerInfo ? `swarm://${event.peerPubkey}` : '';

    // ── Settlement feedback ──
    const settlementTags = resolveSettlementTags(event.symbol, event.symbol);
    await this._submitFeedback({
      targetAgentId: peerAgentId,
      feedbackValue,
      tags: settlementTags,
      endpoint,
      txHash: event.txHash,
      chain: event.symbol === 'BTC' ? 'bitcoin' : 'ethereum',
      announcementId: event.announcementId,
      amount: event.amount,
      symbol: event.symbol,
      success: event.success,
    });

    // ── Payment reliability feedback ──
    if (event.success && event.txHash) {
      const paymentTags = resolvePaymentTags(
        event.symbol === 'BTC' ? 'bitcoin' : 'ethereum'
      );
      await this._submitFeedback({
        targetAgentId: peerAgentId,
        feedbackValue: deriveFeedbackValue(true),
        tags: paymentTags,
        endpoint,
        txHash: event.txHash,
        chain: event.symbol === 'BTC' ? 'bitcoin' : 'ethereum',
        announcementId: event.announcementId,
        amount: event.amount,
        symbol: event.symbol,
        success: true,
      });
    }
  }

  /**
   * Handle an x402 payment completion.
   *
   * Submits feedback for the x402 resource server with tag1="payment", tag2="x402".
   */
  async onX402Payment(opts: {
    peerPubkey: string;
    txHash: string;
    amount: string;
    symbol: string;
    serviceEndpoint: string;
    success: boolean;
  }): Promise<void> {
    if (!this.config.enabled) return;
    if (!this.identity.registered || !this.identity.agentId) return;

    const peerAgentId = this.peerLookup.getErc8004AgentId(opts.peerPubkey);
    if (!peerAgentId) {
      this.feedbackSkipped++;
      return;
    }

    if (!this.rateLimiter.allow(opts.peerPubkey)) {
      this.feedbackSkipped++;
      return;
    }

    const tags = resolveX402Tags();
    const feedbackValue = deriveFeedbackValue(opts.success);

    await this._submitFeedback({
      targetAgentId: peerAgentId,
      feedbackValue,
      tags,
      endpoint: opts.serviceEndpoint,
      txHash: opts.txHash,
      chain: 'ethereum',
      amount: opts.amount,
      symbol: opts.symbol,
      success: opts.success,
    });
  }

  /**
   * Get bridge statistics for dashboard display.
   */
  getStats(): {
    enabled: boolean;
    feedbackAttempted: number;
    feedbackSucceeded: number;
    feedbackSkipped: number;
  } {
    return {
      enabled: this.config.enabled,
      feedbackAttempted: this.feedbackAttempted,
      feedbackSucceeded: this.feedbackSucceeded,
      feedbackSkipped: this.feedbackSkipped,
    };
  }

  /**
   * Update identity state (called when identity registers after bridge creation).
   */
  updateIdentity(identity: IdentityState): void {
    this.identity = identity;
  }

  // ── Internal ──

  private async _submitFeedback(opts: {
    targetAgentId: string;
    feedbackValue: number;
    tags: { tag1: string; tag2: string };
    endpoint: string;
    txHash?: string;
    chain?: string;
    announcementId?: string;
    amount?: string;
    symbol?: string;
    success?: boolean;
  }): Promise<void> {
    this.feedbackAttempted++;

    try {
      // Generate off-chain feedback file
      const feedbackId = generateFeedbackId();
      const ctx: FeedbackFileContext = {
        targetAgentId: opts.targetAgentId,
        clientAddress: this.identity.walletAddress ?? '',
        feedbackValue: opts.feedbackValue,
        tag1: opts.tags.tag1 as FeedbackFileContext['tag1'],
        tag2: opts.tags.tag2 as FeedbackFileContext['tag2'],
        endpoint: opts.endpoint,
        txHash: opts.txHash,
        chain: opts.chain,
        announcementId: opts.announcementId,
        agreedPrice: opts.amount,
        agreedSymbol: opts.symbol,
        settlementSuccess: opts.success,
      };

      const feedbackFile = generateFeedbackFile(feedbackId, ctx);
      const feedbackHash = hashFeedbackFile(feedbackFile);
      const feedbackURI = `${this.config.dashboardBaseUrl}/api/feedback/${feedbackId}`;

      // Build FeedbackProposal
      const proposal: FeedbackProposal = {
        targetAgentId: opts.targetAgentId,
        feedbackValue: opts.feedbackValue,
        tag1: opts.tags.tag1,
        tag2: opts.tags.tag2,
        endpoint: opts.endpoint,
        feedbackURI,
        feedbackHash,
        // ProposalCommon fields
        amount: '0', // Feedback itself doesn't transfer funds
        symbol: 'USDT',
        chain: 'ethereum', // ERC-8004 is on Sepolia
        reason: `Auto-feedback for ${opts.tags.tag1}/${opts.tags.tag2} — ${opts.success ? 'success' : 'failure'}`,
        confidence: 1.0, // Auto-feedback is deterministic
        strategy: 'reputation-bridge',
        timestamp: Date.now(),
      };

      const result: ExecutionResult = await this.wallet.proposeFeedback(proposal, 'swarm');
      if (result.status === 'executed') {
        this.feedbackSucceeded++;
      }
    } catch {
      // Don't let feedback failures break the settlement flow.
      // The settlement itself already succeeded — feedback is supplementary.
    }
  }
}
