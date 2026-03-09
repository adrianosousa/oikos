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

import sodium from 'sodium-universal';
import b4a from 'b4a';

// Domain separation keys (16 bytes each, padded to BLAKE2b key length)
const BOARD_KEY = b4a.from('oikos-board-v0--');  // 16 bytes
const ROOM_KEY  = b4a.from('oikos-room-v0---');  // 16 bytes

/**
 * Derive the board topic from a swarm ID.
 * All agents in the same swarm join this topic for public discovery.
 */
export function deriveBoardTopic(swarmId: string): Buffer {
  const msg = b4a.from(swarmId);
  const out = b4a.alloc(32);
  sodium.crypto_generichash(out, msg, BOARD_KEY);
  return out;
}

/**
 * Derive a room topic from an announcement ID and creator pubkey.
 * Each announcement gets a unique, deterministic room topic.
 * Only participants who know the announcement ID + creator can derive it.
 */
export function deriveRoomTopic(announcementId: string, creatorPubkey: Buffer): Buffer {
  const idBuf = b4a.from(announcementId);
  const msg = b4a.concat([idBuf, creatorPubkey]);
  const out = b4a.alloc(32);
  sodium.crypto_generichash(out, msg, ROOM_KEY);
  return out;
}
