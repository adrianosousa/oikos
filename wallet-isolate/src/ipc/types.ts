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

export type TokenSymbol = 'USDT' | 'BTC' | 'XAUT' | 'USAT' | 'ETH';
export type Chain = 'ethereum' | 'polygon' | 'bitcoin' | 'arbitrum';

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

/** Discriminated union of all proposal types */
export type AnyProposal = PaymentProposal | SwapProposal | BridgeProposal | YieldProposal;

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

// ── IPC Request Envelope ──

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
  source?: ProposalSource; // Origin of the proposal (for audit trail)
  payload: PaymentProposal | SwapProposal | BridgeProposal | YieldProposal
    | BalanceQuery | BalanceAllQuery | AddressQuery | PolicyQuery | AuditQuery;
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

export type IPCResponseType =
  | 'execution_result'
  | 'balance'
  | 'balance_all'
  | 'address'
  | 'policy_status'
  | 'audit_entries'
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
    | { message: string };
}

// ── Audit Entry ──

export interface AuditEntry {
  id: string;
  timestamp: string; // ISO 8601
  type: 'proposal_received' | 'policy_enforcement' | 'execution_success' | 'execution_failure' | 'malformed_message';
  proposalType?: string;  // 'payment' | 'swap' | 'bridge' | 'yield'
  source?: ProposalSource;
  proposal?: ProposalCommon;
  violations?: string[];
  txHash?: string;
  error?: string;
}

// ── Validation ──

const VALID_SYMBOLS: ReadonlySet<string> = new Set(['USDT', 'BTC', 'XAUT', 'USAT', 'ETH']);
const VALID_CHAINS: ReadonlySet<string> = new Set(['ethereum', 'polygon', 'bitcoin', 'arbitrum']);
const VALID_REQUEST_TYPES: ReadonlySet<string> = new Set([
  'propose_payment', 'propose_swap', 'propose_bridge', 'propose_yield',
  'query_balance', 'query_balance_all', 'query_address', 'query_policy', 'query_audit'
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
