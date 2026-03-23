/**
 * Companion Channel Types — Human-Agent P2P Communication.
 *
 * The companion app connects to the Agent Brain via Hyperswarm Noise-authenticated
 * P2P channel. Same protomux infrastructure as the swarm — just a different
 * channel type with owner-level authentication.
 *
 * Privacy invariant: Companion NEVER talks to the Wallet Isolate directly.
 * It talks to the Brain, which translates instructions into IPC proposals.
 * Process isolation is preserved.
 */

import type { BalanceResponse, ExecutionResult, PolicyStatus } from '../ipc/types.js';

// ── Agent → Companion (Read-Only State) ──

export interface CompanionBalanceUpdate {
  type: 'balance_update';
  balances: BalanceResponse[];
  timestamp: number;
}

export interface CompanionAgentReasoning {
  type: 'agent_reasoning';
  status: string;
  reasoning: string;
  decision: string;
  timestamp: number;
}

export interface CompanionSwarmStatus {
  type: 'swarm_status';
  peersConnected: number;
  activeRooms: number;
  announcements: number;
  /** Full peer list for UI rendering */
  boardPeers?: Array<{ name: string; pubkey: string; reputation: number }>;
  /** Full announcement list for UI rendering */
  announcementList?: Array<{ id: string; title: string; category: string; agentName: string; description: string; priceRange?: { min: string; max: string; symbol: string }; reputation: number; timestamp: number }>;
  /** Full room list for UI rendering */
  roomList?: Array<{ announcementId: string; status: string; announcement: { title: string }; bids: number }>;
  /** Agent identity on the swarm */
  identity?: { name: string; reputation: number };
  economics: { totalRevenue: string; totalCosts: string; sustainabilityScore: number; dealsCompleted?: number };
  timestamp: number;
}

export interface CompanionPolicyUpdate {
  type: 'policy_update';
  policies: PolicyStatus[];
  timestamp: number;
}

export interface CompanionExecutionNotify {
  type: 'execution_notify';
  result: ExecutionResult;
  timestamp: number;
}

export interface CompanionApprovalRequest {
  type: 'approval_request';
  proposalId: string;
  proposalType: string;
  amount: string;
  symbol: string;
  chain: string;
  reason: string;
  timestamp: number;
}

/** Live market prices from the pricing service */
export interface CompanionPriceUpdate {
  type: 'price_update';
  prices: Array<{ symbol: string; priceUsd: number; source: string; updatedAt: number }>;
  timestamp: number;
}

/** Wallet addresses per chain */
export interface CompanionAddressUpdate {
  type: 'address_update';
  addresses: Array<{ chain: string; address: string }>;
  timestamp: number;
}

/** Chat reply from the brain (agent response to human message) */
export interface CompanionChatReply {
  type: 'chat_reply';
  text: string;
  brainName: string;
  timestamp: number;
}

// ── Companion → Agent (Instructions) ──

export interface CompanionInstruction {
  type: 'instruction';
  text: string;
  timestamp: number;
}

export interface CompanionApprovalResponse {
  type: 'approval_response';
  proposalId: string;
  approved: boolean;
  timestamp: number;
}

export interface CompanionPing {
  type: 'ping';
  timestamp: number;
}

/** Request to save a strategy file via protomux */
export interface CompanionStrategySave {
  type: 'strategy_save';
  filename: string;
  content: string;
  requestId: string;
  timestamp: number;
}

/** Request to toggle a strategy's enabled state via protomux */
export interface CompanionStrategyToggle {
  type: 'strategy_toggle';
  filename: string;
  enabled: boolean;
  requestId: string;
  timestamp: number;
}

/** Strategy list pushed to companion */
export interface CompanionStrategyUpdate {
  type: 'strategy_update';
  strategies: Array<{ filename: string; enabled: boolean; source: string; content: string }>;
  timestamp: number;
}

/** Request to update policy rules via protomux */
export interface CompanionPolicySave {
  type: 'policy_save';
  rules: unknown[];
  name?: string;
  requestId: string;
  timestamp: number;
}

/** Response to a strategy save/toggle request */
export interface CompanionStrategyResult {
  type: 'strategy_result';
  requestId: string;
  success: boolean;
  filename?: string;
  action?: string;
  error?: string;
  timestamp: number;
}

/** Audit trail entries pushed to companion */
export interface CompanionAuditUpdate {
  type: 'audit_update';
  entries: Array<Record<string, unknown>>;
  timestamp: number;
}

/** Response to a policy save request */
export interface CompanionPolicyResult {
  type: 'policy_result';
  requestId: string;
  success: boolean;
  rulesCount?: number;
  error?: string;
  timestamp: number;
}

/** Auth request from companion (setup, verify, disable, etc.) */
export interface CompanionAuthRequest {
  type: 'auth_request';
  action: 'status' | 'setup' | 'verify' | 'disable' | 'change' | 'settings' | 'pending' | 'resolve';
  requestId: string;
  payload?: {
    passphrase?: string;
    threshold?: number;
    timeoutMinutes?: number;
    proposalId?: string;
    currentPassphrase?: string;
    newPassphrase?: string;
    requireForPolicyChanges?: boolean;
    requireForStrategyActivation?: boolean;
  };
  timestamp: number;
}

/** Auth response from agent to companion */
export interface CompanionAuthResponse {
  type: 'auth_response';
  requestId: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  timestamp: number;
}

/** Periodic auth status push from agent to companion */
export interface CompanionAuthUpdate {
  type: 'auth_update';
  status: {
    enabled: boolean;
    threshold: number;
    timeoutMinutes: number;
    authenticated: boolean;
    expiresAt: number | null;
    requireForPolicyChanges: boolean;
    requireForStrategyActivation: boolean;
  };
  pending: Array<{
    proposalId: string;
    description: string;
    amount: number;
    createdAt: number;
    expiresAt: number;
    resolved: boolean;
    approved: boolean;
  }>;
  timestamp: number;
}

// ── Union Types ──

/** Messages sent FROM the agent TO the companion */
export type AgentToCompanionMessage =
  | CompanionBalanceUpdate
  | CompanionAgentReasoning
  | CompanionSwarmStatus
  | CompanionPolicyUpdate
  | CompanionPriceUpdate
  | CompanionAddressUpdate
  | CompanionExecutionNotify
  | CompanionApprovalRequest
  | CompanionChatReply
  | CompanionStrategyUpdate
  | CompanionStrategyResult
  | CompanionPolicyResult
  | CompanionAuditUpdate
  | CompanionAuthResponse
  | CompanionAuthUpdate;

/** Messages sent FROM the companion TO the agent */
export type CompanionToAgentMessage =
  | CompanionInstruction
  | CompanionApprovalResponse
  | CompanionPing
  | CompanionStrategySave
  | CompanionStrategyToggle
  | CompanionPolicySave
  | CompanionAuthRequest;

/** All companion messages */
export type CompanionMessage = AgentToCompanionMessage | CompanionToAgentMessage;
