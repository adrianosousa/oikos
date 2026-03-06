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

let entryCounter = 0;

function generateEntryId(): string {
  entryCounter++;
  return `audit-${Date.now()}-${entryCounter}`;
}

export class AuditLog {
  private readonly append: AppendFunction;
  private readonly entries: AuditEntry[] = []; // In-memory cache for queries

  constructor(append: AppendFunction) {
    this.append = append;
  }

  /** Log a received proposal (before policy evaluation). */
  logProposalReceived(proposal: ProposalCommon, proposalType?: string, source?: ProposalSource): AuditEntry {
    return this.writeEntry({
      id: generateEntryId(),
      timestamp: new Date().toISOString(),
      type: 'proposal_received',
      proposalType,
      source,
      proposal
    });
  }

  /** Log a policy enforcement (rejection with violations). */
  logPolicyEnforcement(proposal: ProposalCommon, violations: string[], proposalType?: string, source?: ProposalSource): AuditEntry {
    return this.writeEntry({
      id: generateEntryId(),
      timestamp: new Date().toISOString(),
      type: 'policy_enforcement',
      proposalType,
      source,
      proposal,
      violations
    });
  }

  /** Log a successful execution. */
  logExecutionSuccess(proposal: ProposalCommon, txHash: string, proposalType?: string, source?: ProposalSource): AuditEntry {
    return this.writeEntry({
      id: generateEntryId(),
      timestamp: new Date().toISOString(),
      type: 'execution_success',
      proposalType,
      source,
      proposal,
      txHash
    });
  }

  /** Log a failed execution (network error, insufficient funds, etc.). */
  logExecutionFailure(proposal: ProposalCommon, error: string, proposalType?: string, source?: ProposalSource): AuditEntry {
    return this.writeEntry({
      id: generateEntryId(),
      timestamp: new Date().toISOString(),
      type: 'execution_failure',
      proposalType,
      source,
      proposal,
      error
    });
  }

  /** Log a malformed IPC message that failed validation. */
  logMalformedMessage(rawSnippet: string, error: string): AuditEntry {
    // Truncate raw message to prevent log bloat from attack payloads
    const safe = rawSnippet.slice(0, 200);
    return this.writeEntry({
      id: generateEntryId(),
      timestamp: new Date().toISOString(),
      type: 'malformed_message',
      error: `${error}: ${safe}`
    });
  }

  /** Query recent entries (for dashboard display via IPC). */
  getEntries(limit?: number, since?: number): AuditEntry[] {
    let result = this.entries;

    if (since !== undefined) {
      const sinceDate = new Date(since).toISOString();
      result = result.filter(e => e.timestamp >= sinceDate);
    }

    if (limit !== undefined && limit > 0) {
      result = result.slice(-limit);
    }

    return result;
  }

  private writeEntry(entry: AuditEntry): AuditEntry {
    const line = JSON.stringify(entry);
    this.append(line);
    this.entries.push(entry);
    return entry;
  }
}
