/**
 * LLM Client — Sovereign-first AI integration.
 *
 * Defaults to Ollama (local, zero cloud deps).
 * Falls back to any OpenAI-compatible endpoint when configured.
 *
 * The LLM produces structured reasoning and operation decisions.
 * It NEVER has access to seed phrases or private keys.
 */

import OpenAI from 'openai';
import type { BrainConfig } from '../config/env.js';

/** Structured output from the LLM for payment/operation decisions */
export interface LLMPaymentDecision {
  shouldPay: boolean;
  reason: string;
  confidence: number;
  amount: string;
  symbol: string;
  chain: string;
  to: string;
  strategy: string;
  operationType?: string; // 'payment' | 'swap' | 'bridge' | 'yield'
  toSymbol?: string;      // For swaps
  fromChain?: string;     // For bridges
  toChain?: string;       // For bridges
  protocol?: string;      // For yield
  action?: string;        // For yield: 'deposit' | 'withdraw'
}

/** LLM reasoning result */
export interface LLMResult {
  decision: LLMPaymentDecision | null;
  reasoning: string;
  model: string;
  tokensUsed: number;
}

/**
 * Creates an LLM client configured for the given mode.
 */
export function createLLMClient(config: BrainConfig): OpenAI {
  return new OpenAI({
    baseURL: config.llmBaseUrl,
    apiKey: config.llmApiKey,
  });
}

/**
 * Ask the LLM to reason about events and produce an operation decision.
 *
 * @param client OpenAI-compatible client (Ollama or cloud)
 * @param model Model name to use
 * @param systemPrompt The agent's system prompt (includes policy context)
 * @param userPrompt The current events/context for reasoning
 * @returns Structured reasoning and optional operation decision
 */
export async function reasonAboutPayment(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResult> {
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1024,
    response_format: { type: 'json_object' },
  });

  const choice = completion.choices[0];
  const content = choice?.message?.content ?? '{}';
  const tokensUsed = completion.usage?.total_tokens ?? 0;

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;

    const decision = parsed['shouldPay'] === true ? {
      shouldPay: true,
      reason: String(parsed['reason'] ?? ''),
      confidence: Number(parsed['confidence'] ?? 0),
      amount: String(parsed['amount'] ?? '0'),
      symbol: String(parsed['symbol'] ?? 'USDT'),
      chain: String(parsed['chain'] ?? 'ethereum'),
      to: String(parsed['to'] ?? ''),
      strategy: String(parsed['strategy'] ?? 'unknown'),
      operationType: parsed['operationType'] !== undefined
        ? String(parsed['operationType'])
        : undefined,
      toSymbol: parsed['toSymbol'] !== undefined
        ? String(parsed['toSymbol'])
        : undefined,
      fromChain: parsed['fromChain'] !== undefined
        ? String(parsed['fromChain'])
        : undefined,
      toChain: parsed['toChain'] !== undefined
        ? String(parsed['toChain'])
        : undefined,
      protocol: parsed['protocol'] !== undefined
        ? String(parsed['protocol'])
        : undefined,
      action: parsed['action'] !== undefined
        ? String(parsed['action'])
        : undefined,
    } : null;

    return {
      decision,
      reasoning: String(parsed['reasoning'] ?? content),
      model,
      tokensUsed,
    };
  } catch {
    return {
      decision: null,
      reasoning: content,
      model,
      tokensUsed,
    };
  }
}
