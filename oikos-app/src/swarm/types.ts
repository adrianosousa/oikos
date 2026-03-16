/**
 * Swarm Type Definitions — All interfaces for the Oikos Agent Swarm.
 *
 * Three layers:
 * - Board (public): discovery announcements, heartbeats, reputation
 * - Room (private): negotiation, bidding, settlement, payment confirmation
 * - Feed (lightweight): price data, strategy signals
 *
 * Privacy invariant: Board NEVER contains transaction details.
 * All amounts, addresses, txids are ONLY shared inside private rooms.
 */

// ── Agent Identity ──

export type AgentCapability =
  | 'price-feed'
  | 'yield-optimizer'
  | 'portfolio-analyst'
  | 'compute'
  | 'data-provider'
  | 'swap-executor'
  | 'bridge-executor';

export interface AgentIdentity {
  /** Ed25519 public key (hex-encoded, 64 chars) */
  pubkey: string;
  /** Human-readable agent name */
  name: string;
  /** What this agent can do */
  capabilities: AgentCapability[];
  /** Reputation score (0.0 - 1.0) */
  reputation: number;
  /** BLAKE2b-256 hash of audit log (hex) — commitment for verification */
  auditHash: string;
  /** ERC-8004 on-chain agent ID (if registered) */
  erc8004AgentId?: string;
  /** ERC-8004 on-chain reputation summary (if available) */
  onChainReputation?: { feedbackCount: number; averageScore: number };
}

// ── Board Messages (Public Discovery) ──

/**
 * Announcement category determines payment direction:
 * - 'request': "I need X done" → creator pays bidder
 * - 'offer':   "I'm offering X" → bidder pays creator
 * - 'service': alias for 'offer' (legacy)
 * - 'auction': "Selling to highest bidder" → bidder pays creator
 */
export type AnnouncementCategory = 'request' | 'offer' | 'service' | 'auction';

export interface BoardAnnouncement {
  type: 'announcement';
  id: string;
  agentPubkey: string;
  agentName: string;
  reputation: number;
  category: AnnouncementCategory;
  title: string;
  description: string;
  priceRange: { min: string; max: string; symbol: string };
  capabilities: AgentCapability[];
  expiresAt: number;
  timestamp: number;
}

export interface BoardHeartbeat {
  type: 'heartbeat';
  agentPubkey: string;
  agentName: string;
  reputation: number;
  capabilities: AgentCapability[];
  timestamp: number;
}

/**
 * Board-level bid notification — fallback for room channel delivery.
 * Protomux room channels require both sides to open before messages flow.
 * This board-level message guarantees bid delivery via the proven board channel.
 * Contains the same data as RoomBid.
 */
export interface BoardBidNotification {
  type: 'board_bid';
  announcementId: string;
  bidderPubkey: string;
  bidderName: string;
  price: string;
  symbol: string;
  reason: string;
  /** Bidder's wallet address for receiving payment (if bidder is the payee) */
  paymentAddress?: string;
  paymentChain?: string;
  timestamp: number;
}

/**
 * Board-level accept notification — fallback for room channel delivery.
 */
export interface BoardAcceptNotification {
  type: 'board_accept';
  announcementId: string;
  acceptedBidderPubkey: string;
  agreedPrice: string;
  agreedSymbol: string;
  paymentAddress: string;
  paymentChain: string;
  timestamp: number;
}

/**
 * Board-level payment confirmation — fallback for room channel delivery.
 */
export interface BoardPaymentNotification {
  type: 'board_payment';
  announcementId: string;
  fromPubkey: string;
  txHash: string;
  amount: string;
  symbol: string;
  timestamp: number;
}

export type BoardMessage =
  | BoardAnnouncement
  | BoardHeartbeat
  | BoardBidNotification
  | BoardAcceptNotification
  | BoardPaymentNotification;

// ── Room Messages (Private Negotiation) ──

export interface RoomBid {
  type: 'bid';
  announcementId: string;
  bidderPubkey: string;
  bidderName: string;
  price: string;
  symbol: string;
  reason: string;
  /** Bidder's wallet address for receiving payment (if bidder is the payee) */
  paymentAddress?: string;
  /** Chain for payment (e.g., 'ethereum') */
  paymentChain?: string;
  timestamp: number;
}

export interface RoomReject {
  type: 'reject';
  announcementId: string;
  rejectedBidderPubkey: string;
  reason: string;
  timestamp: number;
}

export interface RoomCounterOffer {
  type: 'counter_offer';
  announcementId: string;
  fromPubkey: string;
  price: string;
  symbol: string;
  reason: string;
  timestamp: number;
}

export interface RoomAccept {
  type: 'accept';
  announcementId: string;
  acceptedBidderPubkey: string;
  agreedPrice: string;
  agreedSymbol: string;
  paymentAddress: string;
  paymentChain: string;
  timestamp: number;
}

export interface RoomTaskResult {
  type: 'task_result';
  announcementId: string;
  fromPubkey: string;
  result: string;
  timestamp: number;
}

export interface RoomPaymentRequest {
  type: 'payment_request';
  announcementId: string;
  fromPubkey: string;
  amount: string;
  symbol: string;
  chain: string;
  toAddress: string;
  timestamp: number;
}

export interface RoomPaymentConfirm {
  type: 'payment_confirm';
  announcementId: string;
  fromPubkey: string;
  txHash: string;
  amount: string;
  symbol: string;
  timestamp: number;
}

export type RoomMessage =
  | RoomBid
  | RoomCounterOffer
  | RoomAccept
  | RoomReject
  | RoomTaskResult
  | RoomPaymentRequest
  | RoomPaymentConfirm;

// ── Feed Messages (Lightweight Data) ──

export interface FeedPriceUpdate {
  type: 'price_update';
  fromPubkey: string;
  symbol: string;
  priceUsd: number;
  timestamp: number;
}

export interface FeedStrategySignal {
  type: 'strategy_signal';
  fromPubkey: string;
  protocol: string;
  symbol: string;
  apy: number;
  recommendation: string;
  timestamp: number;
}

export type FeedMessage = FeedPriceUpdate | FeedStrategySignal;

// ── Swarm Events (emitted to coordinator/brain) ──

export interface SwarmPeerEvent {
  kind: 'peer_connected' | 'peer_disconnected';
  pubkey: string;
  name?: string;
}

export interface SwarmBoardEvent {
  kind: 'board_message';
  message: BoardMessage;
  fromPubkey: string;
}

export interface SwarmRoomEvent {
  kind: 'room_message';
  roomId: string;
  message: RoomMessage;
  fromPubkey: string;
}

export interface SwarmFeedEvent {
  kind: 'feed_message';
  message: FeedMessage;
  fromPubkey: string;
}

export interface SwarmSettlementEvent {
  kind: 'settlement_completed';
  announcementId: string;
  peerPubkey: string;
  txHash: string;
  amount: string;
  symbol: string;
  success: boolean;
}

export type SwarmEvent =
  | SwarmPeerEvent
  | SwarmBoardEvent
  | SwarmRoomEvent
  | SwarmFeedEvent
  | SwarmSettlementEvent;

// ── Room Lifecycle ──

export type RoomStatus =
  | 'open'
  | 'negotiating'
  | 'accepted'
  | 'executing'
  | 'settled'
  | 'cancelled'
  | 'disputed';

export interface ActiveRoom {
  announcementId: string;
  announcement: BoardAnnouncement;
  role: 'creator' | 'bidder';
  status: RoomStatus;
  bids: RoomBid[];
  acceptedBid?: RoomBid;
  agreedPrice?: string;
  agreedSymbol?: string;
  /** Wallet address of the party receiving payment (resolved from accept/bid) */
  paymentAddress?: string;
  /** Chain for payment settlement */
  paymentChain?: string;
  paymentTxHash?: string;
  createdAt: number;
}

// ── Swarm State (exposed to dashboard) ──

export interface SwarmEconomics {
  totalRevenue: string;
  totalCosts: string;
  completedTasks: number;
  failedTasks: number;
  sustainabilityScore: number;
}

export interface SwarmPeerInfo {
  pubkey: string;
  name: string;
  reputation: number;
  capabilities: AgentCapability[];
  lastSeen: number;
}

export interface SwarmState {
  identity: AgentIdentity;
  boardPeers: SwarmPeerInfo[];
  activeRooms: ActiveRoom[];
  announcements: BoardAnnouncement[];
  economics: SwarmEconomics;
}

// ── Swarm Coordinator Interface (implemented by real and mock) ──

export interface SwarmCoordinatorInterface {
  start(): Promise<void>;
  stop(): Promise<void>;
  getState(): SwarmState;
  onEvent(handler: (event: SwarmEvent) => void): void;
  postAnnouncement(opts: {
    category: AnnouncementCategory;
    title: string;
    description: string;
    priceRange: { min: string; max: string; symbol: string };
  }): string;
  bidOnAnnouncement(announcementId: string, price: string, symbol: string, reason: string): Promise<void>;
  acceptBestBid(announcementId: string): Promise<RoomAccept | undefined>;
  submitPayment(announcementId: string): Promise<void>;
  confirmPayment(announcementId: string, txHash: string): void;
  /** Cancel a negotiation room (creator only). Room closes without settlement. */
  cancelRoom?(announcementId: string): boolean;
  /** Explicitly connect to a peer by Noise public key (bypasses topic discovery) */
  joinPeer?(pubkeyHex: string): void;
  /** Stop explicitly connecting to a peer */
  leavePeer?(pubkeyHex: string): void;
}
