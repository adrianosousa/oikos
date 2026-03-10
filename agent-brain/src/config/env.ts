/**
 * Environment configuration for Agent Brain.
 *
 * Loads and validates all configuration from environment variables.
 * The Brain process NEVER handles seed phrases or private keys.
 */

export interface BrainConfig {
  /** LLM mode: 'local' (Ollama) or 'cloud' (remote API) */
  llmMode: 'local' | 'cloud';

  /** LLM API base URL */
  llmBaseUrl: string;

  /** LLM API key (empty for local Ollama) */
  llmApiKey: string;

  /** LLM model name */
  llmModel: string;

  /** Use mock LLM responses instead of real LLM */
  mockLlm: boolean;

  /** Use mock events instead of real event source */
  mockEvents: boolean;

  /** Dashboard port (localhost only) */
  dashboardPort: number;

  /** Path to the wallet-isolate entry script (for spawning) */
  walletIsolatePath: string;

  /** Whether wallet-isolate should use mock wallet */
  mockWallet: boolean;

  /** Path to policy config file for wallet-isolate */
  policyFile: string;

  /** Path to audit log file */
  auditLogPath: string;

  /** Event source URL (for real events) */
  eventSourceUrl: string;

  /** Event poll interval in ms */
  eventPollIntervalMs: number;

  // ── Swarm Configuration ──

  /** Enable swarm networking */
  swarmEnabled: boolean;

  /** Swarm ID (all agents in the same swarm use the same ID) */
  swarmId: string;

  /** Human-readable agent name for the swarm */
  agentName: string;

  /** Comma-separated agent capabilities */
  agentCapabilities: string;

  /** Use mock swarm (simulated peers) instead of real Hyperswarm */
  mockSwarm: boolean;

  /** Path to persist the Ed25519 keypair */
  keypairPath: string;

  // ── WDK Indexer API ──

  /** WDK Indexer API key */
  indexerApiKey: string;

  /** WDK Indexer base URL */
  indexerBaseUrl: string;

  // ── ERC-8004 Identity ──

  /** Enable ERC-8004 on-chain identity registration */
  erc8004Enabled: boolean;

  // ── Companion App ──

  /** Enable companion P2P channel */
  companionEnabled: boolean;

  /** Ed25519 public key of the authorized owner (hex, 64 chars) */
  companionOwnerPubkey: string;

  /** Topic seed for companion discovery */
  companionTopicSeed: string;

  /** State push interval to companion (ms) */
  companionUpdateIntervalMs: number;
}

function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

export function loadConfig(): BrainConfig {
  const llmMode = getEnv('LLM_MODE', 'local') as 'local' | 'cloud';

  return {
    llmMode,
    llmBaseUrl: llmMode === 'local'
      ? getEnv('LLM_BASE_URL', 'http://localhost:11434/v1')
      : getEnv('LLM_BASE_URL'),
    llmApiKey: llmMode === 'local'
      ? getEnv('LLM_API_KEY', 'ollama-local')
      : getEnv('LLM_API_KEY'),
    llmModel: getEnv('LLM_MODEL', llmMode === 'local' ? 'qwen3:8b' : 'gpt-4o-mini'),
    mockLlm: getEnv('MOCK_LLM', 'false') === 'true',
    mockEvents: getEnv('MOCK_EVENTS', 'true') === 'true',
    dashboardPort: parseInt(getEnv('DASHBOARD_PORT', '3420'), 10),
    walletIsolatePath: getEnv('WALLET_ISOLATE_PATH', '../wallet-isolate/dist/src/main.js'),
    mockWallet: getEnv('MOCK_WALLET', 'true') === 'true',
    policyFile: getEnv('POLICY_FILE', ''),
    auditLogPath: getEnv('AUDIT_LOG_PATH', 'audit.jsonl'),
    eventSourceUrl: getEnv('EVENT_SOURCE_URL', ''),
    eventPollIntervalMs: parseInt(getEnv('EVENT_POLL_INTERVAL_MS', '5000'), 10),

    // Swarm
    swarmEnabled: getEnv('SWARM_ENABLED', 'false') === 'true',
    swarmId: getEnv('SWARM_ID', 'oikos-hackathon-v1'),
    agentName: getEnv('AGENT_NAME', 'Oikos-Agent-1'),
    agentCapabilities: getEnv('AGENT_CAPABILITIES', 'portfolio-analyst,price-feed'),
    mockSwarm: getEnv('MOCK_SWARM', 'true') === 'true',
    keypairPath: getEnv('KEYPAIR_PATH', '.oikos-keypair.json'),

    // WDK Indexer
    indexerApiKey: getEnv('INDEXER_API_KEY', ''),
    indexerBaseUrl: getEnv('INDEXER_BASE_URL', 'https://wdk-api.tether.io/api/v1'),

    // ERC-8004
    erc8004Enabled: getEnv('ERC8004_ENABLED', 'false') === 'true',

    // Companion
    companionEnabled: getEnv('COMPANION_ENABLED', 'false') === 'true',
    companionOwnerPubkey: getEnv('COMPANION_OWNER_PUBKEY', ''),
    companionTopicSeed: getEnv('COMPANION_TOPIC_SEED', 'oikos-companion-default'),
    companionUpdateIntervalMs: parseInt(getEnv('COMPANION_UPDATE_INTERVAL_MS', '5000'), 10),
  };
}
