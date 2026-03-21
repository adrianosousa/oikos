/**
 * Companion Coordinator — P2P Human-Agent Channel.
 *
 * Manages the Hyperswarm connection between the Oikos app and
 * the owner's companion app. Uses protomux infrastructure.
 *
 * Auth: Owner Ed25519 pubkey verified via Noise handshake.
 * Only the owner can connect as a companion.
 *
 * Design constraint: Companion NEVER talks to Wallet Isolate directly.
 * Instructions from the companion are queued for any connected agent to read.
 */
import type { WalletIPCClient } from '../ipc/client.js';
import type { BalanceResponse, PolicyStatus } from '../ipc/types.js';
import type { SwarmCoordinatorInterface } from '../swarm/types.js';
import type { AgentToCompanionMessage } from './types.js';
/** State provider — decoupled from any specific brain implementation */
export interface CompanionStateProvider {
    getBalances(): Promise<BalanceResponse[]>;
    getPolicies(): Promise<PolicyStatus[]>;
    getPrices?(): Promise<Array<{
        symbol: string;
        priceUsd: number;
        source: string;
        updatedAt: number;
    }>>;
}
export interface CompanionConfig {
    /** Ed25519 public key of the authorized owner (hex) */
    ownerPubkey: string;
    /** Agent's keypair for Hyperswarm identity */
    keypairPath: string;
    /** Topic seed for companion discovery */
    topicSeed: string;
    /** How often to push state updates (ms) */
    updateIntervalMs: number;
    /** Injected DHT for testnet */
    dht?: unknown;
    /** Relay peer pubkey for NAT traversal (hex) */
    relayPubkey?: string;
}
export declare class CompanionCoordinator {
    private stateProvider;
    private swarm;
    private config;
    private hyperswarm;
    private isSharedSwarm;
    private companionChannel;
    private ownerPubkeyBuf;
    private companionTopic;
    private updateInterval;
    private connected;
    private started;
    /** Instruction handler — set by main.ts to queue instructions */
    private onInstructionHandler;
    /** Chat handler — set by main.ts to forward to brain and get reply */
    private onChatHandler;
    constructor(_wallet: WalletIPCClient, stateProvider: CompanionStateProvider, config: CompanionConfig, swarm?: SwarmCoordinatorInterface);
    /** Register instruction handler */
    onInstruction(handler: (text: string) => void): void;
    /** Register chat handler — called when instruction arrives, forwards to brain, returns reply */
    onChat(handler: (text: string) => Promise<{
        reply: string;
        brainName: string;
    } | null>): void;
    /** Start listening for companion connections */
    start(): Promise<void>;
    /** Send a message to the connected companion */
    send(msg: AgentToCompanionMessage): boolean;
    /** Notify companion of an execution result */
    notifyExecution(result: import('../ipc/types.js').ExecutionResult): void;
    /** Check if companion is connected */
    isConnected(): boolean;
    /** Graceful shutdown */
    stop(): Promise<void>;
    private _onConnection;
    private _handleMessage;
    private _pushStateUpdate;
}
//# sourceMappingURL=coordinator.d.ts.map