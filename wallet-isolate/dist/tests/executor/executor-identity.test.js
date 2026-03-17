/**
 * Executor Identity Tests — ERC-8004 feedback proposals through PolicyEngine.
 *
 * CRITICAL INVARIANT: A rejected propose_feedback NEVER calls giveFeedback.
 * Identity lifecycle ops (register, setWallet) are tested as mock wallet ops.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProposalExecutor } from '../../src/executor/executor.js';
import { PolicyEngine } from '../../src/policies/engine.js';
import { AuditLog } from '../../src/audit/log.js';
import { MockWalletManager } from '../../src/wallet/manager.js';
function makeFeedback(overrides = {}) {
    return {
        amount: '0',
        symbol: 'USDT',
        chain: 'ethereum',
        reason: 'Settlement feedback',
        confidence: 1.0,
        strategy: 'reputation',
        timestamp: Date.now(),
        targetAgentId: 'peer-abc-123',
        feedbackValue: 100,
        tag1: 'settlement',
        tag2: 'success',
        endpoint: '',
        feedbackURI: '',
        feedbackHash: '',
        ...overrides,
    };
}
async function createTestExecutor() {
    const auditLines = [];
    const audit = new AuditLog((line) => auditLines.push(line));
    const wallet = new MockWalletManager();
    await wallet.initialize('test-seed', [{ chain: 'ethereum' }]);
    return { auditLines, audit, wallet };
}
// ── Feedback execution ──
describe('ProposalExecutor: feedback operations', () => {
    it('rejects feedback when policy fails', async () => {
        const { audit, wallet } = await createTestExecutor();
        const policy = new PolicyEngine({
            policies: [{ id: 'strict', name: 'Strict', rules: [
                        { type: 'require_confidence', min: 0.95 }
                    ] }]
        });
        const executor = new ProposalExecutor(policy, wallet, audit);
        const result = await executor.execute('feedback', makeFeedback({ confidence: 0.5 }));
        assert.equal(result.status, 'rejected');
        assert.ok(result.violations.length > 0);
        assert.equal(result.txHash, undefined);
    });
    it('executes approved feedback', async () => {
        const { audit, wallet } = await createTestExecutor();
        const policy = new PolicyEngine({ policies: [] }); // No rules = approve all
        const executor = new ProposalExecutor(policy, wallet, audit);
        const result = await executor.execute('feedback', makeFeedback());
        assert.equal(result.status, 'executed');
        assert.ok(result.txHash);
        assert.equal(result.proposalType, 'feedback');
    });
    it('records feedback in audit trail', async () => {
        const { audit, wallet, auditLines } = await createTestExecutor();
        const policy = new PolicyEngine({ policies: [] });
        const executor = new ProposalExecutor(policy, wallet, audit);
        await executor.execute('feedback', makeFeedback());
        // proposal_received + execution_success = 2 entries
        assert.ok(auditLines.length >= 2);
        const entries = auditLines.map(l => JSON.parse(l));
        assert.ok(entries.some((e) => e.type === 'proposal_received'));
        assert.ok(entries.some((e) => e.type === 'execution_success'));
    });
});
// ── Mock identity operations ──
describe('MockWalletManager: ERC-8004 identity ops', () => {
    it('registerIdentity returns incrementing agentIds', async () => {
        const wallet = new MockWalletManager();
        await wallet.initialize('test-seed', [{ chain: 'ethereum' }]);
        const r1 = await wallet.registerIdentity('ethereum', 'http://localhost:3420/agent-card.json');
        assert.equal(r1.success, true);
        assert.ok(r1.agentId);
        assert.ok(r1.txHash);
        const r2 = await wallet.registerIdentity('ethereum', 'http://localhost:3421/agent-card.json');
        assert.equal(r2.success, true);
        assert.notEqual(r1.agentId, r2.agentId);
    });
    it('setAgentWallet returns success', async () => {
        const wallet = new MockWalletManager();
        await wallet.initialize('test-seed', [{ chain: 'ethereum' }]);
        const result = await wallet.setAgentWallet('ethereum', '1', Math.floor(Date.now() / 1000) + 3600);
        assert.equal(result.success, true);
        assert.ok(result.txHash);
    });
    it('giveFeedback stores and getOnChainReputation retrieves', async () => {
        const wallet = new MockWalletManager();
        await wallet.initialize('test-seed', [{ chain: 'ethereum' }]);
        // Give feedback
        const r1 = await wallet.giveFeedback('ethereum', 'agent-42', 100, 2, 'tag1', 'tag2', '', '', '');
        assert.equal(r1.success, true);
        const r2 = await wallet.giveFeedback('ethereum', 'agent-42', 80, 2, 'tag1', 'tag2', '', '', '');
        assert.equal(r2.success, true);
        // Query reputation
        const rep = await wallet.getOnChainReputation('ethereum', 'agent-42');
        assert.equal(rep.feedbackCount, 2);
        assert.equal(rep.totalValue, '180'); // 100 + 80
        assert.equal(rep.valueDecimals, 2);
    });
    it('getOnChainReputation returns zero for unknown agent', async () => {
        const wallet = new MockWalletManager();
        await wallet.initialize('test-seed', [{ chain: 'ethereum' }]);
        const rep = await wallet.getOnChainReputation('ethereum', 'nonexistent');
        assert.equal(rep.feedbackCount, 0);
        assert.equal(rep.totalValue, '0');
    });
});
// ── Audit for identity ops ──
describe('AuditLog: identity operations', () => {
    it('logs identity operations', () => {
        const auditLines = [];
        const audit = new AuditLog((line) => auditLines.push(line));
        audit.logIdentityOperation('identity_register', { success: true, txHash: '0xabc', agentId: '1' });
        audit.logIdentityOperation('identity_set_wallet', { success: true, txHash: '0xdef' });
        assert.equal(auditLines.length, 2);
        const entries = auditLines.map(l => JSON.parse(l));
        assert.equal(entries[0]?.type, 'identity_operation');
        assert.equal(entries[0]?.proposalType, 'identity_register');
        assert.equal(entries[1]?.type, 'identity_operation');
        assert.equal(entries[1]?.proposalType, 'identity_set_wallet');
    });
});
//# sourceMappingURL=executor-identity.test.js.map