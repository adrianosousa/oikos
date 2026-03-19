/**
 * IPC Protocol Types
 *
 * Defines the structured message format for communication between
 * the Agent Brain (Node.js) and Wallet Isolate (Bare Runtime).
 *
 * Messages are newline-delimited JSON over stdin/stdout.
 * Every request gets exactly one response, correlated by `id`.
 */

// ── Symbols & Chains ──

export type TokenSymbol = 'USDT' | 'BTC' | 'XAUT' | 'USAT' | 'ETH' | 'RGB';
export type Chain = 'ethereum' | 'polygon' | 'bitcoin' | 'arbitrum' | 'rgb' | 'spark';

/** Source of a proposal — used for audit trail attribution */
export type ProposalSource = 'llm' | 'x402' | 'companion' | 'swarm';

// ── Proposal Types (Brain → Wallet) ──

/** Common fields shared by all proposal types. PolicyEngine evaluates these. */
export interface ProposalCommon {
  amount: string;         // BigInt as string for JSON serialization
  symbol: TokenSymbol;    // Primary asset being spent/moved
  chain: Chain;           // Execution chain
  reason: string;         // Why this proposal (logged in audit)
  confidence: number;     // 0.0–1.0 (LLM confidence)
  strategy: string;       // Strategy name from agent
  timestamp: number;      // Epoch ms
}

/** Send tokens to a recipient address */
export interface PaymentProposal extends ProposalCommon {
  to: string;             // Recipient address
}

/** Swap between token pairs (e.g., USDt → XAUt) */
export interface SwapProposal extends ProposalCommon {
  toSymbol: TokenSymbol;  // Target asset
  // amount = fromAmount (what you're spending)
  // symbol = fromSymbol (the asset being spent)
}

/** Move tokens cross-chain (e.g., Ethereum → Arbitrum) */
export interface BridgeProposal extends ProposalCommon {
  fromChain: Chain;       // Source chain
  toChain: Chain;         // Destination chain
  // chain = fromChain (execution chain)
}

/** Deposit/withdraw from yield protocols */
export interface YieldProposal extends ProposalCommon {
  protocol: string;       // Protocol name (e.g., "aave", "compound")
  action: 'deposit' | 'withdraw';
}

/** Submit on-chain reputation feedback for a peer agent (ERC-8004) */
export interface FeedbackProposal extends ProposalCommon {
  targetAgentId: string;  // uint256 as string — the ERC-8004 agent being rated
  feedbackValue: number;  // int128 — positive = good, negative = bad
  tag1: string;           // Category tag (e.g., "service-quality")
  tag2: string;           // Sub-tag (e.g., "price-feed")
  endpoint: string;       // Service endpoint being rated
  feedbackURI: string;    // Off-chain details URL (can be empty)
  feedbackHash: string;   // bytes32 hex — keccak256 of off-chain details
}

/** Issue a new RGB asset on Bitcoin */
export interface RGBIssueProposal extends ProposalCommon {
  ticker: string;       // e.g., "OTKN"
  name: string;         // e.g., "Oikos Token"
  precision: number;    // decimal places (e.g., 6)
}

/** Transfer an RGB asset via invoice */
export interface RGBTransferProposal extends ProposalCommon {
  invoice: string;      // RGB invoice string from receiver
}

/** RGB asset info returned by query_rgb_assets */
export interface RGBAssetInfo {
  assetId: string;
  ticker: string;
  name: string;
  precision: number;
  balance: string;      // smallest-unit string
}

/** Discriminated union of all proposal types */
export type AnyProposal = PaymentProposal | SwapProposal | BridgeProposal | YieldProposal | FeedbackProposal | RGBIssueProposal | RGBTransferProposal;

// ── Query Types (Brain → Wallet) ──

export interface BalanceQuery {
  chain: Chain;
  symbol: TokenSymbol;
}

export interface BalanceAllQuery {
  // No fields — returns all balances across all chains/assets
}

export interface AddressQuery {
  chain: Chain;
}

export interface PolicyQuery {
  policyId?: string; // If omitted, return all policy statuses
}

export interface AuditQuery {
  limit?: number;
  since?: number; // Epoch ms
}

// ── ERC-8004 Identity Types (Brain → Wallet) ──

/** Register an on-chain ERC-8004 identity (mints ERC-721 NFT). */
export interface IdentityRegisterRequest {
  agentURI: string;  // URL where Agent Card JSON is served
  chain: Chain;      // Must be 'ethereum' (Sepolia) for ERC-8004
}

/** Link the wallet's EOA address to its ERC-8004 identity NFT. */
export interface IdentitySetWalletRequest {
  agentId: string;   // uint256 as string
  deadline: number;  // Unix timestamp (max 5 min tolerance)
  chain: Chain;
}

/** Query on-chain reputation for a given ERC-8004 agent. */
export interface ReputationQuery {
  agentId: string;   // uint256 as string
  chain: Chain;
}

// ── IPC Request Envelope ──

export type IPCRequestType =
  | 'propose_payment'
  | 'propose_swap'
  | 'propose_bridge'
  | 'propose_yield'
  | 'propose_feedback'
  | 'propose_rgb_issue'
  | 'propose_rgb_transfer'
  | 'identity_register'
  | 'identity_set_wallet'
  | 'query_balance'
  | 'query_balance_all'
  | 'query_address'
  | 'query_policy'
  | 'query_audit'
  | 'query_reputation'
  | 'query_rgb_assets'
  | 'query_policy_check';

/** Dry-run policy check result — evaluate without executing or recording */
export interface PolicyCheckResult {
  wouldApprove: boolean;
  violations: string[];
  policyId: string;
}

export interface IPCRequest {
  id: string;
  type: IPCRequestType;
  source?: ProposalSource; // Origin of the proposal (for audit trail)
  payload: PaymentProposal | SwapProposal | BridgeProposal | YieldProposal | FeedbackProposal
    | RGBIssueProposal | RGBTransferProposal
    | IdentityRegisterRequest | IdentitySetWalletRequest
    | BalanceQuery | BalanceAllQuery | AddressQuery | PolicyQuery | AuditQuery | ReputationQuery;
}

// ── Wallet → Brain Responses ──

export interface ExecutionResult {
  status: 'executed' | 'rejected' | 'failed';
  proposalType: string;   // 'payment' | 'swap' | 'bridge' | 'yield'
  proposal: ProposalCommon;
  violations: string[];
  txHash?: string;
  error?: string;
  timestamp: number;
}

export interface BalanceResponse {
  chain: Chain;
  symbol: TokenSymbol;
  balance: string; // BigInt as string
  formatted: string; // Human-readable (e.g., "5.00 USDT")
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
  totalValue: string;    // Aggregated feedback value as string
  valueDecimals: number;
}

export type IPCResponseType =
  | 'execution_result'
  | 'balance'
  | 'balance_all'
  | 'address'
  | 'policy_status'
  | 'audit_entries'
  | 'identity_result'
  | 'reputation_result'
  | 'rgb_assets'
  | 'policy_check'
  | 'error';

export interface IPCResponse {
  id: string;
  type: IPCResponseType;
  payload:
    | ExecutionResult
    | BalanceResponse
    | BalanceResponse[]
    | AddressResponse
    | PolicyStatusResponse
    | AuditEntryResponse
    | IdentityResult
    | ReputationResult
    | RGBAssetInfo[]
    | PolicyCheckResult
    | { message: string };
}

// ── Audit Entry ──

export interface AuditEntry {
  id: string;
  timestamp: string; // ISO 8601
  type: 'proposal_received' | 'policy_enforcement' | 'execution_success' | 'execution_failure' | 'malformed_message' | 'identity_operation';
  proposalType?: string;  // 'payment' | 'swap' | 'bridge' | 'yield' | 'feedback' | 'register' | 'set_wallet'
  source?: ProposalSource;
  proposal?: ProposalCommon;
  violations?: string[];
  txHash?: string;
  error?: string;
}

// ── Validation ──

const VALID_SYMBOLS: ReadonlySet<string> = new Set(['USDT', 'BTC', 'XAUT', 'USAT', 'ETH', 'RGB']);
const VALID_CHAINS: ReadonlySet<string> = new Set(['ethereum', 'polygon', 'bitcoin', 'arbitrum', 'rgb']);
const VALID_REQUEST_TYPES: ReadonlySet<string> = new Set([
  'propose_payment', 'propose_swap', 'propose_bridge', 'propose_yield', 'propose_feedback',
  'propose_rgb_issue', 'propose_rgb_transfer',
  'identity_register', 'identity_set_wallet',
  'query_balance', 'query_balance_all', 'query_address', 'query_policy', 'query_audit', 'query_reputation',
  'query_rgb_assets', 'query_policy_check',
]);
const VALID_YIELD_ACTIONS: ReadonlySet<string> = new Set(['deposit', 'withdraw']);

export function isValidTokenSymbol(value: unknown): value is TokenSymbol {
  return typeof value === 'string' && VALID_SYMBOLS.has(value);
}

export function isValidChain(value: unknown): value is Chain {
  return typeof value === 'string' && VALID_CHAINS.has(value);
}

/** Extract counterparty from any proposal type (for whitelist evaluation) */
export function getCounterparty(proposal: ProposalCommon): string | undefined {
  if ('to' in proposal) return (proposal as PaymentProposal).to;
  if ('protocol' in proposal) return (proposal as YieldProposal).protocol;
  return undefined; // swaps and bridges don't have a specific counterparty
}

export function validateIPCRequest(raw: unknown): IPCRequest | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const obj = raw as Record<string, unknown>;

  if (typeof obj['id'] !== 'string' || obj['id'].length === 0) return null;
  if (typeof obj['type'] !== 'string' || !VALID_REQUEST_TYPES.has(obj['type'])) return null;
  if (typeof obj['payload'] !== 'object' || obj['payload'] === null) return null;

  const type = obj['type'] as IPCRequestType;
  const payload = obj['payload'] as Record<string, unknown>;

  switch (type) {
    case 'propose_payment':
      if (!validatePaymentProposal(payload)) return null;
      break;
    case 'propose_swap':
      if (!validateSwapProposal(payload)) return null;
      break;
    case 'propose_bridge':
      if (!validateBridgeProposal(payload)) return null;
      break;
    case 'propose_yield':
      if (!validateYieldProposal(payload)) return null;
      break;
    case 'propose_feedback':
      if (!validateFeedbackProposal(payload)) return null;
      break;
    case 'propose_rgb_issue':
      if (!validateRGBIssueProposal(payload)) return null;
      break;
    case 'propose_rgb_transfer':
      if (!validateRGBTransferProposal(payload)) return null;
      break;
    case 'query_rgb_assets':
      break; // No payload validation needed
    case 'query_policy_check':
      // Dry-run: validate that the payload is a valid proposal (any type)
      if (!validateProposalCommon(payload)) return null;
      break;
    case 'identity_register':
      if (!validateIdentityRegisterRequest(payload)) return null;
      break;
    case 'identity_set_wallet':
      if (!validateIdentitySetWalletRequest(payload)) return null;
      break;
    case 'query_reputation':
      if (typeof payload['agentId'] !== 'string' || payload['agentId'].length === 0) return null;
      if (!isValidChain(payload['chain'])) return null;
      break;
    case 'query_balance':
      if (!isValidChain(payload['chain']) || !isValidTokenSymbol(payload['symbol'])) return null;
      break;
    case 'query_balance_all':
      break; // No payload validation needed
    case 'query_address':
      if (!isValidChain(payload['chain'])) return null;
      break;
    case 'query_policy':
    case 'query_audit':
      break; // Optional fields only
  }

  // Extract optional source field from envelope
  const source = typeof obj['source'] === 'string' ? obj['source'] : undefined;

  return {
    id: obj['id'] as string,
    type,
    source: source as ProposalSource | undefined,
    payload: payload as IPCRequest['payload'],
  };
}

/** Validate fields common to all proposals (amount, symbol, chain, confidence, etc.) */
function validateProposalCommon(obj: Record<string, unknown>): boolean {
  if (typeof obj['amount'] !== 'string' || obj['amount'].length === 0) return false;
  if (!isValidTokenSymbol(obj['symbol'])) return false;
  if (!isValidChain(obj['chain'])) return false;
  if (typeof obj['reason'] !== 'string') return false;
  if (typeof obj['confidence'] !== 'number' || obj['confidence'] < 0 || obj['confidence'] > 1) return false;
  if (typeof obj['strategy'] !== 'string') return false;
  if (typeof obj['timestamp'] !== 'number') return false;

  // Validate amount is a valid non-negative integer string (BigInt)
  try {
    const val = BigInt(obj['amount']);
    if (val < 0n) return false;
  } catch {
    return false;
  }

  return true;
}

function validatePaymentProposal(obj: Record<string, unknown>): boolean {
  if (typeof obj['to'] !== 'string' || obj['to'].length === 0) return false;
  return validateProposalCommon(obj);
}

function validateSwapProposal(obj: Record<string, unknown>): boolean {
  if (!isValidTokenSymbol(obj['toSymbol'])) return false;
  return validateProposalCommon(obj);
}

function validateBridgeProposal(obj: Record<string, unknown>): boolean {
  if (!isValidChain(obj['fromChain'])) return false;
  if (!isValidChain(obj['toChain'])) return false;
  return validateProposalCommon(obj);
}

function validateYieldProposal(obj: Record<string, unknown>): boolean {
  if (typeof obj['protocol'] !== 'string' || obj['protocol'].length === 0) return false;
  if (typeof obj['action'] !== 'string' || !VALID_YIELD_ACTIONS.has(obj['action'])) return false;
  return validateProposalCommon(obj);
}

function validateFeedbackProposal(obj: Record<string, unknown>): boolean {
  if (typeof obj['targetAgentId'] !== 'string' || obj['targetAgentId'].length === 0) return false;
  if (typeof obj['feedbackValue'] !== 'number') return false;
  if (typeof obj['tag1'] !== 'string') return false;
  if (typeof obj['tag2'] !== 'string') return false;
  if (typeof obj['endpoint'] !== 'string') return false;
  if (typeof obj['feedbackURI'] !== 'string') return false;
  if (typeof obj['feedbackHash'] !== 'string') return false;
  return validateProposalCommon(obj);
}

function validateRGBIssueProposal(obj: Record<string, unknown>): boolean {
  if (typeof obj['ticker'] !== 'string' || obj['ticker'].length === 0) return false;
  if (typeof obj['name'] !== 'string' || obj['name'].length === 0) return false;
  if (typeof obj['precision'] !== 'number' || obj['precision'] < 0 || obj['precision'] > 18) return false;
  return validateProposalCommon(obj);
}

function validateRGBTransferProposal(obj: Record<string, unknown>): boolean {
  if (typeof obj['invoice'] !== 'string' || obj['invoice'].length === 0) return false;
  return validateProposalCommon(obj);
}

function validateIdentityRegisterRequest(obj: Record<string, unknown>): boolean {
  if (typeof obj['agentURI'] !== 'string' || obj['agentURI'].length === 0) return false;
  if (!isValidChain(obj['chain'])) return false;
  return true;
}

function validateIdentitySetWalletRequest(obj: Record<string, unknown>): boolean {
  if (typeof obj['agentId'] !== 'string' || obj['agentId'].length === 0) return false;
  if (typeof obj['deadline'] !== 'number' || obj['deadline'] <= 0) return false;
  if (!isValidChain(obj['chain'])) return false;
  return true;
}
