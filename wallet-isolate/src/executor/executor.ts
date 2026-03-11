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

import type {
  ProposalCommon,
  PaymentProposal,
  SwapProposal,
  BridgeProposal,
  YieldProposal,
  FeedbackProposal,
  RGBIssueProposal,
  RGBTransferProposal,
  ExecutionResult,
  ProposalSource,
} from '../ipc/types.js';
import type { PolicyEngine } from '../policies/engine.js';
import type { WalletOperations } from '../wallet/types.js';
import type { AuditLog } from '../audit/log.js';

export class ProposalExecutor {
  private readonly policy: PolicyEngine;
  private readonly wallet: WalletOperations;
  private readonly audit: AuditLog;

  constructor(policy: PolicyEngine, wallet: WalletOperations, audit: AuditLog) {
    this.policy = policy;
    this.wallet = wallet;
    this.audit = audit;
  }

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
  async execute(
    proposalType: string,
    proposal: ProposalCommon,
    source?: ProposalSource
  ): Promise<ExecutionResult> {
    // Step 1: Log receipt
    this.audit.logProposalReceived(proposal, proposalType, source);

    // Step 2: Evaluate policy
    const evaluation = this.policy.evaluate(proposal);

    // Step 3: If rejected, stop here. NEVER proceed to execution.
    if (!evaluation.approved) {
      this.audit.logPolicyEnforcement(proposal, evaluation.violations, proposalType, source);
      return {
        status: 'rejected',
        proposalType,
        proposal,
        violations: evaluation.violations,
        timestamp: Date.now()
      };
    }

    // Step 4: Approved — execute the operation
    const result = await this.executeOperation(proposalType, proposal);

    // Step 5: Log result
    if (result.success && result.txHash) {
      this.audit.logExecutionSuccess(proposal, result.txHash, proposalType, source);

      // Step 6: Record in policy state (for budget tracking)
      this.policy.recordExecution(proposal);

      return {
        status: 'executed',
        proposalType,
        proposal,
        violations: [],
        txHash: result.txHash,
        timestamp: Date.now()
      };
    } else {
      this.audit.logExecutionFailure(proposal, result.error ?? 'Unknown error', proposalType, source);
      return {
        status: 'failed',
        proposalType,
        proposal,
        violations: [],
        error: result.error,
        timestamp: Date.now()
      };
    }
  }

  /** Route to the appropriate wallet operation based on proposal type. */
  private async executeOperation(
    proposalType: string,
    proposal: ProposalCommon
  ): Promise<{ success: boolean; txHash?: string; error?: string }> {
    switch (proposalType) {
      case 'payment': {
        const p = proposal as PaymentProposal;
        return this.wallet.sendTransaction(p.chain, p.to, BigInt(p.amount), p.symbol);
      }
      case 'swap': {
        const p = proposal as SwapProposal;
        return this.wallet.swap(p.chain, p.symbol, p.toSymbol, BigInt(p.amount));
      }
      case 'bridge': {
        const p = proposal as BridgeProposal;
        return this.wallet.bridge(p.fromChain, p.toChain, p.symbol, BigInt(p.amount));
      }
      case 'yield': {
        const p = proposal as YieldProposal;
        if (p.action === 'deposit') {
          return this.wallet.deposit(p.chain, p.symbol, BigInt(p.amount), p.protocol);
        } else {
          return this.wallet.withdraw(p.chain, p.symbol, BigInt(p.amount), p.protocol);
        }
      }
      case 'feedback': {
        const p = proposal as FeedbackProposal;
        return this.wallet.giveFeedback(
          p.chain, p.targetAgentId, p.feedbackValue, 2,
          p.tag1, p.tag2, p.endpoint, p.feedbackURI, p.feedbackHash
        );
      }
      case 'rgb_issue': {
        const p = proposal as RGBIssueProposal;
        return this.wallet.rgbIssueAsset(p.ticker, p.name, BigInt(p.amount), p.precision);
      }
      case 'rgb_transfer': {
        const p = proposal as RGBTransferProposal;
        return this.wallet.rgbTransfer(p.invoice, BigInt(p.amount), p.symbol);
      }
      default:
        return { success: false, error: `Unknown proposal type: ${proposalType}` };
    }
  }
}

// Re-export for backward compatibility
export { ProposalExecutor as PaymentExecutor };
