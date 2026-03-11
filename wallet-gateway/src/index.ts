/**
 * Wallet Gateway — Public API
 *
 * Exports for programmatic use by agent-brain or any other consumer.
 */

// Core IPC
export { WalletIPCClient } from './ipc/client.js';
export type {
  TokenSymbol,
  Chain,
  ProposalSource,
  ProposalCommon,
  PaymentProposal,
  SwapProposal,
  BridgeProposal,
  YieldProposal,
  FeedbackProposal,
  AnyProposal,
  BalanceQuery,
  AddressQuery,
  AuditQuery,
  ExecutionResult,
  BalanceResponse,
  AddressResponse,
  PolicyStatus,
  IdentityRegisterRequest,
  IdentitySetWalletRequest,
  ReputationQuery,
  IdentityResult,
  ReputationResult,
  IPCRequest,
  IPCResponse,
  IPCRequestType,
} from './ipc/types.js';

// Gateway types
export type {
  GatewayPlugin,
  PricingInterface,
  SwarmInterface,
  SwarmAnnounceOpts,
  AssetPrice,
  PortfolioValuation,
} from './types.js';

// Dashboard
export { createDashboard } from './dashboard/server.js';

// MCP
export { mountMCP } from './mcp/server.js';

// Amount conversion
export { toSmallestUnit, toHumanReadable, getDecimals } from './amounts.js';

// x402
export { X402Client } from './x402/client.js';
export type { X402PaymentRequired, X402SignedPayment, X402Service, X402Economics } from './x402/types.js';

// Creators
export { getDemoCreators, getDefaultCreator, loadCreators } from './creators/registry.js';
export type { Creator, CreatorRegistry } from './creators/registry.js';

// Config
export { loadGatewayConfig } from './config/env.js';
export type { GatewayConfig, OikosMode } from './config/env.js';
