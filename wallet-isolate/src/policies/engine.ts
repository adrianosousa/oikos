/**
 * Policy Engine — deterministic evaluation of all proposal types.
 *
 * Evaluates any ProposalCommon (payment, swap, bridge, yield) against
 * all loaded policies. If ANY rule in ANY policy is violated, the
 * proposal is rejected.
 *
 * The engine maintains mutable state (session/day totals, cooldowns)
 * but the policies themselves are IMMUTABLE after construction.
 *
 * @security This is the gatekeeper. If this says no, no funds move.
 * Evaluation is deterministic: same proposal + same state = same result.
 */

import type { ProposalCommon } from '../ipc/types.js';
import { getCounterparty } from '../ipc/types.js';
import type {
  PaymentPolicy,
  PolicyConfig,
  PolicyRule,
  PolicyEvaluationResult
} from './types.js';

interface SpendingState {
  sessionTotalBySymbol: Map<string, bigint>;
  dayTotalBySymbol: Map<string, bigint>;
  dayTotalByRecipientBySymbol: Map<string, bigint>; // key: `${recipient}:${symbol}`
  lastTransactionTime: number;
  currentDay: string; // YYYY-MM-DD, for day boundary detection
}

export class PolicyEngine {
  private readonly policies: PaymentPolicy[];
  private readonly state: SpendingState;
  private readonly getNow: () => number;

  constructor(config: PolicyConfig, getNow?: () => number) {
    // Copy policies — treated as immutable for the lifetime of this process
    this.policies = config.policies.map(p => ({
      ...p,
      rules: [...p.rules]
    }));

    this.getNow = getNow ?? (() => Date.now());

    this.state = {
      sessionTotalBySymbol: new Map(),
      dayTotalBySymbol: new Map(),
      dayTotalByRecipientBySymbol: new Map(),
      lastTransactionTime: 0,
      currentDay: this.getCurrentDay()
    };
  }

  /**
   * Evaluate a proposal against all policies.
   * Returns the result with any violations found.
   * Works with all proposal types (payment, swap, bridge, yield).
   *
   * @security This is the ONLY function that decides whether a proposal proceeds.
   */
  evaluate(proposal: ProposalCommon): PolicyEvaluationResult {
    this.rollDayIfNeeded();

    const allViolations: string[] = [];

    for (const policy of this.policies) {
      for (const rule of policy.rules) {
        const violation = this.evaluateRule(rule, proposal, policy.id);
        if (violation !== null) {
          allViolations.push(violation);
        }
      }
    }

    const result: PolicyEvaluationResult = {
      approved: allViolations.length === 0,
      violations: allViolations,
      policyId: this.policies.length > 0 ? this.policies[0]!.id : 'none'
    };

    return result;
  }

  /**
   * Record that a proposal was successfully executed.
   * Updates session/day totals and cooldown timer.
   * Works with all proposal types.
   *
   * MUST only be called AFTER successful execution.
   */
  recordExecution(proposal: ProposalCommon): void {
    this.rollDayIfNeeded();

    const amount = BigInt(proposal.amount);
    const symbol = proposal.symbol;

    // Session total
    const sessionKey = symbol;
    const currentSession = this.state.sessionTotalBySymbol.get(sessionKey) ?? 0n;
    this.state.sessionTotalBySymbol.set(sessionKey, currentSession + amount);

    // Day total
    const currentDay = this.state.dayTotalBySymbol.get(symbol) ?? 0n;
    this.state.dayTotalBySymbol.set(symbol, currentDay + amount);

    // Per-recipient-per-day (only for proposals with a counterparty)
    const counterparty = getCounterparty(proposal);
    if (counterparty) {
      const recipientKey = `${counterparty}:${symbol}`;
      const currentRecipient = this.state.dayTotalByRecipientBySymbol.get(recipientKey) ?? 0n;
      this.state.dayTotalByRecipientBySymbol.set(recipientKey, currentRecipient + amount);
    }

    // Cooldown
    this.state.lastTransactionTime = this.getNow();
  }

  /** Get current policy status for IPC query responses. */
  getStatus(): Array<{ id: string; name: string; state: Record<string, unknown> }> {
    // Convert BigInt values to strings for JSON serialization
    const sessionTotals: Record<string, string> = {};
    for (const [key, val] of this.state.sessionTotalBySymbol) {
      sessionTotals[key] = val.toString();
    }

    const dayTotals: Record<string, string> = {};
    for (const [key, val] of this.state.dayTotalBySymbol) {
      dayTotals[key] = val.toString();
    }

    return this.policies.map(p => ({
      id: p.id,
      name: p.name,
      state: {
        sessionTotals,
        dayTotals,
        lastTransactionTime: this.state.lastTransactionTime,
        currentDay: this.state.currentDay
      }
    }));
  }

  private evaluateRule(rule: PolicyRule, proposal: ProposalCommon, policyId: string): string | null {
    const amount = BigInt(proposal.amount);

    switch (rule.type) {
      case 'max_per_tx': {
        if (proposal.symbol !== rule.symbol) return null;
        const limit = BigInt(rule.amount);
        if (amount > limit) {
          return `[${policyId}] max_per_tx: ${proposal.amount} exceeds limit ${rule.amount} ${rule.symbol}`;
        }
        return null;
      }

      case 'max_per_session': {
        if (proposal.symbol !== rule.symbol) return null;
        const limit = BigInt(rule.amount);
        const spent = this.state.sessionTotalBySymbol.get(rule.symbol) ?? 0n;
        if (spent + amount > limit) {
          return `[${policyId}] max_per_session: total ${(spent + amount).toString()} would exceed limit ${rule.amount} ${rule.symbol}`;
        }
        return null;
      }

      case 'max_per_day': {
        if (proposal.symbol !== rule.symbol) return null;
        const limit = BigInt(rule.amount);
        const spent = this.state.dayTotalBySymbol.get(rule.symbol) ?? 0n;
        if (spent + amount > limit) {
          return `[${policyId}] max_per_day: daily total ${(spent + amount).toString()} would exceed limit ${rule.amount} ${rule.symbol}`;
        }
        return null;
      }

      case 'max_per_recipient_per_day': {
        if (proposal.symbol !== rule.symbol) return null;
        // Only applies to proposals with a counterparty (payment, yield)
        // Swaps and bridges have no specific counterparty — skip this rule
        const counterparty = getCounterparty(proposal);
        if (!counterparty) return null;
        const limit = BigInt(rule.amount);
        const key = `${counterparty}:${rule.symbol}`;
        const spent = this.state.dayTotalByRecipientBySymbol.get(key) ?? 0n;
        if (spent + amount > limit) {
          return `[${policyId}] max_per_recipient_per_day: counterparty ${counterparty} daily total ${(spent + amount).toString()} would exceed limit ${rule.amount} ${rule.symbol}`;
        }
        return null;
      }

      case 'cooldown_seconds': {
        const now = this.getNow();
        const elapsed = (now - this.state.lastTransactionTime) / 1000;
        if (this.state.lastTransactionTime > 0 && elapsed < rule.seconds) {
          return `[${policyId}] cooldown_seconds: ${elapsed.toFixed(1)}s elapsed, requires ${rule.seconds}s`;
        }
        return null;
      }

      case 'require_confidence': {
        if (proposal.confidence < rule.min) {
          return `[${policyId}] require_confidence: ${proposal.confidence} below minimum ${rule.min}`;
        }
        return null;
      }

      case 'whitelist_recipients': {
        // Only applies to proposals with a counterparty
        // Swaps and bridges have no counterparty — skip whitelist
        const counterparty = getCounterparty(proposal);
        if (!counterparty) return null;
        const normalizedAddresses = rule.addresses.map(a => a.toLowerCase());
        if (!normalizedAddresses.includes(counterparty.toLowerCase())) {
          return `[${policyId}] whitelist_recipients: ${counterparty} not in whitelist`;
        }
        return null;
      }

      case 'time_window': {
        const now = new Date(this.getNow());
        const hour = this.getHourInTimezone(now, rule.timezone);
        if (rule.start_hour <= rule.end_hour) {
          // Normal window (e.g., 8-22)
          if (hour < rule.start_hour || hour >= rule.end_hour) {
            return `[${policyId}] time_window: current hour ${hour} outside allowed window ${rule.start_hour}-${rule.end_hour} ${rule.timezone}`;
          }
        } else {
          // Overnight window (e.g., 22-8)
          if (hour < rule.start_hour && hour >= rule.end_hour) {
            return `[${policyId}] time_window: current hour ${hour} outside allowed window ${rule.start_hour}-${rule.end_hour} ${rule.timezone}`;
          }
        }
        return null;
      }
    }
  }

  private getHourInTimezone(date: Date, timezone: string): number {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone
      });
      return parseInt(formatter.format(date), 10);
    } catch {
      // If timezone is invalid, fail closed (return -1 which will violate most windows)
      return -1;
    }
  }

  private getCurrentDay(): string {
    return new Date(this.getNow()).toISOString().slice(0, 10);
  }

  private rollDayIfNeeded(): void {
    const today = this.getCurrentDay();
    if (today !== this.state.currentDay) {
      this.state.dayTotalBySymbol.clear();
      this.state.dayTotalByRecipientBySymbol.clear();
      this.state.currentDay = today;
    }
  }
}
