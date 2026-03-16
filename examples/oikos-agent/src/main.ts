/**
 * Oikos Agent — Canonical autonomous agent example.
 *
 * Connects to a running oikos-wallet via HTTP REST and MCP.
 * Polls events, reasons with LLM, proposes wallet operations.
 *
 * This is the flagship example of what you can build on the Oikos protocol.
 * No workspace dependencies — standalone package with only `openai` as dep.
 *
 * Usage:
 *   # Start oikos-wallet first:
 *   OIKOS_MODE=mock node oikos-wallet/dist/src/main.js
 *
 *   # Then start the agent:
 *   OIKOS_URL=http://127.0.0.1:3420 node examples/oikos-agent/dist/src/main.js
 */

import { OikosClient } from './oikos-client.js';
import { AgentBrain } from './agent/brain.js';

function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing environment variable: ${key}`);
}

async function main(): Promise<void> {
  console.error('[oikos-agent] Starting Oikos Agent...');

  // Config from environment
  const oikosUrl = getEnv('OIKOS_URL', 'http://127.0.0.1:3420');
  const mockLlm = getEnv('MOCK_LLM', 'true') === 'true';
  const llmMode = getEnv('LLM_MODE', 'local') as 'local' | 'cloud';
  const llmBaseUrl = llmMode === 'local'
    ? getEnv('LLM_BASE_URL', 'http://localhost:11434/v1')
    : getEnv('LLM_BASE_URL');
  const llmApiKey = llmMode === 'local'
    ? getEnv('LLM_API_KEY', 'ollama-local')
    : getEnv('LLM_API_KEY');
  const llmModel = getEnv('LLM_MODEL', llmMode === 'local' ? 'qwen3:8b' : 'gpt-4o-mini');
  const creatorAddress = getEnv('CREATOR_ADDRESS', '0xCREATOR1000000000000000000000000000000001');
  const pollIntervalMs = parseInt(getEnv('POLL_INTERVAL_MS', '10000'), 10);

  // Connect to oikos-wallet
  const oikos = new OikosClient({ baseUrl: oikosUrl });

  // Verify connection
  console.error(`[oikos-agent] Connecting to oikos-wallet at ${oikosUrl}...`);
  try {
    const health = await oikos.health();
    console.error(`[oikos-agent] Connected! Wallet: ${health.wallet}, Events: ${health.eventsBuffered}`);
  } catch (err) {
    console.error(`[oikos-agent] FATAL: Cannot connect to oikos-wallet at ${oikosUrl}`);
    console.error(`[oikos-agent] Make sure oikos-wallet is running: OIKOS_MODE=mock node oikos-wallet/dist/src/main.js`);
    process.exit(1);
  }

  // Create LLM client (if not mock)
  let llmClient = null;
  if (!mockLlm) {
    const { default: OpenAI } = await import('openai');
    llmClient = new OpenAI({ baseURL: llmBaseUrl, apiKey: llmApiKey });
    console.error(`[oikos-agent] LLM: ${llmMode} (${llmModel}) at ${llmBaseUrl}`);
  } else {
    console.error('[oikos-agent] LLM: mock (deterministic demo cycle)');
  }

  // Create and start agent brain
  const brain = new AgentBrain(oikos, {
    mockLlm,
    llmModel,
    creatorAddress,
    pollIntervalMs,
  }, llmClient);

  brain.start();

  console.error('[oikos-agent] Agent running.');
  console.error(`[oikos-agent] Polling ${oikosUrl} every ${pollIntervalMs}ms`);
  console.error('[oikos-agent] Press Ctrl+C to stop.');

  // Graceful shutdown
  const shutdown = (): void => {
    console.error('[oikos-agent] Shutting down...');
    brain.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err: unknown) => {
  console.error('[oikos-agent] FATAL:', err);
  process.exit(1);
});
