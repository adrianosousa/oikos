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
    queryReputation(agentId: string, chain?: "ethereum", opts?: {
        tag1?: string;
        tag2?: string;
        clientAddresses?: string[];
    }): Promise<ReputationResult>;
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
    /** Query Spark address — routes through standard query_address with chain='spark'. */
    querySparkAddress(type?: string): Promise<{
        chain: string;
        address: string;
        type: string;
    }>;
    /** Propose sending sats via Spark. Routes through standard propose_payment with chain='spark'. */
    proposeSparkSend(proposal: Record<string, unknown>, source?: ProposalSource): Promise<ExecutionResult>;
    /** Create a Lightning invoice for receiving — uses dedicated IPC message. */
    querySparkCreateInvoice(amountSats?: number, memo?: string): Promise<{
        invoice: string;
        id: string;
        amountSats: number;
        memo?: string;
    }>;
    /** Pay a Lightning invoice via Spark — uses dedicated IPC message. */
    proposeSparkPayInvoice(proposal: Record<string, unknown>, _source?: ProposalSource): Promise<ExecutionResult>;
    /** Query Spark transfer history. */
    querySparkTransfers(direction?: 'incoming' | 'outgoing' | 'all', limit?: number): Promise<unknown[]>;
    /**
     * Sign EIP-712 typed data for x402 (transferWithAuthorization).
     * Policy-enforced: the Wallet Isolate evaluates the payment amount before signing.
     */
    x402Sign(request: {
        domain: Record<string, unknown>;
        types: Record<string, Array<{
            name: string;
            type: string;
        }>>;
        message: Record<string, unknown>;
        policyAmount: string;
        policyRecipient: string;
        policyChain: string;
        policySymbol: string;
    }): Promise<{
        signature: string;
        approved: boolean;
        error?: string;
    }>;
    /** Get the EVM wallet address for x402 client identity */
    x402GetAddress(): Promise<string>;
    private send;
    private processBuffer;
}
//# sourceMappingURL=client.d.ts.map