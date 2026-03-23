/**
 * Oikos App — Public API
 *
 * Agent-agnostic wallet infrastructure. Any agent connects via MCP/REST/CLI.
 * This module exports everything an external agent or library consumer needs.
 */
export { WalletIPCClient } from './ipc/client.js';
export type { TokenSymbol, Chain, ProposalSource, ProposalCommon, PaymentProposal, SwapProposal, BridgeProposal, YieldProposal, FeedbackProposal, AnyProposal, BalanceQuery, AddressQuery, AuditQuery, ExecutionResult, BalanceResponse, AddressResponse, PolicyStatus, IdentityRegisterRequest, IdentitySetWalletRequest, ReputationQuery, IdentityResult, ReputationResult, IPCRequest, IPCResponse, IPCRequestType, } from './ipc/types.js';
export type { OikosServices, SwarmInterface, SwarmAnnounceOpts, IdentityState, CompanionInstruction, } from './types.js';
export { loadOikosConfig, loadGatewayConfig } from './config/env.js';
export type { OikosConfig, OikosMode } from './config/env.js';
export { createDashboard } from './dashboard/server.js';
export { mountMCP } from './mcp/server.js';
export { EventBus } from './events/bus.js';
export type { StreamEvent, AgentMessageData, NetworkActivityData, IncomingTransferData, ThresholdReachedData, MarketSignalData, AgentStatusData, SwarmEventData, EventSource, } from './events/types.js';
export { PricingService } from './pricing/client.js';
export type { AssetPrice as PricingAssetPrice, PortfolioValuation as PricingPortfolioValuation, PricePoint, } from './pricing/client.js';
export type { AgentCapability, AgentIdentity, SwarmCoordinatorInterface, SwarmState, SwarmEconomics, SwarmPeerInfo, ActiveRoom, SwarmEvent, BoardAnnouncement, BoardHeartbeat, BoardMessage, RoomMessage, FeedMessage, } from './swarm/types.js';
export { CompanionCoordinator } from './companion/coordinator.js';
export type { CompanionStateProvider, CompanionConfig } from './companion/coordinator.js';
export type { AgentToCompanionMessage, CompanionToAgentMessage, CompanionMessage, CompanionBalanceUpdate, CompanionAgentReasoning, CompanionSwarmStatus, CompanionPolicyUpdate, CompanionExecutionNotify, } from './companion/types.js';
export { startTransportBridge } from './rgb/transport-bridge.js';
export { toSmallestUnit, toHumanReadable, getDecimals } from './amounts.js';
export { X402Client } from './x402/client.js';
export type { X402PaymentRequired, X402SignedPayment, X402Service, X402Economics } from './x402/types.js';
export { getDemoCreators, getDefaultCreator, loadCreators } from './creators/registry.js';
export type { Creator, CreatorRegistry } from './creators/registry.js';
//# sourceMappingURL=index.d.ts.map