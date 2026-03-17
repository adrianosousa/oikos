/**
 * Proposal Executor — THE SINGLE CODE PATH THAT MOVES FUNDS.
 *
 * Flow: evaluate policy -> if approved -> execute operation -> log result
 *
 * Handles all proposal types: payment, swap, bridge, yield.
 *
 * @security This is the most critical module in the entire system.
 * A rejected proposal MUST NEVER result in a signed transaction.
 * This invariant is the #1 test target.
 *
 * The executor does NOT retry failed operations.
 * The Brain may submit a new proposal if it wants to retry.
 */
import type { ProposalCommon, ExecutionResult, ProposalSource } from '../ipc/types.js';
import type { PolicyEngine } from '../policies/engine.js';
import type { WalletOperations } from '../wallet/types.js';
import type { AuditLog } from '../audit/log.js';
export declare class ProposalExecutor {
    private readonly policy;
    private readonly wallet;
    private readonly audit;
    constructor(policy: PolicyEngine, wallet: WalletOperations, audit: AuditLog);
    /**
     * Process any proposal through the full pipeline:
     * 1. Log receipt
     * 2. Evaluate policy
     * 3. If rejected -> log enforcement, return rejection
     * 4. If approved -> execute operation
     * 5. Log success or failure
     * 6. If success -> record in policy state
     *
     * @security A rejected proposal NEVER reaches step 4.
     */
    execute(proposalType: string, proposal: ProposalCommon, source?: ProposalSource): Promise<ExecutionResult>;
    /** Route to the appropriate wallet operation based on proposal type. */
    private executeOperation;
}
export { ProposalExecutor as PaymentExecutor };
//# sourceMappingURL=executor.d.ts.map