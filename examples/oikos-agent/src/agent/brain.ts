/**
 * Oikos Agent Brain — Autonomous portfolio manager.
 *
 * Connects to oikos-wallet via HTTP REST. Polls events, reasons with LLM,
 * proposes operations via MCP. The canonical example of building on Oikos.
 *
 * The brain NEVER signs transactions. It proposes, Oikos decides.
 */

import type { OikosClient, BalanceResponse, PolicyStatus, StreamEvent, ExecutionResult } from '../oikos-client.js';
import type { LLMPaymentDecision, LLMResult } from '../llm/client.js';
import { MockLLM } from '../llm/mock.js';
import { buildSystemPrompt, buildEventPrompt } from './prompts.js';
import type OpenAI from 'openai';

export interface AgentConfig {
  /** Use mock LLM instead of real */
  mockLlm: boolean;
  /** LLM model name */
  llmModel: string;
  /** Default creator/recipient address */
  creatorAddress: string;
  /** Event poll interval (ms) */
  pollIntervalMs: number;
}

export interface AgentState {
  status: 'idle' | 'reasoning' | 'proposing' | 'polling';
  lastReasoning: string;
  lastDecision: string;
  eventsSeen: number;
  proposalsSent: number;
  proposalsApproved: number;
  proposalsRejected: number;
  proposalsFailed: number;
}

export class AgentBrain {
  private oikos: OikosClient;
  private config: AgentConfig;
  private llmClient: OpenAI | null;
  private mockLlm: MockLLM | null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastEventId = '';

  private state: AgentState = {
    status: 'idle',
    lastReasoning: '',
    lastDecision: 'No decision yet',
    eventsSeen: 0,
    proposalsSent: 0,
    proposalsApproved: 0,
    proposalsRejected: 0,
    proposalsFailed: 0,
  };

  constructor(oikos: OikosClient, config: AgentConfig, llmClient: OpenAI | null) {
    this.oikos = oikos;
    this.config = config;

    if (config.mockLlm) {
      this.llmClient = null;
      this.mockLlm = new MockLLM();
    } else {
      this.llmClient = llmClient;
      this.mockLlm = null;
    }
  }

  getState(): AgentState {
    return { ...this.state };
  }

  /** Start the agent reasoning loop */
  start(): void {
    console.error('[agent] Starting reasoning loop...');
    this.pollTimer = setInterval(() => {
      void this.pollAndReason();
    }, this.config.pollIntervalMs);

    // First poll immediately
    void this.pollAndReason();
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollAndReason(): Promise<void> {
    if (this.state.status !== 'idle') return;

    try {
      this.state.status = 'polling';

      // Fetch events, balances, policies from oikos-wallet
      const [events, balances, policies] = await Promise.all([
        this.oikos.getEvents(20),
        this.oikos.getBalances(),
        this.oikos.getPolicies(),
      ]);

      // Filter to new events only
      const newEvents = this.filterNewEvents(events);
      if (newEvents.length === 0) {
        this.state.status = 'idle';
        return;
      }

      this.state.eventsSeen += newEvents.length;
      this.state.status = 'reasoning';

      // Build prompts
      const systemPrompt = buildSystemPrompt(balances, policies, this.config.creatorAddress);
      const eventData = newEvents.map(e => ({
        type: e.type,
        data: e.data,
        timestamp: e.timestamp,
      }));
      const userPrompt = buildEventPrompt(eventData);

      // Reason with LLM
      let result: LLMResult;
      if (this.mockLlm) {
        result = await this.mockLlm.reason(systemPrompt, userPrompt);
        console.error(`[agent] Mock LLM: ${result.reasoning.slice(0, 100)}...`);
      } else if (this.llmClient) {
        const { reasonAboutPayment } = await import('../llm/client.js');
        result = await reasonAboutPayment(this.llmClient, this.config.llmModel, systemPrompt, userPrompt);
        console.error(`[agent] LLM (${result.model}): ${result.reasoning.slice(0, 100)}...`);
      } else {
        result = { decision: null, reasoning: 'No LLM configured', model: 'none', tokensUsed: 0 };
      }

      this.state.lastReasoning = result.reasoning;

      // Execute decision
      if (result.decision) {
        await this.executeDecision(result.decision);
      } else {
        this.state.lastDecision = `Hold: ${result.reasoning.slice(0, 100)}`;
      }
    } catch (err) {
      console.error('[agent] Error:', err instanceof Error ? err.message : 'Unknown');
    } finally {
      this.state.status = 'idle';
    }
  }

  private filterNewEvents(events: StreamEvent[]): StreamEvent[] {
    if (!this.lastEventId) {
      this.lastEventId = events[events.length - 1]?.id ?? '';
      return events; // First poll: process all
    }

    const idx = events.findIndex(e => e.id === this.lastEventId);
    if (idx === -1) return events; // All new
    const newEvents = events.slice(idx + 1);
    if (newEvents.length > 0) {
      this.lastEventId = newEvents[newEvents.length - 1]?.id ?? this.lastEventId;
    }
    return newEvents;
  }

  private async executeDecision(decision: LLMPaymentDecision): Promise<void> {
    this.state.status = 'proposing';
    const opType = decision.operationType ?? 'payment';

    try {
      let result: ExecutionResult;

      switch (opType) {
        case 'swap':
          this.state.lastDecision = `Swap ${decision.amount} ${decision.symbol} -> ${decision.toSymbol ?? '?'}`;
          result = await this.oikos.proposeSwap({
            amount: decision.amount,
            symbol: decision.symbol,
            toSymbol: decision.toSymbol ?? 'USDT',
            chain: decision.chain,
            reason: decision.reason,
            confidence: decision.confidence,
          });
          break;

        case 'bridge':
          this.state.lastDecision = `Bridge ${decision.amount} ${decision.symbol} ${decision.fromChain ?? 'ethereum'} -> ${decision.toChain ?? '?'}`;
          result = await this.oikos.proposeBridge({
            amount: decision.amount,
            symbol: decision.symbol,
            fromChain: decision.fromChain ?? decision.chain,
            toChain: decision.toChain ?? 'arbitrum',
            reason: decision.reason,
            confidence: decision.confidence,
          });
          break;

        case 'yield':
          this.state.lastDecision = `Yield ${decision.action ?? 'deposit'} ${decision.amount} ${decision.symbol}`;
          result = await this.oikos.proposeYield({
            amount: decision.amount,
            symbol: decision.symbol,
            protocol: decision.protocol ?? 'aave',
            action: (decision.action ?? 'deposit') as 'deposit' | 'withdraw',
            chain: decision.chain,
            reason: decision.reason,
            confidence: decision.confidence,
          });
          break;

        case 'payment':
        default:
          this.state.lastDecision = `Pay ${decision.amount} ${decision.symbol}: ${decision.reason}`;
          result = await this.oikos.proposePayment({
            to: decision.to || this.config.creatorAddress,
            amount: decision.amount,
            symbol: decision.symbol,
            chain: decision.chain,
            reason: decision.reason,
            confidence: decision.confidence,
          });
          break;
      }

      this.state.proposalsSent++;

      switch (result.status) {
        case 'executed':
          this.state.proposalsApproved++;
          console.error(`[agent] ${opType.toUpperCase()} EXECUTED: ${result.txHash ?? 'no hash'}`);
          break;
        case 'rejected':
          this.state.proposalsRejected++;
          console.error(`[agent] ${opType.toUpperCase()} REJECTED: ${result.violations.join(', ')}`);
          break;
        case 'failed':
          this.state.proposalsFailed++;
          console.error(`[agent] ${opType.toUpperCase()} FAILED: ${result.error ?? 'unknown'}`);
          break;
      }
    } catch (err) {
      console.error('[agent] Proposal error:', err instanceof Error ? err.message : 'Unknown');
      this.state.proposalsFailed++;
    }
  }
}
