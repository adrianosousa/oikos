/**
 * Gateway Configuration — environment variable loader.
 *
 * Loads wallet + dashboard + x402 configuration.
 * Brain-specific config (LLM, swarm, events) lives in agent-brain.
 *
 * Supports OIKOS_MODE for simplified configuration:
 *   mock    → all mocks enabled (zero external deps)
 *   testnet → real wallet + real swarm + real events
 *   mainnet → production (future)
 *
 * Individual overrides still work:
 *   OIKOS_MODE=testnet MOCK_LLM=true → real wallet, mock LLM
 */

export type OikosMode = 'mock' | 'testnet' | 'mainnet';

export interface GatewayConfig {
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
  // Default based on mode
  return mode === 'mock';
}

export function loadGatewayConfig(): GatewayConfig {
  const mode = (getEnv('OIKOS_MODE', 'mock') as OikosMode);

  return {
    mode,
    dashboardPort: parseInt(getEnv('DASHBOARD_PORT', '3420'), 10),
    walletIsolatePath: getEnv('WALLET_ISOLATE_PATH', '../wallet-isolate/dist/src/main.js'),
    mockWallet: resolveMock('MOCK_WALLET', mode),
    policyFile: getEnv('POLICY_FILE', ''),
    auditLogPath: getEnv('AUDIT_LOG_PATH', 'audit.jsonl'),
    walletRuntime: getEnv('WALLET_RUNTIME', 'node') as 'bare' | 'node',
  };
}
