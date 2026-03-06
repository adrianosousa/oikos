/**
 * IPC types — shared between Brain and Wallet Isolate.
 *
 * These types mirror the wallet-isolate types. In production,
 * these would be a shared package. For the hackathon, we
 * duplicate the minimal set needed.
 */

// ── Symbols & Chains ──

export type TokenSymbol = 'USDT' | 'BTC' | 'XAUT' | 'USAT' | 'ETH';
export type Chain = 'ethereum' | 'polygon' | 'bitcoin' | 'arbitrum';

/** Source of a proposal — used for audit trail attribution */
export type ProposalSource = 'llm' | 'x402' | 'companion' | 'swarm';

// ── Proposal Types (Brain → Wallet) ──

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

/** Discriminated union of all proposal types */
export type AnyProposal = PaymentProposal | SwapProposal | BridgeProposal | YieldProposal;

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

// ── Response Types (Wallet → Brain) ──

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
  | 'query_balance'
  | 'query_balance_all'
  | 'query_address'
  | 'query_policy'
  | 'query_audit';

export interface IPCRequest {
  id: string;
  type: IPCRequestType;
  source?: ProposalSource;
  payload: PaymentProposal | SwapProposal | BridgeProposal | YieldProposal
    | BalanceQuery | AddressQuery | Record<string, unknown> | AuditQuery;
}

export interface IPCResponse {
  id: string;
  type: 'execution_result' | 'balance' | 'balance_all' | 'address' | 'policy_status' | 'audit_entries' | 'error';
  payload: ExecutionResult | BalanceResponse | BalanceResponse[]
    | AddressResponse | { policies: PolicyStatus[] } | { entries: unknown[] } | { message: string };
}
