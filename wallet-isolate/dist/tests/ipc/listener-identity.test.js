/**
 * IPC Listener Identity Tests — ERC-8004 message validation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IPCListener } from '../../src/ipc/listener.js';
describe('IPCListener: identity messages', () => {
    it('parses valid identity_register', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line) => malformed.push(line));
        const msg = JSON.stringify({
            id: 'id-1',
            type: 'identity_register',
            payload: {
                agentURI: 'http://localhost:3420/agent-card.json',
                chain: 'ethereum',
            }
        });
        listener.feed(msg + '\n');
        assert.equal(messages.length, 1);
        assert.equal(malformed.length, 0);
        assert.equal(messages[0].type, 'identity_register');
    });
    it('parses valid identity_set_wallet', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line) => malformed.push(line));
        const msg = JSON.stringify({
            id: 'id-2',
            type: 'identity_set_wallet',
            payload: {
                agentId: '42',
                deadline: Math.floor(Date.now() / 1000) + 3600,
                chain: 'ethereum',
            }
        });
        listener.feed(msg + '\n');
        assert.equal(messages.length, 1);
        assert.equal(malformed.length, 0);
        assert.equal(messages[0].type, 'identity_set_wallet');
    });
    it('parses valid propose_feedback', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line) => malformed.push(line));
        const msg = JSON.stringify({
            id: 'fb-1',
            type: 'propose_feedback',
            payload: {
                amount: '0',
                symbol: 'USDT',
                chain: 'ethereum',
                reason: 'Settlement feedback',
                confidence: 1.0,
                strategy: 'reputation',
                timestamp: Date.now(),
                targetAgentId: 'peer-123',
                feedbackValue: 100,
                tag1: 'settlement',
                tag2: 'success',
                endpoint: '',
                feedbackURI: '',
                feedbackHash: '',
            }
        });
        listener.feed(msg + '\n');
        assert.equal(messages.length, 1);
        assert.equal(malformed.length, 0);
        assert.equal(messages[0].type, 'propose_feedback');
    });
    it('parses valid query_reputation', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line) => malformed.push(line));
        const msg = JSON.stringify({
            id: 'rep-1',
            type: 'query_reputation',
            payload: {
                agentId: '42',
                chain: 'ethereum',
            }
        });
        listener.feed(msg + '\n');
        assert.equal(messages.length, 1);
        assert.equal(malformed.length, 0);
        assert.equal(messages[0].type, 'query_reputation');
    });
    it('rejects identity_register with missing agentURI', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line) => malformed.push(line));
        const msg = JSON.stringify({
            id: 'bad-1',
            type: 'identity_register',
            payload: { chain: 'ethereum' }
        });
        listener.feed(msg + '\n');
        assert.equal(messages.length, 0);
        assert.equal(malformed.length, 1);
    });
});
//# sourceMappingURL=listener-identity.test.js.map