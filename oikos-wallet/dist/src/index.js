/**
 * Oikos App — Public API
 *
 * Agent-agnostic wallet infrastructure. Any agent connects via MCP/REST/CLI.
 * This module exports everything an external agent or library consumer needs.
 */
// ── Core IPC ──
export { WalletIPCClient } from './ipc/client.js';
// ── Config ──
export { loadOikosConfig, loadGatewayConfig } from './config/env.js';
// ── Dashboard + MCP ──
export { createDashboard } from './dashboard/server.js';
export { mountMCP } from './mcp/server.js';
// ── Events ──
export { EventBus } from './events/bus.js';
// ── Pricing ──
export { PricingService } from './pricing/client.js';
// ── Companion ──
export { CompanionCoordinator } from './companion/coordinator.js';
// ── RGB ──
export { startTransportBridge } from './rgb/transport-bridge.js';
// ── Amount Conversion ──
export { toSmallestUnit, toHumanReadable, getDecimals } from './amounts.js';
// ── x402 ──
export { X402Client } from './x402/client.js';
// ── Creators ──
export { getDemoCreators, getDefaultCreator, loadCreators } from './creators/registry.js';
//# sourceMappingURL=index.js.map