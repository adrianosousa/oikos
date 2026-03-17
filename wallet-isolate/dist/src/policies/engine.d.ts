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
import type { PolicyConfig, PolicyEvaluationResult } from './types.js';
export declare class PolicyEngine {
    private readonly policies;
    private readonly state;
    private readonly getNow;
    constructor(config: PolicyConfig, getNow?: () => number);
    /**
     * Evaluate a proposal against all policies.
     * Returns the result with any violations found.
     * Works with all proposal types (payment, swap, bridge, yield).
     *
     * @security This is the ONLY function that decides whether a proposal proceeds.
     */
    evaluate(proposal: ProposalCommon): PolicyEvaluationResult;
    /**
     * Record that a proposal was successfully executed.
     * Updates session/day totals and cooldown timer.
     * Works with all proposal types.
     *
     * MUST only be called AFTER successful execution.
     */
    recordExecution(proposal: ProposalCommon): void;
    /** Get current policy status for IPC query responses. */
    getStatus(): Array<{
        id: string;
        name: string;
        state: Record<string, unknown>;
    }>;
    private evaluateRule;
    private getHourInTimezone;
    private getCurrentDay;
    private rollDayIfNeeded;
}
//# sourceMappingURL=engine.d.ts.map