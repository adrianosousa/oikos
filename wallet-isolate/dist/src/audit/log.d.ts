/**
 * Audit Log — append-only JSON-lines writer.
 *
 * Every proposal received, every policy evaluation, every execution
 * result is recorded. This log is never updated, never truncated.
 *
 * @security This module handles sensitive operational data.
 * It MUST NOT log seed phrases, private keys, or raw wallet state.
 * It MUST NOT provide delete or update operations.
 */
import type { AuditEntry, ProposalCommon, ProposalSource } from '../ipc/types.js';
export type AppendFunction = (line: string) => void;
export declare class AuditLog {
    private readonly append;
    private readonly entries;
    constructor(append: AppendFunction);
    /** Log a received proposal (before policy evaluation). */
    logProposalReceived(proposal: ProposalCommon, proposalType?: string, source?: ProposalSource): AuditEntry;
    /** Log a policy enforcement (rejection with violations). */
    logPolicyEnforcement(proposal: ProposalCommon, violations: string[], proposalType?: string, source?: ProposalSource): AuditEntry;
    /** Log a successful execution. */
    logExecutionSuccess(proposal: ProposalCommon, txHash: string, proposalType?: string, source?: ProposalSource): AuditEntry;
    /** Log a failed execution (network error, insufficient funds, etc.). */
    logExecutionFailure(proposal: ProposalCommon, error: string, proposalType?: string, source?: ProposalSource): AuditEntry;
    /** Log a malformed IPC message that failed validation. */
    logMalformedMessage(rawSnippet: string, error: string): AuditEntry;
    /** Log an ERC-8004 identity lifecycle operation (register, setWallet). */
    logIdentityOperation(operation: string, result: {
        success: boolean;
        txHash?: string;
        agentId?: string;
        error?: string;
    }): AuditEntry;
    /** Query recent entries (for dashboard display via IPC). */
    getEntries(limit?: number, since?: number): AuditEntry[];
    private writeEntry;
}
//# sourceMappingURL=log.d.ts.map