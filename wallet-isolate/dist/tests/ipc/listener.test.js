/**
 * IPC Listener Tests — Prove malformed messages are dropped.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IPCListener } from '../../src/ipc/listener.js';
describe('IPCListener: valid messages', () => {
    it('parses valid propose_payment', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line) => malformed.push(line));
        const validMsg = JSON.stringify({
            id: 'test-1',
            type: 'propose_payment',
            payload: {
                to: '0x1234567890abcdef1234567890abcdef12345678',
                amount: '1000000',
                symbol: 'USDT',
                chain: 'ethereum',
                reason: 'Test',
                confidence: 0.8,
                strategy: 'threshold',
                timestamp: Date.now()
            }
        });
        listener.feed(validMsg + '\n');
        assert.equal(messages.length, 1);
        assert.equal(malformed.length, 0);
        assert.equal(messages[0].type, 'propose_payment');
    });
    it('parses valid query_balance', () => {
        const messages = [];
        const listener = new IPCListener((req) => messages.push(req), () => { });
        listener.feed(JSON.stringify({
            id: 'q-1',
            type: 'query_balance',
            payload: { chain: 'ethereum', symbol: 'USDT' }
        }) + '\n');
        assert.equal(messages.length, 1);
        assert.equal(messages[0].type, 'query_balance');
    });
    it('handles multiple messages in one chunk', () => {
        const messages = [];
        const listener = new IPCListener((req) => messages.push(req), () => { });
        const msg1 = JSON.stringify({ id: '1', type: 'query_address', payload: { chain: 'ethereum' } });
        const msg2 = JSON.stringify({ id: '2', type: 'query_policy', payload: {} });
        listener.feed(msg1 + '\n' + msg2 + '\n');
        assert.equal(messages.length, 2);
    });
    it('handles split messages across chunks', () => {
        const messages = [];
        const listener = new IPCListener((req) => messages.push(req), () => { });
        const full = JSON.stringify({ id: '1', type: 'query_address', payload: { chain: 'bitcoin' } });
        const half = Math.floor(full.length / 2);
        listener.feed(full.slice(0, half));
        assert.equal(messages.length, 0); // Not yet complete
        listener.feed(full.slice(half) + '\n');
        assert.equal(messages.length, 1);
    });
});
describe('IPCListener: malformed messages', () => {
    it('drops invalid JSON', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line, error) => malformed.push({ line, error }));
        listener.feed('this is not json\n');
        assert.equal(messages.length, 0);
        assert.equal(malformed.length, 1);
        assert.match(malformed[0].error, /Invalid JSON/);
    });
    it('drops message with missing id', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line, error) => malformed.push({ line, error }));
        listener.feed(JSON.stringify({ type: 'query_address', payload: { chain: 'ethereum' } }) + '\n');
        assert.equal(messages.length, 0);
        assert.equal(malformed.length, 1);
    });
    it('drops message with invalid type', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line, error) => malformed.push({ line, error }));
        listener.feed(JSON.stringify({ id: '1', type: 'hack_wallet', payload: {} }) + '\n');
        assert.equal(messages.length, 0);
        assert.equal(malformed.length, 1);
    });
    it('drops propose_payment with invalid proposal', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line, error) => malformed.push({ line, error }));
        // Missing required fields
        listener.feed(JSON.stringify({
            id: '1',
            type: 'propose_payment',
            payload: { to: '0x123', amount: 'not-a-number' }
        }) + '\n');
        assert.equal(messages.length, 0);
        assert.equal(malformed.length, 1);
    });
    it('drops proposal with negative amount', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line, error) => malformed.push({ line, error }));
        listener.feed(JSON.stringify({
            id: '1',
            type: 'propose_payment',
            payload: {
                to: '0x1234567890abcdef1234567890abcdef12345678',
                amount: '-1000',
                symbol: 'USDT',
                chain: 'ethereum',
                reason: 'steal',
                confidence: 0.9,
                strategy: 'attack',
                timestamp: Date.now()
            }
        }) + '\n');
        assert.equal(messages.length, 0);
        assert.equal(malformed.length, 1);
    });
    it('drops proposal with invalid confidence', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line, error) => malformed.push({ line, error }));
        listener.feed(JSON.stringify({
            id: '1',
            type: 'propose_payment',
            payload: {
                to: '0x1234567890abcdef1234567890abcdef12345678',
                amount: '1000000',
                symbol: 'USDT',
                chain: 'ethereum',
                reason: 'test',
                confidence: 1.5, // Invalid: > 1.0
                strategy: 'test',
                timestamp: Date.now()
            }
        }) + '\n');
        assert.equal(messages.length, 0);
        assert.equal(malformed.length, 1);
    });
    it('ignores empty lines', () => {
        const messages = [];
        const malformed = [];
        const listener = new IPCListener((req) => messages.push(req), (line, error) => malformed.push({ line, error }));
        listener.feed('\n\n\n');
        assert.equal(messages.length, 0);
        assert.equal(malformed.length, 0);
    });
});
//# sourceMappingURL=listener.test.js.map