/**
 * PolicyEngine Tests — MOST CRITICAL TESTS IN THE PROJECT.
 *
 * 100% rule coverage. Every rule type tested with pass and fail cases.
 * Edge cases for budget exhaustion, cooldown boundaries, confidence thresholds.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyEngine } from '../../src/policies/engine.js';
function makeProposal(overrides = {}) {
    return {
        to: '0x1234567890abcdef1234567890abcdef12345678',
        amount: '1000000', // 1 USDT
        symbol: 'USDT',
        chain: 'ethereum',
        reason: 'Test tip',
        confidence: 0.85,
        strategy: 'test',
        timestamp: Date.now(),
        ...overrides
    };
}
// ── max_per_tx ──
describe('PolicyEngine: max_per_tx', () => {
    it('approves amount under limit', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'max_per_tx', amount: '5000000', symbol: 'USDT' }
                    ] }]
        });
        const result = engine.evaluate(makeProposal({ amount: '3000000' }));
        assert.equal(result.approved, true);
        assert.equal(result.violations.length, 0);
    });
    it('approves amount at exact limit', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'max_per_tx', amount: '5000000', symbol: 'USDT' }
                    ] }]
        });
        const result = engine.evaluate(makeProposal({ amount: '5000000' }));
        assert.equal(result.approved, true);
    });
    it('rejects amount over limit', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'max_per_tx', amount: '5000000', symbol: 'USDT' }
                    ] }]
        });
        const result = engine.evaluate(makeProposal({ amount: '5000001' }));
        assert.equal(result.approved, false);
        assert.equal(result.violations.length, 1);
        assert.match(result.violations[0], /max_per_tx/);
    });
    it('ignores rule for different symbol', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'max_per_tx', amount: '5000000', symbol: 'USDT' }
                    ] }]
        });
        const result = engine.evaluate(makeProposal({ amount: '99000000', symbol: 'BTC' }));
        assert.equal(result.approved, true);
    });
});
// ── max_per_session ──
describe('PolicyEngine: max_per_session', () => {
    it('approves first transaction under session limit', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'max_per_session', amount: '10000000', symbol: 'USDT' }
                    ] }]
        });
        const result = engine.evaluate(makeProposal({ amount: '5000000' }));
        assert.equal(result.approved, true);
    });
    it('rejects when cumulative session total exceeds limit', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'max_per_session', amount: '10000000', symbol: 'USDT' }
                    ] }]
        });
        // First 5 USDT — approved
        const r1 = engine.evaluate(makeProposal({ amount: '5000000' }));
        assert.equal(r1.approved, true);
        engine.recordExecution(makeProposal({ amount: '5000000' }));
        // Second 5 USDT — approved (total = 10)
        const r2 = engine.evaluate(makeProposal({ amount: '5000000' }));
        assert.equal(r2.approved, true);
        engine.recordExecution(makeProposal({ amount: '5000000' }));
        // Third 1 USDT — rejected (total would be 11)
        const r3 = engine.evaluate(makeProposal({ amount: '1000000' }));
        assert.equal(r3.approved, false);
        assert.match(r3.violations[0], /max_per_session/);
    });
});
// ── max_per_day ──
describe('PolicyEngine: max_per_day', () => {
    it('rejects when daily total exceeds limit', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'max_per_day', amount: '10000000', symbol: 'USDT' }
                    ] }]
        });
        engine.recordExecution(makeProposal({ amount: '9000000' }));
        const result = engine.evaluate(makeProposal({ amount: '2000000' }));
        assert.equal(result.approved, false);
        assert.match(result.violations[0], /max_per_day/);
    });
    it('resets daily total at day boundary', () => {
        let mockTime = new Date('2026-03-05T23:59:00Z').getTime();
        const engine = new PolicyEngine({ policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'max_per_day', amount: '10000000', symbol: 'USDT' }
                    ] }] }, () => mockTime);
        engine.recordExecution(makeProposal({ amount: '9000000' }));
        // Cross day boundary
        mockTime = new Date('2026-03-06T00:01:00Z').getTime();
        const result = engine.evaluate(makeProposal({ amount: '5000000' }));
        assert.equal(result.approved, true);
    });
});
// ── max_per_recipient_per_day ──
describe('PolicyEngine: max_per_recipient_per_day', () => {
    it('tracks per-recipient spending separately', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'max_per_recipient_per_day', amount: '5000000', symbol: 'USDT' }
                    ] }]
        });
        const addr1 = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        const addr2 = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
        engine.recordExecution(makeProposal({ to: addr1, amount: '4000000' }));
        // Same recipient, would exceed
        const r1 = engine.evaluate(makeProposal({ to: addr1, amount: '2000000' }));
        assert.equal(r1.approved, false);
        // Different recipient, should pass
        const r2 = engine.evaluate(makeProposal({ to: addr2, amount: '4000000' }));
        assert.equal(r2.approved, true);
    });
});
// ── cooldown_seconds ──
describe('PolicyEngine: cooldown_seconds', () => {
    it('rejects during cooldown period', () => {
        let mockTime = 1000000;
        const engine = new PolicyEngine({ policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'cooldown_seconds', seconds: 30 }
                    ] }] }, () => mockTime);
        engine.recordExecution(makeProposal());
        // 10 seconds later — too soon
        mockTime += 10_000;
        const result = engine.evaluate(makeProposal());
        assert.equal(result.approved, false);
        assert.match(result.violations[0], /cooldown_seconds/);
    });
    it('approves after cooldown expires', () => {
        let mockTime = 1000000;
        const engine = new PolicyEngine({ policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'cooldown_seconds', seconds: 30 }
                    ] }] }, () => mockTime);
        engine.recordExecution(makeProposal());
        // 31 seconds later — okay
        mockTime += 31_000;
        const result = engine.evaluate(makeProposal());
        assert.equal(result.approved, true);
    });
    it('approves first transaction (no prior cooldown)', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'cooldown_seconds', seconds: 30 }
                    ] }]
        });
        const result = engine.evaluate(makeProposal());
        assert.equal(result.approved, true);
    });
});
// ── require_confidence ──
describe('PolicyEngine: require_confidence', () => {
    it('approves high confidence', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'require_confidence', min: 0.7 }
                    ] }]
        });
        const result = engine.evaluate(makeProposal({ confidence: 0.9 }));
        assert.equal(result.approved, true);
    });
    it('rejects low confidence', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'require_confidence', min: 0.7 }
                    ] }]
        });
        const result = engine.evaluate(makeProposal({ confidence: 0.5 }));
        assert.equal(result.approved, false);
        assert.match(result.violations[0], /require_confidence/);
    });
    it('approves exact minimum', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'require_confidence', min: 0.7 }
                    ] }]
        });
        const result = engine.evaluate(makeProposal({ confidence: 0.7 }));
        assert.equal(result.approved, true);
    });
});
// ── whitelist_recipients ──
describe('PolicyEngine: whitelist_recipients', () => {
    const config = {
        policies: [{ id: 'test', name: 'Test', rules: [
                    { type: 'whitelist_recipients', addresses: [
                            '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                            '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
                        ] }
                ] }]
    };
    it('approves whitelisted address', () => {
        const engine = new PolicyEngine(config);
        const result = engine.evaluate(makeProposal({
            to: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
        }));
        assert.equal(result.approved, true);
    });
    it('rejects non-whitelisted address', () => {
        const engine = new PolicyEngine(config);
        const result = engine.evaluate(makeProposal({
            to: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'
        }));
        assert.equal(result.approved, false);
        assert.match(result.violations[0], /whitelist_recipients/);
    });
    it('handles case-insensitive comparison', () => {
        const engine = new PolicyEngine(config);
        const result = engine.evaluate(makeProposal({
            to: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        }));
        assert.equal(result.approved, true);
    });
});
// ── time_window ──
describe('PolicyEngine: time_window', () => {
    it('approves within time window', () => {
        const mockTime = new Date('2026-03-05T14:00:00Z').getTime(); // 14:00 UTC
        const engine = new PolicyEngine({ policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'time_window', start_hour: 8, end_hour: 22, timezone: 'UTC' }
                    ] }] }, () => mockTime);
        const result = engine.evaluate(makeProposal());
        assert.equal(result.approved, true);
    });
    it('rejects outside time window', () => {
        const mockTime = new Date('2026-03-05T03:00:00Z').getTime(); // 03:00 UTC
        const engine = new PolicyEngine({ policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'time_window', start_hour: 8, end_hour: 22, timezone: 'UTC' }
                    ] }] }, () => mockTime);
        const result = engine.evaluate(makeProposal());
        assert.equal(result.approved, false);
        assert.match(result.violations[0], /time_window/);
    });
});
// ── Multiple rules combined ──
describe('PolicyEngine: combined rules', () => {
    it('reports all violations when multiple rules fail', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'max_per_tx', amount: '1000000', symbol: 'USDT' },
                        { type: 'require_confidence', min: 0.9 }
                    ] }]
        });
        const result = engine.evaluate(makeProposal({
            amount: '5000000', // Exceeds max_per_tx
            confidence: 0.5 // Below min confidence
        }));
        assert.equal(result.approved, false);
        assert.equal(result.violations.length, 2);
    });
    it('approves when all rules pass', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'max_per_tx', amount: '10000000', symbol: 'USDT' },
                        { type: 'require_confidence', min: 0.5 },
                        { type: 'cooldown_seconds', seconds: 10 }
                    ] }]
        });
        const result = engine.evaluate(makeProposal({ amount: '5000000', confidence: 0.8 }));
        assert.equal(result.approved, true);
        assert.equal(result.violations.length, 0);
    });
});
// ── Empty policies ──
describe('PolicyEngine: empty policies', () => {
    it('approves everything with no policies', () => {
        const engine = new PolicyEngine({ policies: [] });
        const result = engine.evaluate(makeProposal());
        assert.equal(result.approved, true);
    });
    it('approves everything with policy that has no rules', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'empty', name: 'Empty', rules: [] }]
        });
        const result = engine.evaluate(makeProposal());
        assert.equal(result.approved, true);
    });
});
// ── getStatus ──
describe('PolicyEngine: getStatus', () => {
    it('returns current state', () => {
        const engine = new PolicyEngine({
            policies: [{ id: 'test', name: 'Test', rules: [
                        { type: 'max_per_session', amount: '10000000', symbol: 'USDT' }
                    ] }]
        });
        engine.recordExecution(makeProposal({ amount: '3000000' }));
        const status = engine.getStatus();
        assert.equal(status.length, 1);
        assert.equal(status[0].id, 'test');
        assert.equal(status[0].name, 'Test');
    });
});
//# sourceMappingURL=engine.test.js.map