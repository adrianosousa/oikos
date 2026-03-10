/**
 * Agent Brain — The core reasoning loop.
 *
 * Receives events -> reasons with LLM -> produces proposals -> sends to wallet.
 * Supports all operation types: payment, swap, bridge, yield, hold.
 * The brain NEVER signs transactions. It proposes, the wallet decides.
 */

import type { WalletIPCClient } from '../ipc/client.js';
import type { StreamEvent } from '../events/types.js';
import type {
  PaymentProposal,
  SwapProposal,
  BridgeProposal,
  YieldProposal,
  FeedbackProposal,
  ProposalCommon,
  ExecutionResult,
  BalanceResponse,
  PolicyStatus,
  TokenSymbol,
  Chain,
  IdentityResult,
} from '../ipc/types.js';
import type { BrainConfig } from '../config/env.js';
import type OpenAI from 'openai';
import type { LLMPaymentDecision } from '../llm/client.js';
import { MockLLM } from '../llm/mock.js';
import { reasonAboutPayment } from '../llm/client.js';
import { buildSystemPrompt, buildEventPrompt } from './prompts.js';
import type { SwarmEvent, SwarmSettlementEvent, BoardAnnouncement } from '../swarm/types.js';
import type { PricingService } from '../pricing/client.js';

/** ERC-8004 on-chain identity state */
export interface ERC8004Identity {
  registered: boolean;
  agentId: string | null;
  walletSet: boolean;
  agentURI: string | null;
  registrationTxHash: string | null;
}

/** Brain state exposed to the dashboard */
export interface BrainState {
  status: 'idle' | 'reasoning' | 'proposing' | 'waiting';
  lastReasoning: string;
  lastDecision: string;
  eventsSeen: number;
  proposalsSent: number;
  proposalsApproved: number;
  proposalsRejected: number;
  proposalsFailed: number;
  recentResults: ExecutionResult[];
  balances: BalanceResponse[];
  policies: PolicyStatus[];
  creatorAddress: string;
  portfolioAllocations: Record<string, number>;
  portfolioTotalUsd: number;
  assetPrices: Record<string, number>;
  defiOps: number;
  swarmEvents: Array<{ kind: string; summary: string; timestamp: number }>;
  erc8004Identity: ERC8004Identity;
}

export class AgentBrain {
  private wallet: WalletIPCClient;
  private config: BrainConfig;
  private llmClient: OpenAI | null;
  private mockLlm: MockLLM | null;
  private pricing: PricingService | null = null;

  private state: BrainState = {
    status: 'idle',
    lastReasoning: '',
    lastDecision: 'No decision yet',
    eventsSeen: 0,
    proposalsSent: 0,
    proposalsApproved: 0,
    proposalsRejected: 0,
    proposalsFailed: 0,
    recentResults: [],
    balances: [],
    policies: [],
    creatorAddress: '',
    portfolioAllocations: {},
    portfolioTotalUsd: 0,
    assetPrices: {},
    defiOps: 0,
    swarmEvents: [],
    erc8004Identity: {
      registered: false,
      agentId: null,
      walletSet: false,
      agentURI: null,
      registrationTxHash: null,
    },
  };

  /** Event buffer — accumulates events between reasoning cycles */
  private eventBuffer: StreamEvent[] = [];

  /** Whether a reasoning cycle is currently running */
  private processing = false;

  constructor(wallet: WalletIPCClient, config: BrainConfig, llmClient: OpenAI | null) {
    this.wallet = wallet;
    this.config = config;

    if (config.mockLlm) {
      this.llmClient = null;
      this.mockLlm = new MockLLM();
    } else {
      this.llmClient = llmClient;
      this.mockLlm = null;
    }
  }

  /** Set the target creator address */
  setCreator(address: string): void {
    this.state.creatorAddress = address;
  }

  /** Set the pricing service for live market data */
  setPricing(pricing: PricingService): void {
    this.pricing = pricing;
  }

  /** Get current brain state (for dashboard) */
  getState(): BrainState {
    return { ...this.state };
  }

  /** Get ERC-8004 identity state */
  getIdentityState(): ERC8004Identity {
    return { ...this.state.erc8004Identity };
  }

  /**
   * Bootstrap ERC-8004 on-chain identity.
   * 1. Register identity (mint ERC-721 NFT)
   * 2. Set agent wallet (EIP-712 signed)
   */
  async bootstrapIdentity(dashboardPort: number): Promise<void> {
    const agentURI = `http://127.0.0.1:${dashboardPort}/agent-card.json`;
    this.state.erc8004Identity.agentURI = agentURI;

    console.error(`[brain] ERC-8004: Registering identity (agentURI: ${agentURI})...`);

    try {
      // Step 1: Register identity
      const registerResult: IdentityResult = await this.wallet.registerIdentity(agentURI);

      if (registerResult.status === 'registered' && registerResult.agentId) {
        this.state.erc8004Identity.registered = true;
        this.state.erc8004Identity.agentId = registerResult.agentId;
        this.state.erc8004Identity.registrationTxHash = registerResult.txHash ?? null;
        console.error(`[brain] ERC-8004: Identity registered (agentId: ${registerResult.agentId}, tx: ${registerResult.txHash ?? 'n/a'})`);

        // Step 2: Set agent wallet (deadline: 1 hour from now)
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const walletResult: IdentityResult = await this.wallet.setAgentWallet(registerResult.agentId, deadline);

        if (walletResult.status === 'wallet_set') {
          this.state.erc8004Identity.walletSet = true;
          console.error(`[brain] ERC-8004: Wallet linked (tx: ${walletResult.txHash ?? 'n/a'})`);
        } else {
          console.error(`[brain] ERC-8004: setAgentWallet failed: ${walletResult.error ?? 'unknown'}`);
        }
      } else {
        console.error(`[brain] ERC-8004: Registration failed: ${registerResult.error ?? 'unknown'}`);
      }
    } catch (err) {
      console.error(`[brain] ERC-8004: Bootstrap error: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  /** Feed events from the event source */
  handleEvents(events: StreamEvent[]): void {
    this.eventBuffer.push(...events);
    this.state.eventsSeen += events.length;

    // Trigger reasoning if not already processing
    if (!this.processing) {
      void this.processEvents();
    }
  }

  /** Refresh wallet state (balances, policies) */
  async refreshWalletState(): Promise<void> {
    try {
      const [allBalances, policyStatus] = await Promise.all([
        this.wallet.queryBalanceAll(),
        this.wallet.queryPolicy(),
      ]);
      this.state.balances = allBalances;
      this.state.policies = policyStatus;

      // Update portfolio allocations (uses live prices if available)
      await this.updatePortfolioAllocations(allBalances);
    } catch (err) {
      console.error('[brain] Failed to refresh wallet state:', err instanceof Error ? err.message : 'Unknown');
    }
  }

  /** Compute portfolio allocation percentages from balances (uses live prices if available) */
  private async updatePortfolioAllocations(balances: BalanceResponse[]): Promise<void> {
    if (this.pricing) {
      try {
        const valuation = await this.pricing.valuatePortfolio(balances);
        this.state.portfolioTotalUsd = valuation.totalUsd;

        const allocations: Record<string, number> = {};
        for (const a of valuation.assets) {
          allocations[a.symbol] = a.allocation;
        }
        this.state.portfolioAllocations = allocations;

        // Cache asset prices for dashboard/LLM
        const prices: Record<string, number> = {};
        for (const p of valuation.prices) {
          prices[p.symbol] = p.priceUsd;
        }
        this.state.assetPrices = prices;
        return;
      } catch {
        // Fall through to static fallback
      }
    }

    // Fallback: static prices
    const pricesUsd: Record<string, number> = {
      USDT: 1, USAT: 1, XAUT: 2650, BTC: 85000, ETH: 3200,
    };
    const decimals: Record<string, number> = {
      USDT: 6, USAT: 6, XAUT: 6, BTC: 8, ETH: 18,
    };

    let totalUsd = 0;
    const values: Record<string, number> = {};

    for (const b of balances) {
      const rawBalance = BigInt(b.balance || '0');
      const dec = decimals[b.symbol] ?? 18;
      const humanBalance = Number(rawBalance) / Math.pow(10, dec);
      const usdValue = humanBalance * (pricesUsd[b.symbol] ?? 0);
      values[b.symbol] = (values[b.symbol] ?? 0) + usdValue;
      totalUsd += usdValue;
    }

    const allocations: Record<string, number> = {};
    for (const [symbol, value] of Object.entries(values)) {
      allocations[symbol] = totalUsd > 0 ? value / totalUsd : 0;
    }
    this.state.portfolioAllocations = allocations;
    this.state.portfolioTotalUsd = totalUsd;
    this.state.assetPrices = pricesUsd;
  }

  // -- Core Reasoning Loop --

  private async processEvents(): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    this.processing = true;
    this.state.status = 'reasoning';

    // Drain the event buffer
    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      // Refresh wallet state before reasoning
      await this.refreshWalletState();

      // Build prompts
      const systemPrompt = buildSystemPrompt(
        this.state.balances,
        this.state.policies,
        this.state.creatorAddress,
      );

      const eventData = events.map(e => ({
        type: e.type,
        data: e.data as unknown as Record<string, unknown>,
        timestamp: e.timestamp,
      }));
      const userPrompt = buildEventPrompt(eventData);

      // Reason with LLM (mock or real)
      let reasoning: string;
      let decision: LLMPaymentDecision | null;

      if (this.mockLlm) {
        const result = await this.mockLlm.reason(systemPrompt, userPrompt);
        reasoning = result.reasoning;
        decision = result.decision;
        console.error(`[brain] Mock LLM: ${reasoning.slice(0, 100)}...`);
      } else if (this.llmClient) {
        const result = await reasonAboutPayment(
          this.llmClient,
          this.config.llmModel,
          systemPrompt,
          userPrompt,
        );
        reasoning = result.reasoning;
        decision = result.decision;
        console.error(`[brain] LLM (${result.model}): ${reasoning.slice(0, 100)}... [${result.tokensUsed} tokens]`);
      } else {
        reasoning = 'No LLM configured';
        decision = null;
      }

      this.state.lastReasoning = reasoning;

      // Route decision to the appropriate operation handler
      if (decision) {
        const opType = decision.operationType ?? 'payment';
        await this.executeDecision(opType, decision);
      } else {
        this.state.lastDecision = `Hold: ${reasoning.slice(0, 100)}`;
      }
    } catch (err) {
      console.error('[brain] Reasoning error:', err instanceof Error ? err.message : 'Unknown');
    } finally {
      this.processing = false;
      this.state.status = 'idle';

      // If more events arrived during processing, process again
      if (this.eventBuffer.length > 0) {
        void this.processEvents();
      }
    }
  }

  /** Handle a swarm event — convert to reasoning trigger or track */
  handleSwarmEvent(event: SwarmEvent): void {
    // Build summary from event kind
    let summary: string;
    switch (event.kind) {
      case 'peer_connected':
        summary = `Peer connected: ${event.pubkey.slice(0, 12)}...`;
        break;
      case 'peer_disconnected':
        summary = `Peer disconnected: ${event.pubkey.slice(0, 12)}...`;
        break;
      case 'board_message':
        if (event.message.type === 'announcement') {
          const ann = event.message as BoardAnnouncement;
          summary = `Board: ${ann.agentName} posted "${ann.title}" (${ann.category})`;
        } else {
          summary = `Board: heartbeat from ${event.fromPubkey.slice(0, 12)}...`;
        }
        break;
      case 'room_message':
        summary = `Room ${event.roomId.slice(0, 8)}: ${event.message.type} from ${event.fromPubkey.slice(0, 12)}...`;
        break;
      case 'feed_message':
        summary = `Feed: ${event.message.type} from ${event.fromPubkey.slice(0, 12)}...`;
        break;
      default:
        summary = `Swarm event: ${(event as { kind: string }).kind}`;
    }

    // Track event
    this.state.swarmEvents.unshift({ kind: event.kind, summary, timestamp: Date.now() });
    if (this.state.swarmEvents.length > 50) {
      this.state.swarmEvents.pop();
    }

    // Log announcements from other agents for dashboard visibility
    if (event.kind === 'board_message' && event.message.type === 'announcement') {
      const ann = event.message as BoardAnnouncement;
      console.error(`[brain] Swarm announcement: "${ann.title}" from ${ann.agentName} (${ann.category})`);
    }

    // On settlement, submit ERC-8004 feedback if identity is registered
    if (event.kind === 'settlement_completed' && this.state.erc8004Identity.registered) {
      void this.submitSettlementFeedback(event as SwarmSettlementEvent);
    }
  }

  /** Submit ERC-8004 reputation feedback after a room settlement. */
  private async submitSettlementFeedback(event: SwarmSettlementEvent): Promise<void> {
    const agentId = this.state.erc8004Identity.agentId;
    if (!agentId) return;

    const feedbackValue = event.success ? 100 : -50;
    const feedbackProposal: FeedbackProposal = {
      amount: event.amount,
      symbol: event.symbol as TokenSymbol,
      chain: 'ethereum' as Chain,
      reason: `Settlement feedback for room ${event.announcementId}`,
      confidence: 1.0,
      strategy: 'reputation',
      timestamp: Date.now(),
      targetAgentId: event.peerPubkey,
      feedbackValue,
      tag1: 'settlement',
      tag2: event.success ? 'success' : 'failure',
      endpoint: '',
      feedbackURI: '',
      feedbackHash: '',
    };

    try {
      const result = await this.wallet.proposeFeedback(feedbackProposal, 'swarm');
      console.error(`[brain] ERC-8004 feedback: ${result.status} (peer: ${event.peerPubkey.slice(0, 12)}...)`);
    } catch (err) {
      console.error(`[brain] ERC-8004 feedback error: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  /** Route a decision to the appropriate proposal type and execute via IPC */
  private async executeDecision(opType: string, decision: LLMPaymentDecision): Promise<void> {
    this.state.status = 'proposing';

    const common: ProposalCommon = {
      amount: decision.amount,
      symbol: decision.symbol as TokenSymbol,
      chain: decision.chain as Chain,
      reason: decision.reason,
      confidence: decision.confidence,
      strategy: decision.strategy,
      timestamp: Date.now(),
    };

    let result: ExecutionResult;

    try {
      switch (opType) {
        case 'swap': {
          this.state.lastDecision = `Swap ${decision.amount} ${decision.symbol} -> ${decision.toSymbol ?? '?'}: ${decision.reason}`;
          const swapProposal: SwapProposal = {
            ...common,
            toSymbol: (decision.toSymbol ?? 'USDT') as TokenSymbol,
          };
          this.state.proposalsSent++;
          this.state.defiOps++;
          result = await this.wallet.proposeSwap(swapProposal);
          break;
        }

        case 'bridge': {
          this.state.lastDecision = `Bridge ${decision.amount} ${decision.symbol} ${decision.fromChain ?? 'ethereum'} -> ${decision.toChain ?? '?'}: ${decision.reason}`;
          const bridgeProposal: BridgeProposal = {
            ...common,
            fromChain: (decision.fromChain ?? decision.chain) as Chain,
            toChain: (decision.toChain ?? 'arbitrum') as Chain,
          };
          this.state.proposalsSent++;
          this.state.defiOps++;
          result = await this.wallet.proposeBridge(bridgeProposal);
          break;
        }

        case 'yield': {
          this.state.lastDecision = `Yield ${decision.action ?? 'deposit'} ${decision.amount} ${decision.symbol} on ${decision.protocol ?? '?'}: ${decision.reason}`;
          const yieldProposal: YieldProposal = {
            ...common,
            protocol: decision.protocol ?? 'aave',
            action: (decision.action ?? 'deposit') as 'deposit' | 'withdraw',
          };
          this.state.proposalsSent++;
          this.state.defiOps++;
          result = await this.wallet.proposeYield(yieldProposal);
          break;
        }

        case 'payment':
        default: {
          this.state.lastDecision = `Pay ${decision.amount} ${decision.symbol}: ${decision.reason}`;
          const paymentProposal: PaymentProposal = {
            ...common,
            to: decision.to || this.state.creatorAddress,
          };
          this.state.proposalsSent++;
          result = await this.wallet.proposePayment(paymentProposal);
          break;
        }
      }

      // Track result
      this.state.recentResults.unshift(result);
      if (this.state.recentResults.length > 20) {
        this.state.recentResults.pop();
      }

      switch (result.status) {
        case 'executed':
          this.state.proposalsApproved++;
          console.error(`[brain] ${opType.toUpperCase()} EXECUTED: ${result.txHash ?? 'no hash'}`);
          break;
        case 'rejected':
          this.state.proposalsRejected++;
          console.error(`[brain] ${opType.toUpperCase()} REJECTED: ${result.violations.join(', ')}`);
          break;
        case 'failed':
          this.state.proposalsFailed++;
          console.error(`[brain] ${opType.toUpperCase()} FAILED: ${result.error ?? 'unknown error'}`);
          break;
      }
    } catch (err) {
      console.error('[brain] IPC error:', err instanceof Error ? err.message : 'Unknown');
      this.state.proposalsFailed++;
    }
  }
}
