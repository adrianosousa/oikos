/**
 * Topic Derivation — BLAKE2b KDF for board and room topics.
 *
 * Adapted from rgb-c-t/lib/topic.js.
 * Uses keyed BLAKE2b-256 with domain separation to derive
 * deterministic 32-byte topics for Hyperswarm DHT.
 *
 * Board topic: shared discovery layer (one per swarm ID).
 * Room topic:  private per-announcement negotiation space.
 */
/**
 * Derive the board topic from a swarm ID.
 * All agents in the same swarm join this topic for public discovery.
 */
export declare function deriveBoardTopic(swarmId: string): Buffer;
/**
 * Derive a room topic from an announcement ID and creator pubkey.
 * Each announcement gets a unique, deterministic room topic.
 * Only participants who know the announcement ID + creator can derive it.
 */
export declare function deriveRoomTopic(announcementId: string, creatorPubkey: Buffer): Buffer;
//# sourceMappingURL=topic.d.ts.map