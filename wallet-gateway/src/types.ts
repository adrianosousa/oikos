/**
 * Gateway Plugin Interface — optional brain capabilities.
 *
 * The gateway works standalone for wallet operations.
 * When an agent brain registers as a plugin, it provides
 * additional capabilities (agent state, swarm, pricing).
 */

import type { BalanceResponse } from './ipc/types.js';

/** Pricing data for a single asset */
export interface AssetPrice {
  symbol: string;
  usd: number;
  source: string;
  timestamp: number;
}

/** Portfolio valuation */
export interface PortfolioValuation {
  totalUsd: number;
  assets: Array<{
    symbol: string;
    chain: string;
    balance: string;
    formatted: string;
    usd: number;
    allocation: number;
  }>;
  prices: AssetPrice[];
  updatedAt: number;
}

/** Interface that a pricing service must implement */
export interface PricingInterface {
  getAllPrices(): Promise<AssetPrice[]>;
  valuatePortfolio(balances: BalanceResponse[]): Promise<PortfolioValuation>;
  getHistoricalPrices(symbol: string): Promise<Array<{ timestamp: number; price: number }>>;
}

/** Swarm announcement posting options */
export interface SwarmAnnounceOpts {
  category: 'service' | 'auction' | 'request';
  title: string;
  description: string;
  priceRange: { min: string; max: string; symbol: string };
}

/** Interface that a swarm coordinator must implement for the gateway */
export interface SwarmInterface {
  getState(): Record<string, unknown>;
  postAnnouncement(opts: SwarmAnnounceOpts): string;
}

/**
 * Plugin interface for the Agent Brain.
 *
 * When registered, the gateway delegates brain-dependent
 * MCP tools and REST endpoints to this plugin.
 * When not registered, those endpoints return graceful defaults.
 */
export interface GatewayPlugin {
  /** Agent brain state (for /api/state and agent_state MCP tool) */
  getAgentState?(): unknown;

  /** ERC-8004 identity state (for /api/identity and identity_state MCP tool) */
  getIdentityState?(): { registered: boolean; agentId?: string | null };

  /** Swarm coordinator (for /api/swarm, swarm_state, swarm_announce MCP tools) */
  getSwarm?(): SwarmInterface | null;

  /** Pricing service (for /api/prices, /api/valuation) */
  getPricing?(): PricingInterface | null;
}
