/**
 * IPC Listener DeFi Tests — Validate new message types.
 *
 * Prove malformed swap/bridge/yield messages are dropped.
 * Prove valid new message types are accepted.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IPCListener } from '../../src/ipc/listener.js';
import type { IPCRequest } from '../../src/ipc/types.js';

// ── Valid DeFi messages ──

describe('IPCListener DeFi: valid swap messages', () => {
  it('parses valid propose_swap', () => {
    const messages: IPCRequest[] = [];
    const malformed: string[] = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      (line) => malformed.push(line)
    );

    listener.feed(JSON.stringify({
      id: 'swap-1',
      type: 'propose_swap',
      payload: {
        amount: '5000000',
        symbol: 'USDT',
        chain: 'ethereum',
        toSymbol: 'XAUT',
        reason: 'Diversify',
        confidence: 0.85,
        strategy: 'rebalance',
        timestamp: Date.now()
      }
    }) + '\n');

    assert.equal(messages.length, 1);
    assert.equal(malformed.length, 0);
    assert.equal(messages[0]!.type, 'propose_swap');
  });
});

describe('IPCListener DeFi: valid bridge messages', () => {
  it('parses valid propose_bridge', () => {
    const messages: IPCRequest[] = [];
    const malformed: string[] = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      (line) => malformed.push(line)
    );

    listener.feed(JSON.stringify({
      id: 'bridge-1',
      type: 'propose_bridge',
      payload: {
        amount: '3000000',
        symbol: 'USDT',
        chain: 'ethereum',
        fromChain: 'ethereum',
        toChain: 'arbitrum',
        reason: 'Gas optimization',
        confidence: 0.9,
        strategy: 'bridge',
        timestamp: Date.now()
      }
    }) + '\n');

    assert.equal(messages.length, 1);
    assert.equal(malformed.length, 0);
    assert.equal(messages[0]!.type, 'propose_bridge');
  });
});

describe('IPCListener DeFi: valid yield messages', () => {
  it('parses valid propose_yield deposit', () => {
    const messages: IPCRequest[] = [];
    const malformed: string[] = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      (line) => malformed.push(line)
    );

    listener.feed(JSON.stringify({
      id: 'yield-1',
      type: 'propose_yield',
      payload: {
        amount: '10000000',
        symbol: 'USDT',
        chain: 'ethereum',
        protocol: 'aave',
        action: 'deposit',
        reason: 'Earn yield',
        confidence: 0.88,
        strategy: 'yield',
        timestamp: Date.now()
      }
    }) + '\n');

    assert.equal(messages.length, 1);
    assert.equal(malformed.length, 0);
    assert.equal(messages[0]!.type, 'propose_yield');
  });

  it('parses valid propose_yield withdraw', () => {
    const messages: IPCRequest[] = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      () => {}
    );

    listener.feed(JSON.stringify({
      id: 'yield-2',
      type: 'propose_yield',
      payload: {
        amount: '5000000',
        symbol: 'USDT',
        chain: 'ethereum',
        protocol: 'compound',
        action: 'withdraw',
        reason: 'Rebalance',
        confidence: 0.9,
        strategy: 'yield',
        timestamp: Date.now()
      }
    }) + '\n');

    assert.equal(messages.length, 1);
  });
});

describe('IPCListener DeFi: valid query_balance_all', () => {
  it('parses query_balance_all', () => {
    const messages: IPCRequest[] = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      () => {}
    );

    listener.feed(JSON.stringify({
      id: 'bal-all',
      type: 'query_balance_all',
      payload: {}
    }) + '\n');

    assert.equal(messages.length, 1);
    assert.equal(messages[0]!.type, 'query_balance_all');
  });
});

describe('IPCListener DeFi: source field', () => {
  it('preserves source field from envelope', () => {
    const messages: IPCRequest[] = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      () => {}
    );

    listener.feed(JSON.stringify({
      id: 'src-1',
      type: 'propose_swap',
      source: 'companion',
      payload: {
        amount: '1000000',
        symbol: 'USDT',
        chain: 'ethereum',
        toSymbol: 'USAT',
        reason: 'Human requested',
        confidence: 1.0,
        strategy: 'manual',
        timestamp: Date.now()
      }
    }) + '\n');

    assert.equal(messages.length, 1);
    assert.equal(messages[0]!.source, 'companion');
  });
});

// ── Malformed DeFi messages ──

describe('IPCListener DeFi: malformed swap messages', () => {
  it('drops swap with missing toSymbol', () => {
    const messages: IPCRequest[] = [];
    const malformed: Array<{ line: string; error: string }> = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      (line, error) => malformed.push({ line, error })
    );

    listener.feed(JSON.stringify({
      id: 'bad-swap-1',
      type: 'propose_swap',
      payload: {
        amount: '5000000',
        symbol: 'USDT',
        chain: 'ethereum',
        // toSymbol missing!
        reason: 'Test',
        confidence: 0.8,
        strategy: 'test',
        timestamp: Date.now()
      }
    }) + '\n');

    assert.equal(messages.length, 0);
    assert.equal(malformed.length, 1);
  });

  it('drops swap with invalid toSymbol', () => {
    const messages: IPCRequest[] = [];
    const malformed: Array<{ line: string; error: string }> = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      (line, error) => malformed.push({ line, error })
    );

    listener.feed(JSON.stringify({
      id: 'bad-swap-2',
      type: 'propose_swap',
      payload: {
        amount: '5000000',
        symbol: 'USDT',
        chain: 'ethereum',
        toSymbol: 'DOGE',  // Invalid!
        reason: 'Test',
        confidence: 0.8,
        strategy: 'test',
        timestamp: Date.now()
      }
    }) + '\n');

    assert.equal(messages.length, 0);
    assert.equal(malformed.length, 1);
  });
});

describe('IPCListener DeFi: malformed bridge messages', () => {
  it('drops bridge with missing fromChain', () => {
    const messages: IPCRequest[] = [];
    const malformed: Array<{ line: string; error: string }> = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      (line, error) => malformed.push({ line, error })
    );

    listener.feed(JSON.stringify({
      id: 'bad-bridge-1',
      type: 'propose_bridge',
      payload: {
        amount: '3000000',
        symbol: 'USDT',
        chain: 'ethereum',
        // fromChain missing!
        toChain: 'arbitrum',
        reason: 'Test',
        confidence: 0.9,
        strategy: 'bridge',
        timestamp: Date.now()
      }
    }) + '\n');

    assert.equal(messages.length, 0);
    assert.equal(malformed.length, 1);
  });

  it('drops bridge with invalid toChain', () => {
    const messages: IPCRequest[] = [];
    const malformed: Array<{ line: string; error: string }> = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      (line, error) => malformed.push({ line, error })
    );

    listener.feed(JSON.stringify({
      id: 'bad-bridge-2',
      type: 'propose_bridge',
      payload: {
        amount: '3000000',
        symbol: 'USDT',
        chain: 'ethereum',
        fromChain: 'ethereum',
        toChain: 'solana',  // Invalid!
        reason: 'Test',
        confidence: 0.9,
        strategy: 'bridge',
        timestamp: Date.now()
      }
    }) + '\n');

    assert.equal(messages.length, 0);
    assert.equal(malformed.length, 1);
  });
});

describe('IPCListener DeFi: malformed yield messages', () => {
  it('drops yield with missing protocol', () => {
    const messages: IPCRequest[] = [];
    const malformed: Array<{ line: string; error: string }> = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      (line, error) => malformed.push({ line, error })
    );

    listener.feed(JSON.stringify({
      id: 'bad-yield-1',
      type: 'propose_yield',
      payload: {
        amount: '10000000',
        symbol: 'USDT',
        chain: 'ethereum',
        // protocol missing!
        action: 'deposit',
        reason: 'Test',
        confidence: 0.88,
        strategy: 'yield',
        timestamp: Date.now()
      }
    }) + '\n');

    assert.equal(messages.length, 0);
    assert.equal(malformed.length, 1);
  });

  it('drops yield with invalid action', () => {
    const messages: IPCRequest[] = [];
    const malformed: Array<{ line: string; error: string }> = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      (line, error) => malformed.push({ line, error })
    );

    listener.feed(JSON.stringify({
      id: 'bad-yield-2',
      type: 'propose_yield',
      payload: {
        amount: '10000000',
        symbol: 'USDT',
        chain: 'ethereum',
        protocol: 'aave',
        action: 'stake',  // Invalid! Must be 'deposit' or 'withdraw'
        reason: 'Test',
        confidence: 0.88,
        strategy: 'yield',
        timestamp: Date.now()
      }
    }) + '\n');

    assert.equal(messages.length, 0);
    assert.equal(malformed.length, 1);
  });

  it('drops yield with USAT on invalid chain', () => {
    const messages: IPCRequest[] = [];
    const malformed: Array<{ line: string; error: string }> = [];
    const listener = new IPCListener(
      (req) => messages.push(req),
      (line, error) => malformed.push({ line, error })
    );

    listener.feed(JSON.stringify({
      id: 'bad-yield-3',
      type: 'propose_yield',
      payload: {
        amount: '10000000',
        symbol: 'USAT',
        chain: 'invalid_chain',  // Invalid chain!
        protocol: 'aave',
        action: 'deposit',
        reason: 'Test',
        confidence: 0.88,
        strategy: 'yield',
        timestamp: Date.now()
      }
    }) + '\n');

    assert.equal(messages.length, 0);
    assert.equal(malformed.length, 1);
  });
});
