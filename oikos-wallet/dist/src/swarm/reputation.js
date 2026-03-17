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
import sodium from 'sodium-universal';
import b4a from 'b4a';
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
export function computeReputation(input) {
    const { successfulTxs, failedTxs, totalVolumeUsd, historyDays } = input;
    const totalTxs = successfulTxs + failedTxs;
    // New agent with no history — neutral score
    if (totalTxs === 0 && historyDays === 0) {
        return 0.5;
    }
    const successRate = totalTxs > 0 ? successfulTxs / totalTxs : 0.5;
    const volumeScore = Math.min(1, totalVolumeUsd / 1000);
    const historyScore = Math.min(1, historyDays / 30);
    const score = 0.5 * successRate + 0.3 * volumeScore + 0.2 * historyScore;
    // Clamp to [0.0, 1.0]
    return Math.max(0, Math.min(1, score));
}
/**
 * Compute BLAKE2b-256 hash of audit entries.
 * Serves as a commitment — peers can verify the hash without seeing raw data.
 */
export function computeAuditHash(auditEntries) {
    const data = b4a.from(JSON.stringify(auditEntries));
    const hash = b4a.alloc(32);
    sodium.crypto_generichash(hash, data);
    return hash.toString('hex');
}
/**
 * Derive reputation input from raw audit log entries.
 * Counts successes, failures, rejections, and estimates volume.
 */
export function reputationFromAuditEntries(entries) {
    let successfulTxs = 0;
    let failedTxs = 0;
    let rejectedTxs = 0;
    let totalVolumeUsd = 0;
    // Rough USD conversion for volume estimation
    const usdRates = {
        USDT: 1, USAT: 1, XAUT: 2400, BTC: 60000, ETH: 3000,
    };
    let earliestTimestamp = Date.now();
    let latestTimestamp = 0;
    for (const entry of entries) {
        const ts = entry.timestamp ?? Date.now();
        if (ts < earliestTimestamp)
            earliestTimestamp = ts;
        if (ts > latestTimestamp)
            latestTimestamp = ts;
        if (entry.type === 'execution_success') {
            successfulTxs++;
            if (entry.proposal?.amount && entry.proposal.symbol) {
                const amount = parseFloat(entry.proposal.amount) || 0;
                const rate = usdRates[entry.proposal.symbol] ?? 1;
                totalVolumeUsd += amount * rate;
            }
        }
        else if (entry.type === 'execution_failure') {
            failedTxs++;
        }
        else if (entry.type === 'policy_enforcement') {
            rejectedTxs++;
        }
    }
    const historyMs = latestTimestamp > earliestTimestamp ? latestTimestamp - earliestTimestamp : 0;
    const historyDays = Math.floor(historyMs / (24 * 60 * 60 * 1000));
    return { successfulTxs, failedTxs, rejectedTxs, totalVolumeUsd, historyDays };
}
//# sourceMappingURL=reputation.js.map