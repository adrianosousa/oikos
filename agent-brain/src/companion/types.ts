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

import type { BalanceResponse, ExecutionResult, PolicyStatus } from 'oikos-wallet-gateway';

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
  economics: { totalRevenue: string; totalCosts: string; sustainabilityScore: number };
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

// ── Union Types ──

/** Messages sent FROM the agent TO the companion */
export type AgentToCompanionMessage =
  | CompanionBalanceUpdate
  | CompanionAgentReasoning
  | CompanionSwarmStatus
  | CompanionPolicyUpdate
  | CompanionExecutionNotify
  | CompanionApprovalRequest;

/** Messages sent FROM the companion TO the agent */
export type CompanionToAgentMessage =
  | CompanionInstruction
  | CompanionApprovalResponse
  | CompanionPing;

/** All companion messages */
export type CompanionMessage = AgentToCompanionMessage | CompanionToAgentMessage;
