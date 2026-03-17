/**
 * Executor DeFi Tests — CRITICAL: rejected DeFi ops NEVER execute.
 *
 * The invariant: PolicyEngine says no → no wallet operation is called.
 * This applies to swaps, bridges, and yield deposits/withdrawals.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProposalExecutor } from '../../src/executor/executor.js';
import { PolicyEngine } from '../../src/policies/engine.js';
import { AuditLog } from '../../src/audit/log.js';
import { MockWalletManager } from '../../src/wallet/manager.js';
function makeSwap(overrides = {}) {
    return {
        amount: '5000000',
        symbol: 'USDT',
        chain: 'ethereum',
        toSymbol: 'XAUT',
        reason: 'Portfolio diversification',
        confidence: 0.85,
        strategy: 'rebalance',
        timestamp: Date.now(),
        ...overrides,
    };
}
function makeBridge(overrides = {}) {
    return {
        amount: '3000000',
        symbol: 'USDT',
        chain: 'ethereum',
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        reason: 'Gas optimization',
        confidence: 0.9,
        strategy: 'bridge',
        timestamp: Date.now(),
        ...overrides,
    };
}
function makeYield(overrides = {}) {
    return {
        amount: '10000000',
        symbol: 'USDT',
        chain: 'ethereum',
        protocol: 'aave',
        action: 'deposit',
        reason: 'Earn yield',
        confidence: 0.88,
        strategy: 'yield',
        timestamp: Date.now(),
        ...overrides,
    };
}
async function createTestExecutor() {
    const auditLines = [];
    const audit = new AuditLog((line) => auditLines.push(line));
    const wallet = new MockWalletManager();
    await wallet.initialize('test-seed', [
        { chain: 'ethereum' },
        { chain: 'arbitrum' },
    ]);
    return { auditLines, audit, wallet };
}
// ── Swap execution ──
describe('ProposalExecutor DeFi: swap operations', () => {
    it('rejects swap when policy fails', async () => {
        const { audit, wallet } = await createTestExecutor();
        const policy = new PolicyEngine({
            policies: [{ id: 'strict', name: 'Strict', rules: [
                        { type: 'max_per_tx', amount: '2000000', symbol: 'USDT' }
                    ] }]
        });
        const executor = new ProposalExecutor(policy, wallet, audit);
        const result = await executor.execute('swap', makeSwap({ amount: '5000000' }));
        assert.equal(result.status, 'rejected');
        assert.ok(result.violations.length > 0);
        assert.equal(result.txHash, undefined);
    });
    it('does not change balances on rejected swap', async () => {
        const { audit, wallet } = await createTestExecutor();
        const policy = new PolicyEngine({
            policies: [{ id: 'strict', name: 'Strict', rules: [
                        { type: 'max_per_tx', amount: '1000000', symbol: 'USDT' }
                    ] }]
        });
        const executor = new ProposalExecutor(policy, wallet, audit);
        const balanceBefore = await wallet.getBalance('ethereum', 'USDT');
        await executor.execute('swap', makeSwap({ amount: '5000000' }));
        const balanceAfter = await wallet.getBalance('ethereum', 'USDT');
        assert.equal(balanceBefore.raw, balanceAfter.raw);
    });
    it('executes approved swap and changes balances', async () => {
        const { audit, wallet } = await createTestExecutor();
        const policy = new PolicyEngine({ policies: [] }); // No rules = approve all
        const executor = new ProposalExecutor(policy, wallet, audit);
        const usdtBefore = await wallet.getBalance('ethereum', 'USDT');
        const result = await executor.execute('swap', makeSwap({
            amount: '5000000', // 5 USDT
            symbol: 'USDT',
            toSymbol: 'XAUT',
        }));
        assert.equal(result.status, 'executed');
        assert.ok(result.txHash);
        const usdtAfter = await wallet.getBalance('ethereum', 'USDT');
        assert.ok(usdtAfter.raw < usdtBefore.raw);
    });
});
// ── Bridge execution ──
describe('ProposalExecutor DeFi: bridge operations', () => {
    it('rejects bridge when policy fails', async () => {
        const { audit, wallet } = await createTestExecutor();
        const policy = new PolicyEngine({
            policies: [{ id: 'strict', name: 'Strict', rules: [
                        { type: 'max_per_tx', amount: '1000000', symbol: 'USDT' }
                    ] }]
        });
        const executor = new ProposalExecutor(policy, wallet, audit);
        const result = await executor.execute('bridge', makeBridge({ amount: '3000000' }));
        assert.equal(result.status, 'rejected');
        assert.equal(result.txHash, undefined);
    });
    it('executes approved bridge', async () => {
        const { audit, wallet } = await createTestExecutor();
        const policy = new PolicyEngine({ policies: [] });
        const executor = new ProposalExecutor(policy, wallet, audit);
        const result = await executor.execute('bridge', makeBridge({
            amount: '3000000',
            fromChain: 'ethereum',
            toChain: 'arbitrum',
        }));
        assert.equal(result.status, 'executed');
        assert.ok(result.txHash);
    });
});
// ── Yield execution ──
describe('ProposalExecutor DeFi: yield operations', () => {
    it('rejects yield deposit when policy fails', async () => {
        const { audit, wallet } = await createTestExecutor();
        const policy = new PolicyEngine({
            policies: [{ id: 'strict', name: 'Strict', rules: [
                        { type: 'max_per_tx', amount: '5000000', symbol: 'USDT' }
                    ] }]
        });
        const executor = new ProposalExecutor(policy, wallet, audit);
        const result = await executor.execute('yield', makeYield({ amount: '10000000' }));
        assert.equal(result.status, 'rejected');
        assert.equal(result.txHash, undefined);
    });
    it('executes approved yield deposit', async () => {
        const { audit, wallet } = await createTestExecutor();
        const policy = new PolicyEngine({ policies: [] });
        const executor = new ProposalExecutor(policy, wallet, audit);
        const result = await executor.execute('yield', makeYield({
            action: 'deposit',
            amount: '10000000',
        }));
        assert.equal(result.status, 'executed');
        assert.ok(result.txHash);
    });
    it('executes approved yield withdrawal', async () => {
        const { audit, wallet } = await createTestExecutor();
        const policy = new PolicyEngine({ policies: [] });
        const executor = new ProposalExecutor(policy, wallet, audit);
        const result = await executor.execute('yield', makeYield({
            action: 'withdraw',
            amount: '5000000',
        }));
        assert.equal(result.status, 'executed');
        assert.ok(result.txHash);
    });
    it('records proposalType in result', async () => {
        const { audit, wallet } = await createTestExecutor();
        const policy = new PolicyEngine({ policies: [] });
        const executor = new ProposalExecutor(policy, wallet, audit);
        const r1 = await executor.execute('swap', makeSwap());
        assert.equal(r1.proposalType, 'swap');
        const r2 = await executor.execute('bridge', makeBridge());
        assert.equal(r2.proposalType, 'bridge');
        const r3 = await executor.execute('yield', makeYield());
        assert.equal(r3.proposalType, 'yield');
    });
});
// ── Audit trail ──
describe('ProposalExecutor DeFi: audit trail', () => {
    it('logs DeFi operations to audit', async () => {
        const { audit, wallet, auditLines } = await createTestExecutor();
        const policy = new PolicyEngine({ policies: [] });
        const executor = new ProposalExecutor(policy, wallet, audit);
        await executor.execute('swap', makeSwap());
        await executor.execute('bridge', makeBridge());
        await executor.execute('yield', makeYield());
        // 3 operations: each gets proposal_received + execution_success = 6 entries
        assert.ok(auditLines.length >= 6);
        const entries = auditLines.map(l => JSON.parse(l));
        const types = entries.map((e) => e.type);
        assert.ok(types.filter((t) => t === 'proposal_received').length >= 3);
        assert.ok(types.filter((t) => t === 'execution_success').length >= 3);
    });
});
//# sourceMappingURL=executor-defi.test.js.map