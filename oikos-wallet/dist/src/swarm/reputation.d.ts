/**
 * Reputation System — Trust derived from immutable audit trail.
 *
 * Score formula: weighted combination of success rate, volume, and history.
 * Range: 0.0 (no trust) to 1.0 (maximum trust).
 *
 * Hackathon scope: numeric score + BLAKE2b audit hash commitment.
 * Production roadmap: Merkle proofs for zero-knowledge verification.
 *
 * Score is sovereign — each agent computes its own score from its audit log.
 * Peers verify by checking the audit hash commitment.
 */
export interface ReputationInput {
    successfulTxs: number;
    failedTxs: number;
    rejectedTxs: number;
    totalVolumeUsd: number;
    historyDays: number;
}
/**
 * Compute reputation score from audit metrics.
 *
 * Formula:
 *   score = 0.5 * successRate + 0.3 * volumeScore + 0.2 * historyScore
 *
 * - successRate:  successful / (successful + failed), range 0-1
 * - volumeScore:  min(1, totalVolume / 1000), saturates at $1000
 * - historyScore: min(1, historyDays / 30), saturates at 30 days
 *
 * Returns 0.5 (neutral) for agents with no transaction history.
 */
export declare function computeReputation(input: ReputationInput): number;
/**
 * Compute BLAKE2b-256 hash of audit entries.
 * Serves as a commitment — peers can verify the hash without seeing raw data.
 */
export declare function computeAuditHash(auditEntries: unknown[]): string;
/**
 * Derive reputation input from raw audit log entries.
 * Counts successes, failures, rejections, and estimates volume.
 */
export declare function reputationFromAuditEntries(entries: Array<{
    type: string;
    proposal?: {
        amount?: string;
        symbol?: string;
    };
    timestamp?: number;
}>): ReputationInput;
//# sourceMappingURL=reputation.d.ts.map