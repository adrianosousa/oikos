/**
 * IPC Protocol Types
 *
 * Defines the structured message format for communication between
 * the Agent Brain (Node.js) and Wallet Isolate (Bare Runtime).
 *
 * Messages are newline-delimited JSON over stdin/stdout.
 * Every request gets exactly one response, correlated by `id`.
 */
export type TokenSymbol = 'USDT' | 'BTC' | 'XAUT' | 'USAT' | 'ETH' | 'RGB';
export type Chain = 'ethereum' | 'polygon' | 'bitcoin' | 'arbitrum' | 'rgb' | 'spark';
/** Source of a proposal — used for audit trail attribution */
export type ProposalSource = 'llm' | 'x402' | 'companion' | 'swarm';
/** Common fields shared by all proposal types. PolicyEngine evaluates these. */
export interface ProposalCommon {
    amount: string;
    symbol: TokenSymbol;
    chain: Chain;
    reason: string;
    confidence: number;
    strategy: string;
    timestamp: number;
}
/** Send tokens to a recipient address */
export interface PaymentProposal extends ProposalCommon {
    to: string;
}
/** Swap between token pairs (e.g., USDt → XAUt) */
export interface SwapProposal extends ProposalCommon {
    toSymbol: TokenSymbol;
}
/** Move tokens cross-chain (e.g., Ethereum → Arbitrum) */
export interface BridgeProposal extends ProposalCommon {
    fromChain: Chain;
    toChain: Chain;
}
/** Deposit/withdraw from yield protocols */
export interface YieldProposal extends ProposalCommon {
    protocol: string;
    action: 'deposit' | 'withdraw';
}
/** Submit on-chain reputation feedback for a peer agent (ERC-8004) */
export interface FeedbackProposal extends ProposalCommon {
    targetAgentId: string;
    feedbackValue: number;
    tag1: string;
    tag2: string;
    endpoint: string;
    feedbackURI: string;
    feedbackHash: string;
}
/** Issue a new RGB asset on Bitcoin */
export interface RGBIssueProposal extends ProposalCommon {
    ticker: string;
    name: string;
    precision: number;
}
/** Transfer an RGB asset via invoice */
export interface RGBTransferProposal extends ProposalCommon {
    invoice: string;
}
/** RGB asset info returned by query_rgb_assets */
export interface RGBAssetInfo {
    assetId: string;
    ticker: string;
    name: string;
    precision: number;
    balance: string;
}
/** Discriminated union of all proposal types */
export type AnyProposal = PaymentProposal | SwapProposal | BridgeProposal | YieldProposal | FeedbackProposal | RGBIssueProposal | RGBTransferProposal;
export interface BalanceQuery {
    chain: Chain;
    symbol: TokenSymbol;
}
export interface BalanceAllQuery {
}
export interface AddressQuery {
    chain: Chain;
}
export interface PolicyQuery {
    policyId?: string;
}
export interface AuditQuery {
    limit?: number;
    since?: number;
}
/** Register an on-chain ERC-8004 identity (mints ERC-721 NFT). */
export interface IdentityRegisterRequest {
    agentURI: string;
    chain: Chain;
}
/** Link the wallet's EOA address to its ERC-8004 identity NFT. */
export interface IdentitySetWalletRequest {
    agentId: string;
    deadline: number;
    chain: Chain;
}
/** Query on-chain reputation for a given ERC-8004 agent. */
export interface ReputationQuery {
    agentId: string;
    chain: Chain;
}
export type IPCRequestType = 'propose_payment' | 'propose_swap' | 'propose_bridge' | 'propose_yield' | 'propose_feedback' | 'propose_rgb_issue' | 'propose_rgb_transfer' | 'identity_register' | 'identity_set_wallet' | 'query_balance' | 'query_balance_all' | 'query_address' | 'query_policy' | 'query_audit' | 'query_reputation' | 'query_rgb_assets' | 'query_policy_check';
/** Dry-run policy check result — evaluate without executing or recording */
export interface PolicyCheckResult {
    wouldApprove: boolean;
    violations: string[];
    policyId: string;
}
export interface IPCRequest {
    id: string;
    type: IPCRequestType;
    source?: ProposalSource;
    payload: PaymentProposal | SwapProposal | BridgeProposal | YieldProposal | FeedbackProposal | RGBIssueProposal | RGBTransferProposal | IdentityRegisterRequest | IdentitySetWalletRequest | BalanceQuery | BalanceAllQuery | AddressQuery | PolicyQuery | AuditQuery | ReputationQuery;
}
export interface ExecutionResult {
    status: 'executed' | 'rejected' | 'failed';
    proposalType: string;
    proposal: ProposalCommon;
    violations: string[];
    txHash?: string;
    error?: string;
    timestamp: number;
}
export interface BalanceResponse {
    chain: Chain;
    symbol: TokenSymbol;
    balance: string;
    formatted: string;
}
export interface AddressResponse {
    chain: Chain;
    address: string;
}
export interface PolicyStatusResponse {
    policies: Array<{
        id: string;
        name: string;
        state: Record<string, unknown>;
    }>;
}
export interface AuditEntryResponse {
    entries: AuditEntry[];
}
/** Result of an ERC-8004 identity lifecycle operation. */
export interface IdentityResult {
    status: 'registered' | 'wallet_set' | 'failed';
    agentId?: string;
    txHash?: string;
    error?: string;
}
/** On-chain reputation query result from ERC-8004 ReputationRegistry. */
export interface ReputationResult {
    agentId: string;
    feedbackCount: number;
    totalValue: string;
    valueDecimals: number;
}
export type IPCResponseType = 'execution_result' | 'balance' | 'balance_all' | 'address' | 'policy_status' | 'audit_entries' | 'identity_result' | 'reputation_result' | 'rgb_assets' | 'policy_check' | 'error';
export interface IPCResponse {
    id: string;
    type: IPCResponseType;
    payload: ExecutionResult | BalanceResponse | BalanceResponse[] | AddressResponse | PolicyStatusResponse | AuditEntryResponse | IdentityResult | ReputationResult | RGBAssetInfo[] | PolicyCheckResult | {
        message: string;
    };
}
export interface AuditEntry {
    id: string;
    timestamp: string;
    type: 'proposal_received' | 'policy_enforcement' | 'execution_success' | 'execution_failure' | 'malformed_message' | 'identity_operation';
    proposalType?: string;
    source?: ProposalSource;
    proposal?: ProposalCommon;
    violations?: string[];
    txHash?: string;
    error?: string;
}
export declare function isValidTokenSymbol(value: unknown): value is TokenSymbol;
export declare function isValidChain(value: unknown): value is Chain;
/** Extract counterparty from any proposal type (for whitelist evaluation) */
export declare function getCounterparty(proposal: ProposalCommon): string | undefined;
export declare function validateIPCRequest(raw: unknown): IPCRequest | null;
//# sourceMappingURL=types.d.ts.map