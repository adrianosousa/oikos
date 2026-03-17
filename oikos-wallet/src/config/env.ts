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
 *
 * .env loading: Searches for .env in CWD and repo root (parent of oikos-wallet/).
 * No dotenv dependency — lightweight inline loader. Existing env vars take precedence.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Lightweight .env loader (no dotenv dependency) ──

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Load .env file into process.env (existing vars take precedence) */
function loadDotEnv(filePath: string): void {
  if (!existsSync(filePath)) return;
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      // Existing env vars take precedence (don't override)
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = value;
      }
    }
  } catch {
    // Silently ignore .env read errors
  }
}

// Search for .env: CWD first, then repo root (parent of oikos-wallet/)
// At runtime __dirname = dist/src/config/ → 4 levels up to repo root
const repoRoot = join(__dirname, '..', '..', '..', '..');
loadDotEnv(join(process.cwd(), '.env'));
loadDotEnv(join(repoRoot, '.env'));

export type OikosMode = 'mock' | 'testnet' | 'mainnet';

export interface OikosConfig {
  // ── Core ──

  /** High-level mode: mock, testnet, mainnet */
  mode: OikosMode;

  /** Dashboard port */
  dashboardPort: number;

  /** Dashboard host — '127.0.0.1' (default) or '0.0.0.0' (public board access) */
  dashboardHost: string;

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

  // ── Remote MCP ──

  /** Bearer token for remote MCP auth. If empty, remote MCP is authless. */
  mcpAuthToken: string;

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
    dashboardHost: getEnv('DASHBOARD_HOST', '127.0.0.1'),
    // __dirname = oikos-wallet/dist/src/config → go up 4 levels to repo root
    walletIsolatePath: getEnv('WALLET_ISOLATE_PATH', join(__dirname, '..', '..', '..', '..', 'wallet-isolate', 'dist', 'src', 'main.js')),
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
    // Oikos ecosystem relay node (Hostinger VPS, always-on via systemd)
    // Agents can override with their own relay via SWARM_RELAY_PUBKEY env var
    swarmRelayPubkey: getEnv('SWARM_RELAY_PUBKEY', 'e7ab6adb1a18e7d22649691dc65f5789f6fdd25422b0770ab068ee9bbe0a3003'),
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

    // Remote MCP
    mcpAuthToken: getEnv('MCP_AUTH_TOKEN', ''),

    // Brain (Chat Bridge)
    brainType: getEnv('BRAIN_TYPE', mode === 'mock' ? 'mock' : 'ollama') as 'ollama' | 'http' | 'mock',
    brainChatUrl: getEnv('BRAIN_CHAT_URL', ''),
    brainModel: getEnv('BRAIN_MODEL', 'qwen3:8b'),
  };
}

/** @deprecated Use loadOikosConfig() */
export const loadGatewayConfig = loadOikosConfig;
