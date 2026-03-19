/**
 * IPC types — shared contract between Gateway and Wallet Isolate.
 *
 * These types define the structured messages exchanged over
 * stdin/stdout JSON-lines between the Gateway (or Brain) and
 * the Wallet Isolate process.
 */

// ── Symbols & Chains ──

export type TokenSymbol = 'USDT' | 'BTC' | 'XAUT' | 'USAT' | 'ETH' | 'RGB';
export type Chain = 'ethereum' | 'polygon' | 'bitcoin' | 'arbitrum' | 'rgb' | 'spark';

/** Source of a proposal — used for audit trail attribution */
export type ProposalSource = 'llm' | 'x402' | 'companion' | 'swarm' | 'mcp';

// ── Proposal Types (Gateway → Wallet) ──

/** Common fields shared by all proposal types. */
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

// ── Query Types ──

export interface BalanceQuery {
  chain: Chain;
  symbol: TokenSymbol;
}

export interface AddressQuery {
  chain: Chain;
}

export interface AuditQuery {
  limit?: number;
  since?: string;
}

// ── ERC-8004 Identity & Reputation ──

export interface IdentityRegisterRequest {
  agentURI: string;
  chain: Chain;
}

export interface IdentitySetWalletRequest {
  agentId: string;
  deadline: number;
  chain: Chain;
}

export interface ReputationQuery {
  agentId: string;
  chain: Chain;
}

export interface IdentityResult {
  status: 'registered' | 'wallet_set' | 'failed';
  agentId?: string;
  txHash?: string;
  error?: string;
}

export interface ReputationResult {
  agentId: string;
  feedbackCount: number;
  totalValue: string;
  valueDecimals: number;
}

// ── Response Types (Wallet → Gateway) ──

/** Execution result from the wallet */
export interface ExecutionResult {
  status: 'executed' | 'rejected' | 'failed';
  proposalType: string;
  proposal: ProposalCommon;
  violations: string[];
  txHash?: string;
  error?: string;
  timestamp: number;
}

/** Balance response from the wallet */
export interface BalanceResponse {
  chain: Chain;
  symbol: TokenSymbol;
  balance: string;
  formatted: string;
}

/** Address response from the wallet */
export interface AddressResponse {
  chain: Chain;
  address: string;
}

/** Policy status from the wallet */
export interface PolicyStatus {
  id: string;
  name: string;
  state: {
    sessionTotals: Record<string, string>;
    dayTotals: Record<string, string>;
    lastTransactionTime: number;
    currentDay: string;
  };
}

// ── IPC Envelopes ──

export type IPCRequestType =
  | 'propose_payment'
  | 'propose_swap'
  | 'propose_bridge'
  | 'propose_yield'
  | 'propose_feedback'
  | 'propose_rgb_issue'
  | 'propose_rgb_transfer'
  | 'query_balance'
  | 'query_balance_all'
  | 'query_address'
  | 'query_policy'
  | 'query_audit'
  | 'identity_register'
  | 'identity_set_wallet'
  | 'query_reputation'
  | 'query_rgb_assets'
  | 'query_policy_check';

export interface IPCRequest {
  id: string;
  type: IPCRequestType;
  source?: ProposalSource;
  payload: PaymentProposal | SwapProposal | BridgeProposal | YieldProposal | FeedbackProposal
    | RGBIssueProposal | RGBTransferProposal
    | BalanceQuery | AddressQuery | Record<string, unknown> | AuditQuery
    | IdentityRegisterRequest | IdentitySetWalletRequest | ReputationQuery;
}

/** Dry-run policy check result — evaluate without executing or recording */
export interface PolicyCheckResult {
  wouldApprove: boolean;
  violations: string[];
  policyId: string;
}

export interface IPCResponse {
  id: string;
  type: 'execution_result' | 'balance' | 'balance_all' | 'address' | 'policy_status' | 'audit_entries' | 'identity_result' | 'reputation_result' | 'rgb_assets' | 'policy_check' | 'error';
  payload: ExecutionResult | BalanceResponse | BalanceResponse[]
    | AddressResponse | { policies: PolicyStatus[] } | { entries: unknown[] } | { message: string }
    | IdentityResult | ReputationResult | RGBAssetInfo[] | PolicyCheckResult;
}
