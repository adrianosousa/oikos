/**
 * IPC Client — Gateway's interface to the Wallet Isolate.
 *
 * Spawns the wallet-isolate as a child process (via Bare Runtime)
 * and communicates over stdin/stdout JSON-lines.
 *
 * @security The Gateway NEVER sees seed phrases. It sends structured
 * requests and receives structured responses. Period.
 */
import type { PaymentProposal, SwapProposal, BridgeProposal, YieldProposal, FeedbackProposal, RGBIssueProposal, RGBTransferProposal, RGBAssetInfo, ProposalCommon, ProposalSource, ExecutionResult, BalanceResponse, AddressResponse, PolicyStatus, PolicyCheckResult, IdentityResult, ReputationResult } from './types.js';
/**
 * Spawns and manages IPC communication with the wallet-isolate process.
 */
export declare class WalletIPCClient {
    private child;
    private pending;
    private buffer;
    private running;
    /** Timeout for IPC requests in ms */
    private readonly requestTimeoutMs;
    /** Event listeners for connection state */
    private onDisconnectHandler;
    /**
     * Spawn the wallet-isolate process.
     *
     * @param entryPath Path to the wallet-isolate dist/src/main.js
     * @param runtime 'bare' for Bare Runtime, 'node' for Node.js (testing)
     * @param env Environment variables to pass to the child process
     */
    start(entryPath: string, runtime: 'bare' | 'node', env: Record<string, string>): void;
    /** Register a disconnect handler */
    onDisconnect(handler: (error?: string) => void): void;
    /** Check if the wallet process is running */
    isRunning(): boolean;
    /** Stop the wallet process */
    stop(): void;
    /** Propose a payment to the wallet for policy evaluation and execution */
    proposePayment(proposal: PaymentProposal, source?: ProposalSource): Promise<ExecutionResult>;
    /** Propose a token swap (e.g., USDT → XAUT) */
    proposeSwap(proposal: SwapProposal, source?: ProposalSource): Promise<ExecutionResult>;
    /** Propose a cross-chain bridge (e.g., Ethereum → Arbitrum) */
    proposeBridge(proposal: BridgeProposal, source?: ProposalSource): Promise<ExecutionResult>;
    /** Propose a yield deposit or withdrawal */
    proposeYield(proposal: YieldProposal, source?: ProposalSource): Promise<ExecutionResult>;
    /**
     * Universal entry point for external proposal sources.
     * Routes to the appropriate propose method with source attribution.
     * Used by x402 client, companion channel, and swarm negotiation.
     */
    proposalFromExternal(source: ProposalSource, type: 'payment' | 'swap' | 'bridge' | 'yield' | 'feedback', proposal: ProposalCommon): Promise<ExecutionResult>;
    /** Query balance for a specific chain and token */
    queryBalance(chain: string, symbol: string): Promise<BalanceResponse>;
    /** Query all balances across all chains and assets */
    queryBalanceAll(): Promise<BalanceResponse[]>;
    /** Query wallet address for a specific chain */
    queryAddress(chain: string): Promise<AddressResponse>;
    /** Query current policy status */
    queryPolicy(): Promise<PolicyStatus[]>;
    /** Query audit log entries */
    queryAudit(limit?: number, since?: string): Promise<unknown[]>;
    /** Register an on-chain ERC-8004 identity (mints ERC-721 NFT). */
    registerIdentity(agentURI: string, chain?: "ethereum"): Promise<IdentityResult>;
    /** Set the agent's wallet address on the IdentityRegistry (EIP-712 signed). */
    setAgentWallet(agentId: string, deadline: number, chain?: "ethereum"): Promise<IdentityResult>;
    /** Submit on-chain reputation feedback for a peer agent. */
    proposeFeedback(proposal: FeedbackProposal, source?: ProposalSource): Promise<ExecutionResult>;
    /** Query on-chain reputation from ERC-8004 ReputationRegistry. */
    queryReputation(agentId: string, chain?: "ethereum"): Promise<ReputationResult>;
    /** Simulate a proposal against the policy engine without executing or burning cooldown. */
    simulateProposal(proposal: ProposalCommon): Promise<PolicyCheckResult>;
    /** Propose issuing a new RGB asset. */
    proposeRGBIssue(proposal: RGBIssueProposal, source?: ProposalSource): Promise<ExecutionResult>;
    /** Propose transferring an RGB asset via invoice. */
    proposeRGBTransfer(proposal: RGBTransferProposal, source?: ProposalSource): Promise<ExecutionResult>;
    /** Query all RGB assets with balances. */
    queryRGBAssets(): Promise<RGBAssetInfo[]>;
    /** Query Spark wallet balance in satoshis. */
    querySparkBalance(): Promise<{
        chain: string;
        symbol: string;
        balanceSats: number;
        formatted: string;
    }>;
    /** Query Spark deposit address. */
    querySparkAddress(type?: string): Promise<{
        chain: string;
        address: string;
        type: string;
    }>;
    /** Propose sending sats via Spark. Goes through PolicyEngine. */
    proposeSparkSend(proposal: Record<string, unknown>, source?: ProposalSource): Promise<ExecutionResult>;
    /** Create a Lightning invoice for receiving. */
    querySparkCreateInvoice(amountSats?: number, memo?: string): Promise<{
        invoice: string;
        id: string;
        amountSats: number;
        memo?: string;
    }>;
    /** Pay a Lightning invoice via Spark. Goes through PolicyEngine. */
    proposeSparkPayInvoice(proposal: Record<string, unknown>, source?: ProposalSource): Promise<ExecutionResult>;
    private send;
    private processBuffer;
}
//# sourceMappingURL=client.d.ts.map