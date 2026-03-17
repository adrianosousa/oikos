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
import type { AgentIdentity, AgentCapability } from './types.js';
export interface AgentKeypair {
    publicKey: Buffer;
    secretKey: Buffer;
}
/** Generate a new Ed25519 keypair using sodium */
export declare function generateKeypair(): AgentKeypair;
/** Load an existing keypair from disk, or create and persist a new one */
export declare function loadOrCreateKeypair(path: string): AgentKeypair;
/** Build the agent's identity object for board announcements */
export declare function buildIdentity(keypair: AgentKeypair, name: string, capabilities: AgentCapability[], reputation: number, auditHash: string): AgentIdentity;
//# sourceMappingURL=identity.d.ts.map