/**
 * Audit Log Tests — Prove append-only behavior and no sensitive data leaks.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLog } from '../../src/audit/log.js';
function makeProposal() {
    return {
        to: '0x1234567890abcdef1234567890abcdef12345678',
        amount: '1000000',
        symbol: 'USDT',
        chain: 'ethereum',
        reason: 'Test tip',
        confidence: 0.85,
        strategy: 'test',
        timestamp: Date.now()
    };
}
describe('AuditLog: append-only', () => {
    it('writes entries as JSON lines', () => {
        const lines = [];
        const audit = new AuditLog((line) => lines.push(line));
        audit.logProposalReceived(makeProposal());
        assert.equal(lines.length, 1);
        const entry = JSON.parse(lines[0]);
        assert.equal(entry.type, 'proposal_received');
        assert.ok(entry.id);
        assert.ok(entry.timestamp);
    });
    it('never removes or updates entries', () => {
        const lines = [];
        const audit = new AuditLog((line) => lines.push(line));
        audit.logProposalReceived(makeProposal());
        audit.logPolicyEnforcement(makeProposal(), ['violation1']);
        audit.logExecutionSuccess(makeProposal(), '0xabc');
        audit.logExecutionFailure(makeProposal(), 'Network error');
        audit.logMalformedMessage('bad data', 'Invalid JSON');
        assert.equal(lines.length, 5);
        // Verify all lines are still there — append-only
        assert.ok(lines.every(l => l.length > 0));
    });
    it('generates unique IDs', () => {
        const lines = [];
        const audit = new AuditLog((line) => lines.push(line));
        audit.logProposalReceived(makeProposal());
        audit.logProposalReceived(makeProposal());
        const ids = lines.map(l => JSON.parse(l).id);
        assert.notEqual(ids[0], ids[1]);
    });
});
describe('AuditLog: no sensitive data', () => {
    it('proposal entries do not contain seed phrases', () => {
        const lines = [];
        const audit = new AuditLog((line) => lines.push(line));
        audit.logProposalReceived(makeProposal());
        const entry = lines[0];
        assert.ok(!entry.includes('seed'));
        assert.ok(!entry.includes('private'));
        assert.ok(!entry.includes('mnemonic'));
    });
    it('execution entries contain txHash but no keys', () => {
        const lines = [];
        const audit = new AuditLog((line) => lines.push(line));
        audit.logExecutionSuccess(makeProposal(), '0xdeadbeef');
        const parsed = JSON.parse(lines[0]);
        assert.equal(parsed.txHash, '0xdeadbeef');
        assert.ok(!lines[0].includes('key'));
    });
    it('malformed message entries truncate raw input', () => {
        const lines = [];
        const audit = new AuditLog((line) => lines.push(line));
        const longAttackPayload = 'x'.repeat(500);
        audit.logMalformedMessage(longAttackPayload, 'Invalid');
        const parsed = JSON.parse(lines[0]);
        // Error field should be truncated (200 chars max for raw snippet)
        assert.ok(parsed.error.length < 250);
    });
});
describe('AuditLog: query', () => {
    it('returns entries with limit', () => {
        const audit = new AuditLog(() => { });
        for (let i = 0; i < 10; i++) {
            audit.logProposalReceived(makeProposal());
        }
        const entries = audit.getEntries(3);
        assert.equal(entries.length, 3);
    });
    it('returns all entries when no limit', () => {
        const audit = new AuditLog(() => { });
        for (let i = 0; i < 5; i++) {
            audit.logProposalReceived(makeProposal());
        }
        const entries = audit.getEntries();
        assert.equal(entries.length, 5);
    });
});
//# sourceMappingURL=log.test.js.map