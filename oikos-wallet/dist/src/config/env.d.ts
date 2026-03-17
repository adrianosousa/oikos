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
export type OikosMode = 'mock' | 'testnet' | 'mainnet';
export interface OikosConfig {
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
    /** Use mock events instead of real event source */
    mockEvents: boolean;
    /** Event source URL (for real events) */
    eventSourceUrl: string;
    /** Event poll interval in ms */
    eventPollIntervalMs: number;
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
    /** WDK Indexer API key */
    indexerApiKey: string;
    /** WDK Indexer base URL */
    indexerBaseUrl: string;
    /** Enable ERC-8004 on-chain identity registration */
    erc8004Enabled: boolean;
    /** Enable companion P2P channel */
    companionEnabled: boolean;
    /** Ed25519 public key of the authorized owner (hex, 64 chars) */
    companionOwnerPubkey: string;
    /** Topic seed for companion discovery */
    companionTopicSeed: string;
    /** State push interval to companion (ms) */
    companionUpdateIntervalMs: number;
    /** Enable RGB transport bridge */
    rgbEnabled: boolean;
    /** Port for the RGB transport bridge HTTP server */
    rgbTransportPort: number;
    /** Bearer token for remote MCP auth. If empty, remote MCP is authless. */
    mcpAuthToken: string;
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
export declare function loadOikosConfig(): OikosConfig;
/** @deprecated Use loadOikosConfig() */
export declare const loadGatewayConfig: typeof loadOikosConfig;
//# sourceMappingURL=env.d.ts.map