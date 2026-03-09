/**
 * Agent Identity — Ed25519 keypair generation and persistence.
 *
 * Each agent has a persistent Ed25519 keypair used for:
 * - Hyperswarm Noise authentication
 * - Board announcements (pubkey as identity)
 * - Room participation verification
 * - Reputation commitment signing
 *
 * Keypair is generated via HyperDHT (which wraps sodium).
 * Stored as hex-encoded JSON on disk.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import sodium from 'sodium-universal';
import b4a from 'b4a';
import type { AgentIdentity, AgentCapability } from './types.js';

export interface AgentKeypair {
  publicKey: Buffer;
  secretKey: Buffer;
}

/** Generate a new Ed25519 keypair using sodium */
export function generateKeypair(): AgentKeypair {
  const publicKey = b4a.alloc(sodium.crypto_sign_PUBLICKEYBYTES);
  const secretKey = b4a.alloc(sodium.crypto_sign_SECRETKEYBYTES);
  sodium.crypto_sign_keypair(publicKey, secretKey);
  return { publicKey, secretKey };
}

/** Load an existing keypair from disk, or create and persist a new one */
export function loadOrCreateKeypair(path: string): AgentKeypair {
  if (existsSync(path)) {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as {
      publicKey: string;
      secretKey: string;
    };
    return {
      publicKey: Buffer.from(data.publicKey, 'hex'),
      secretKey: Buffer.from(data.secretKey, 'hex'),
    };
  }

  const kp = generateKeypair();
  writeFileSync(
    path,
    JSON.stringify({
      publicKey: kp.publicKey.toString('hex'),
      secretKey: kp.secretKey.toString('hex'),
    }),
    'utf-8'
  );
  return kp;
}

/** Build the agent's identity object for board announcements */
export function buildIdentity(
  keypair: AgentKeypair,
  name: string,
  capabilities: AgentCapability[],
  reputation: number,
  auditHash: string
): AgentIdentity {
  return {
    pubkey: keypair.publicKey.toString('hex'),
    name,
    capabilities,
    reputation,
    auditHash,
  };
}
