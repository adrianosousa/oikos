/**
 * Brain Adapter — Agent-Agnostic Chat Bridge.
 *
 * Oikos defines the contract: send a message, get a reply.
 * Any agent framework implements the adapter:
 *   - OpenClaw → channel plugin behind an HTTP endpoint
 *   - Direct Ollama → local LLM with wallet context
 *   - Claude Code → local HTTP server piping to API
 *   - Custom → anything that speaks { message } → { reply }
 *
 * "Swap the brain, keep the wallet."
 *
 * @security Chat messages stay on loopback (127.0.0.1) or Noise-encrypted P2P.
 * No message content ever leaves the machine unencrypted.
 */
import type { OikosServices } from '../types.js';
/** Wallet context injected into brain calls */
export interface WalletContext {
    balances: Array<{
        symbol: string;
        chain: string;
        formatted: string;
    }>;
    policies: Array<{
        rule: string;
        remaining?: string;
        status?: string;
    }>;
    recentAudit: Array<{
        type: string;
        status?: string;
        timestamp?: string;
    }>;
    identity: {
        registered: boolean;
        agentId: string | null;
    };
    swarmPeers: number;
    swarmAnnouncements: Array<{
        id: string;
        title: string;
        category: string;
        agentName: string;
        priceRange?: {
            min: string;
            max: string;
            symbol: string;
        };
    }>;
    swarmRooms: Array<{
        announcementId: string;
        status: string;
        bids: number;
    }>;
    activeStrategies: Array<{
        name: string;
        content: string;
    }>;
    /** Live asset prices from Bitfinex */
    prices: Array<{
        symbol: string;
        priceUsd: number;
        source: string;
    }>;
    /** Pre-calculated portfolio valuation */
    portfolio: {
        totalUsd: number;
        assets: Array<{
            symbol: string;
            humanBalance: number;
            usdValue: number;
            pct: number;
        }>;
    };
}
/** Chat message stored in history */
export interface ChatMessage {
    id: string;
    text: string;
    from: 'human' | 'agent';
    timestamp: number;
}
/** Brain adapter interface — the agent-agnostic contract */
export interface BrainAdapter {
    /** Process a chat message and return the agent's reply */
    chat(message: string, context: WalletContext, history?: ChatMessage[]): Promise<string>;
    /** Human-readable adapter name (for logs/UI) */
    readonly name: string;
}
export declare class OllamaBrainAdapter implements BrainAdapter {
    readonly name = "ollama";
    private baseUrl;
    private model;
    constructor(baseUrl?: string, model?: string);
    chat(message: string, context: WalletContext, history?: ChatMessage[]): Promise<string>;
    /**
     * Trim history to last N user+assistant turn pairs.
     * Skips error messages and very long messages (>300 chars get truncated).
     */
    private _trimHistory;
    /** Build compact wallet state block — minimal tokens, max info density */
    private _buildContext;
}
export declare class HttpBrainAdapter implements BrainAdapter {
    readonly name: string;
    private url;
    private timeoutMs;
    constructor(url: string, name?: string, timeoutMs?: number);
    chat(message: string, context: WalletContext): Promise<string>;
}
export declare class MockBrainAdapter implements BrainAdapter {
    readonly name = "mock";
    chat(message: string, context: WalletContext): Promise<string>;
}
export type BrainType = 'ollama' | 'http' | 'mock';
export interface BrainConfig {
    type: BrainType;
    /** URL for Ollama API or external brain endpoint */
    chatUrl: string;
    /** Model name (for Ollama) */
    model: string;
}
export declare function createBrainAdapter(config: BrainConfig): BrainAdapter;
/** Build wallet context from services (for injection into brain calls) */
export declare function buildWalletContext(services: OikosServices): Promise<WalletContext>;
//# sourceMappingURL=adapter.d.ts.map