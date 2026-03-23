/**
 * Event source types — agent-wallet native.
 *
 * Events represent wallet activity, market signals, and agent status.
 * Used for real-time reasoning and dashboard feed display.
 * Events are ephemeral — never persisted beyond the current reasoning cycle.
 */

/** A single event from the wallet/agent system */
export interface StreamEvent {
  /** Unique event ID */
  id: string;

  /** ISO 8601 timestamp */
  timestamp: string;

  /** Event type */
  type: 'agent_message' | 'network_activity' | 'incoming_transfer' | 'threshold_reached' | 'market_signal' | 'agent_status' | 'swarm';

  /** Event data */
  data: AgentMessageData | NetworkActivityData | IncomingTransferData | ThresholdReachedData | MarketSignalData | AgentStatusData | SwarmEventData;
}

export interface AgentMessageData {
  type: 'agent_message';
  agentName: string;
  message: string;
  intent?: 'info' | 'action' | 'warning';
}

export interface NetworkActivityData {
  type: 'network_activity';
  chain: string;
  txCount: number;
  gasPrice?: string;
}

export interface IncomingTransferData {
  type: 'incoming_transfer';
  from: string;
  amount: number;
  symbol: string;
  chain?: string;
  txHash?: string;
}

export interface ThresholdReachedData {
  type: 'threshold_reached';
  name: string;
  value: number;
  threshold: number;
}

export interface MarketSignalData {
  type: 'market_signal';
  signal: string;
  magnitude: number;
  source: string;
}

export interface AgentStatusData {
  type: 'agent_status';
  status: 'active' | 'idle' | 'starting' | 'stopping';
}

export interface SwarmEventData {
  type: 'swarm';
  kind: string;
  summary: string;
  /** Full event details (roomId, message, fromPubkey, etc.) */
  details?: Record<string, unknown>;
}

/** Interface for event sources */
export interface EventSource {
  /** Start polling/listening for events */
  start(): void;

  /** Stop polling/listening */
  stop(): void;

  /** Register event handler */
  onEvents(handler: (events: StreamEvent[]) => void): void;
}
