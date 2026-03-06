/**
 * Executor Tests — Prove that rejected proposals NEVER sign.
 *
 * This is the second most critical test file. The invariant:
 * PolicyEngine says no → no transaction is sent. Period.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProposalExecutor } from '../../src/executor/executor.js';
import { PolicyEngine } from '../../src/policies/engine.js';
import { AuditLog } from '../../src/audit/log.js';
import { MockWalletManager } from '../../src/wallet/manager.js';
import type { PaymentProposal } from '../../src/ipc/types.js';

function makeProposal(overrides: Partial<PaymentProposal> = {}): PaymentProposal {
  return {
    to: '0x1234567890abcdef1234567890abcdef12345678',
    amount: '1000000',
    symbol: 'USDT',
    chain: 'ethereum',
    reason: 'Test tip',
    confidence: 0.85,
    strategy: 'test',
    timestamp: Date.now(),
    ...overrides
  };
}

async function createTestExecutor() {
  const auditLines: string[] = [];
  const audit = new AuditLog((line) => auditLines.push(line));

  const wallet = new MockWalletManager();
  await wallet.initialize('test-seed', [{ chain: 'ethereum' }]);

  return { auditLines, audit, wallet };
}

describe('ProposalExecutor: rejected proposals never sign', () => {
  it('returns rejected status when policy fails', async () => {
    const { audit, wallet } = await createTestExecutor();
    const policy = new PolicyEngine({
      policies: [{ id: 'strict', name: 'Strict', rules: [
        { type: 'max_per_tx', amount: '500000', symbol: 'USDT' } // 0.5 USDT max
      ]}]
    });
    const executor = new ProposalExecutor(policy, wallet, audit);

    const result = await executor.execute('payment', makeProposal({ amount: '1000000' })); // 1 USDT > 0.5

    assert.equal(result.status, 'rejected');
    assert.ok(result.violations.length > 0);
    assert.equal(result.txHash, undefined);
  });

  it('does not deduct balance on rejection', async () => {
    const { audit, wallet } = await createTestExecutor();
    const policy = new PolicyEngine({
      policies: [{ id: 'strict', name: 'Strict', rules: [
        { type: 'max_per_tx', amount: '500000', symbol: 'USDT' }
      ]}]
    });
    const executor = new ProposalExecutor(policy, wallet, audit);

    const balanceBefore = await wallet.getBalance('ethereum', 'USDT');
    await executor.execute('payment', makeProposal({ amount: '1000000' }));
    const balanceAfter = await wallet.getBalance('ethereum', 'USDT');

    assert.equal(balanceBefore.raw, balanceAfter.raw);
  });

  it('executes transaction when policy approves', async () => {
    const { audit, wallet } = await createTestExecutor();
    const policy = new PolicyEngine({
      policies: [{ id: 'lenient', name: 'Lenient', rules: [
        { type: 'max_per_tx', amount: '10000000', symbol: 'USDT' }
      ]}]
    });
    const executor = new ProposalExecutor(policy, wallet, audit);

    const result = await executor.execute('payment', makeProposal({ amount: '1000000' }));

    assert.equal(result.status, 'executed');
    assert.ok(result.txHash);
    assert.equal(result.violations.length, 0);
  });

  it('returns failed status on transaction error', async () => {
    const { audit, wallet } = await createTestExecutor();
    const policy = new PolicyEngine({ policies: [] }); // No rules = approve all
    const executor = new ProposalExecutor(policy, wallet, audit);

    // Try to send more than mock balance
    const result = await executor.execute('payment', makeProposal({
      amount: '999999999999'
    }));

    assert.equal(result.status, 'failed');
    assert.ok(result.error);
    assert.equal(result.txHash, undefined);
  });

  it('logs all outcomes to audit trail', async () => {
    const { audit, wallet, auditLines } = await createTestExecutor();
    const policy = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_tx', amount: '5000000', symbol: 'USDT' }
      ]}]
    });
    const executor = new ProposalExecutor(policy, wallet, audit);

    // Approved transaction
    await executor.execute('payment', makeProposal({ amount: '1000000' }));
    // Rejected transaction
    await executor.execute('payment', makeProposal({ amount: '9000000' }));

    // Should have: proposal_received, execution_success, proposal_received, policy_enforcement
    assert.ok(auditLines.length >= 4);

    const entries = auditLines.map(l => JSON.parse(l));
    const types = entries.map((e: { type: string }) => e.type);
    assert.ok(types.includes('proposal_received'));
    assert.ok(types.includes('execution_success'));
    assert.ok(types.includes('policy_enforcement'));
  });
});

describe('ProposalExecutor: confidence rejection', () => {
  it('rejects low-confidence proposals', async () => {
    const { audit, wallet } = await createTestExecutor();
    const policy = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'require_confidence', min: 0.8 }
      ]}]
    });
    const executor = new ProposalExecutor(policy, wallet, audit);

    const result = await executor.execute('payment', makeProposal({ confidence: 0.5 }));

    assert.equal(result.status, 'rejected');
    assert.match(result.violations[0]!, /require_confidence/);
    assert.equal(result.txHash, undefined);
  });
});

describe('ProposalExecutor: session budget exhaustion', () => {
  it('rejects after session budget is spent', async () => {
    const { audit, wallet } = await createTestExecutor();
    const policy = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_session', amount: '3000000', symbol: 'USDT' }
      ]}]
    });
    const executor = new ProposalExecutor(policy, wallet, audit);

    // Send 2 USDT — approved
    const r1 = await executor.execute('payment', makeProposal({ amount: '2000000' }));
    assert.equal(r1.status, 'executed');

    // Send 2 USDT — rejected (session total would be 4 > 3)
    const r2 = await executor.execute('payment', makeProposal({ amount: '2000000' }));
    assert.equal(r2.status, 'rejected');
    assert.equal(r2.txHash, undefined);
  });
});
