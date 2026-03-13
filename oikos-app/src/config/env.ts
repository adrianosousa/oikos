/**
 * Oikos Configuration — unified environment variable loader.
 *
 * Merges wallet gateway config with infrastructure config (swarm, events,
 * companion, pricing, RGB). LLM config is NOT here — that's the connected
 * agent's concern. Oikos is agent-agnostic.
 *
 * Supports OIKOS_MODE for simplified configuration:
 *   mock    → all mocks enabled (zero external deps)
 *   testnet → real wallet + real services
 *   mainnet → production (future)
 *
 * Individual overrides still work:
 *   OIKOS_MODE=testnet MOCK_EVENTS=false → real wallet, real events
 */

export type OikosMode = 'mock' | 'testnet' | 'mainnet';

export interface OikosConfig {
  // ── Core ──

  /** High-level mode: mock, testnet, mainnet */
  mode: OikosMode;

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

  /** Wallet runtime: 'bare' or 'node' */
  walletRuntime: 'bare' | 'node';

  // ── Events ──

  /** Use mock events instead of real event source */
  mockEvents: boolean;

  /** Event source URL (for real events) */
  eventSourceUrl: string;

  /** Event poll interval in ms */
  eventPollIntervalMs: number;

  // ── Swarm ──

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

  /**
   * Noise public key (hex) of a relay peer for holepunch fallback.
   * When set, Hyperswarm relays through this peer if direct holepunching fails.
   * Required for: Docker containers, restrictive NATs, double-randomized NATs.
   * Without this, failed holepunches silently die with no fallback.
   */
  swarmRelayPubkey: string;

  /**
   * Comma-separated list of peer pubkeys (hex) to explicitly connect to.
   * Uses Hyperswarm's joinPeer() — bypasses topic discovery, connects by Noise key.
   * Auto-reconnects on failure. Useful for bootstrap peers or known partners.
   */
  swarmBootstrapPeers: string;

  // ── WDK Indexer ──

  /** WDK Indexer API key */
  indexerApiKey: string;

  /** WDK Indexer base URL */
  indexerBaseUrl: string;

  // ── ERC-8004 Identity ──

  /** Enable ERC-8004 on-chain identity registration */
  erc8004Enabled: boolean;

  // ── Companion ──

  /** Enable companion P2P channel */
  companionEnabled: boolean;

  /** Ed25519 public key of the authorized owner (hex, 64 chars) */
  companionOwnerPubkey: string;

  /** Topic seed for companion discovery */
  companionTopicSeed: string;

  /** State push interval to companion (ms) */
  companionUpdateIntervalMs: number;

  // ── RGB ──

  /** Enable RGB transport bridge */
  rgbEnabled: boolean;

  /** Port for the RGB transport bridge HTTP server */
  rgbTransportPort: number;

  // ── Brain (Chat Bridge) ──

  /** Brain adapter type: 'ollama' (default), 'http' (OpenClaw/custom), 'mock' */
  brainType: 'ollama' | 'http' | 'mock';

  /** URL for the brain chat endpoint.
   *  - ollama: http://127.0.0.1:11434 (default)
   *  - http: URL of external brain (OpenClaw, custom)
   */
  brainChatUrl: string;

  /** LLM model name (for Ollama adapter) */
  brainModel: string;
}

function getEnv(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

/** Resolve a mock flag considering OIKOS_MODE + individual override */
function resolveMock(envKey: string, mode: OikosMode): boolean {
  const explicit = process.env[envKey];
  if (explicit !== undefined && explicit !== '') return explicit === 'true';
  return mode === 'mock';
}

export function loadOikosConfig(): OikosConfig {
  const mode = getEnv('OIKOS_MODE', 'mock') as OikosMode;

  return {
    // Core
    mode,
    dashboardPort: parseInt(getEnv('DASHBOARD_PORT', '3420'), 10),
    walletIsolatePath: getEnv('WALLET_ISOLATE_PATH', '../wallet-isolate/dist/src/main.js'),
    mockWallet: resolveMock('MOCK_WALLET', mode),
    policyFile: getEnv('POLICY_FILE', ''),
    auditLogPath: getEnv('AUDIT_LOG_PATH', 'audit.jsonl'),
    walletRuntime: getEnv('WALLET_RUNTIME', 'node') as 'bare' | 'node',

    // Events
    mockEvents: resolveMock('MOCK_EVENTS', mode),
    eventSourceUrl: getEnv('EVENT_SOURCE_URL', ''),
    eventPollIntervalMs: parseInt(getEnv('EVENT_POLL_INTERVAL_MS', '5000'), 10),

    // Swarm
    swarmEnabled: getEnv('SWARM_ENABLED', mode === 'mock' ? 'true' : 'false') === 'true',
    swarmId: getEnv('SWARM_ID', 'oikos-hackathon-v1'),
    agentName: getEnv('AGENT_NAME', 'Oikos-Agent-1'),
    agentCapabilities: getEnv('AGENT_CAPABILITIES', 'portfolio-analyst,price-feed'),
    mockSwarm: resolveMock('MOCK_SWARM', mode),
    keypairPath: getEnv('KEYPAIR_PATH', '.oikos-keypair.json'),
    swarmRelayPubkey: getEnv('SWARM_RELAY_PUBKEY', ''),
    swarmBootstrapPeers: getEnv('SWARM_BOOTSTRAP_PEERS', ''),

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

    // RGB
    rgbEnabled: getEnv('RGB_ENABLED', 'false') === 'true',
    rgbTransportPort: parseInt(getEnv('RGB_TRANSPORT_PORT', '13100'), 10),

    // Brain (Chat Bridge)
    brainType: getEnv('BRAIN_TYPE', mode === 'mock' ? 'mock' : 'ollama') as 'ollama' | 'http' | 'mock',
    brainChatUrl: getEnv('BRAIN_CHAT_URL', ''),
    brainModel: getEnv('BRAIN_MODEL', 'qwen3:8b'),
  };
}

/** @deprecated Use loadOikosConfig() */
export const loadGatewayConfig = loadOikosConfig;
