/**
 * PolicyEngine DeFi Tests — Prove all proposal types evaluate correctly.
 *
 * SwapProposal, BridgeProposal, YieldProposal go through the same
 * 8 rules as PaymentProposal. Whitelist is skipped for swaps/bridges
 * (no counterparty). Budget tracking works for all types.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyEngine } from '../../src/policies/engine.js';
import type {
  SwapProposal,
  BridgeProposal,
  YieldProposal,
  PaymentProposal,
} from '../../src/ipc/types.js';

function makeSwap(overrides: Partial<SwapProposal> = {}): SwapProposal {
  return {
    amount: '5000000',  // 5 USDT
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

function makeBridge(overrides: Partial<BridgeProposal> = {}): BridgeProposal {
  return {
    amount: '3000000',  // 3 USDT
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

function makeYield(overrides: Partial<YieldProposal> = {}): YieldProposal {
  return {
    amount: '10000000', // 10 USDT
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

function makePayment(overrides: Partial<PaymentProposal> = {}): PaymentProposal {
  return {
    to: '0x1234567890abcdef1234567890abcdef12345678',
    amount: '1000000',
    symbol: 'USDT',
    chain: 'ethereum',
    reason: 'Test',
    confidence: 0.85,
    strategy: 'test',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ── Swap proposals ──

describe('PolicyEngine DeFi: swap proposals', () => {
  it('approves swap under max_per_tx', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_tx', amount: '10000000', symbol: 'USDT' }
      ]}]
    });
    const result = engine.evaluate(makeSwap({ amount: '5000000' }));
    assert.equal(result.approved, true);
  });

  it('rejects swap over max_per_tx', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_tx', amount: '3000000', symbol: 'USDT' }
      ]}]
    });
    const result = engine.evaluate(makeSwap({ amount: '5000000' }));
    assert.equal(result.approved, false);
    assert.match(result.violations[0]!, /max_per_tx/);
  });

  it('tracks swap in session budget', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_session', amount: '8000000', symbol: 'USDT' }
      ]}]
    });
    engine.recordExecution(makeSwap({ amount: '5000000' }));
    const result = engine.evaluate(makeSwap({ amount: '5000000' }));
    assert.equal(result.approved, false);
    assert.match(result.violations[0]!, /max_per_session/);
  });

  it('skips whitelist for swaps (no counterparty)', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'whitelist_recipients', addresses: ['0xAAAA'] }
      ]}]
    });
    const result = engine.evaluate(makeSwap());
    assert.equal(result.approved, true); // Whitelist skipped — no counterparty
  });

  it('skips max_per_recipient_per_day for swaps', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_recipient_per_day', amount: '1000000', symbol: 'USDT' }
      ]}]
    });
    const result = engine.evaluate(makeSwap({ amount: '99000000' }));
    assert.equal(result.approved, true); // No counterparty — rule skipped
  });
});

// ── Bridge proposals ──

describe('PolicyEngine DeFi: bridge proposals', () => {
  it('approves bridge under limit', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_tx', amount: '5000000', symbol: 'USDT' }
      ]}]
    });
    const result = engine.evaluate(makeBridge({ amount: '3000000' }));
    assert.equal(result.approved, true);
  });

  it('rejects bridge over limit', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_tx', amount: '2000000', symbol: 'USDT' }
      ]}]
    });
    const result = engine.evaluate(makeBridge({ amount: '3000000' }));
    assert.equal(result.approved, false);
  });

  it('skips whitelist for bridges (no counterparty)', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'whitelist_recipients', addresses: ['0xBBBB'] }
      ]}]
    });
    const result = engine.evaluate(makeBridge());
    assert.equal(result.approved, true);
  });
});

// ── Yield proposals ──

describe('PolicyEngine DeFi: yield proposals', () => {
  it('approves yield deposit under limit', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_tx', amount: '15000000', symbol: 'USDT' }
      ]}]
    });
    const result = engine.evaluate(makeYield({ amount: '10000000' }));
    assert.equal(result.approved, true);
  });

  it('rejects yield deposit over limit', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_tx', amount: '5000000', symbol: 'USDT' }
      ]}]
    });
    const result = engine.evaluate(makeYield({ amount: '10000000' }));
    assert.equal(result.approved, false);
  });

  it('applies whitelist to yield (protocol is counterparty)', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'whitelist_recipients', addresses: ['aave', 'compound'] }
      ]}]
    });

    const r1 = engine.evaluate(makeYield({ protocol: 'aave' }));
    assert.equal(r1.approved, true);

    const r2 = engine.evaluate(makeYield({ protocol: 'unknown-defi' }));
    assert.equal(r2.approved, false);
    assert.match(r2.violations[0]!, /whitelist_recipients/);
  });

  it('tracks yield per-recipient-per-day (protocol as counterparty)', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_recipient_per_day', amount: '15000000', symbol: 'USDT' }
      ]}]
    });

    engine.recordExecution(makeYield({ protocol: 'aave', amount: '10000000' }));

    const r1 = engine.evaluate(makeYield({ protocol: 'aave', amount: '10000000' }));
    assert.equal(r1.approved, false);

    // Different protocol — separate budget
    const r2 = engine.evaluate(makeYield({ protocol: 'compound', amount: '10000000' }));
    assert.equal(r2.approved, true);
  });
});

// ── Cross-type budget tracking ──

describe('PolicyEngine DeFi: cross-type budget tracking', () => {
  it('shared session budget across payment and swap', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_session', amount: '8000000', symbol: 'USDT' }
      ]}]
    });

    // Payment: 3 USDT
    engine.recordExecution(makePayment({ amount: '3000000' }));

    // Swap: 3 USDT
    engine.recordExecution(makeSwap({ amount: '3000000' }));

    // Total = 6 USDT. Another 3 USDT would exceed 8 USDT limit.
    const result = engine.evaluate(makeYield({ amount: '3000000' }));
    assert.equal(result.approved, false);
    assert.match(result.violations[0]!, /max_per_session/);
  });

  it('cooldown applies across all operation types', () => {
    let mockTime = 1000000;
    const engine = new PolicyEngine(
      { policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'cooldown_seconds', seconds: 30 }
      ]}]},
      () => mockTime
    );

    engine.recordExecution(makeSwap());

    // 10 seconds later — try a bridge
    mockTime += 10_000;
    const result = engine.evaluate(makeBridge());
    assert.equal(result.approved, false);
    assert.match(result.violations[0]!, /cooldown_seconds/);
  });

  it('confidence applies to all operation types', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'require_confidence', min: 0.8 }
      ]}]
    });

    const r1 = engine.evaluate(makeSwap({ confidence: 0.5 }));
    assert.equal(r1.approved, false);

    const r2 = engine.evaluate(makeBridge({ confidence: 0.5 }));
    assert.equal(r2.approved, false);

    const r3 = engine.evaluate(makeYield({ confidence: 0.5 }));
    assert.equal(r3.approved, false);
  });

  it('day budget shared across all operation types', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_day', amount: '10000000', symbol: 'USDT' }
      ]}]
    });

    engine.recordExecution(makePayment({ amount: '3000000' }));
    engine.recordExecution(makeSwap({ amount: '3000000' }));
    engine.recordExecution(makeBridge({ amount: '3000000' }));

    // Total = 9 USDT. Another 2 USDT would exceed 10 USDT limit.
    const result = engine.evaluate(makeYield({ amount: '2000000' }));
    assert.equal(result.approved, false);
    assert.match(result.violations[0]!, /max_per_day/);
  });
});

// ── Multi-asset rules ──

describe('PolicyEngine DeFi: multi-asset rules', () => {
  it('XAUT swap respects XAUT-specific limits', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_tx', amount: '500000', symbol: 'XAUT' }  // 0.5 XAUT
      ]}]
    });

    // Spending 1 XAUT (from XAUT → USDT swap)
    const result = engine.evaluate(makeSwap({ symbol: 'XAUT', amount: '1000000', toSymbol: 'USDT' }));
    assert.equal(result.approved, false);
    assert.match(result.violations[0]!, /max_per_tx/);
  });

  it('USDT rule does not affect XAUT operations', () => {
    const engine = new PolicyEngine({
      policies: [{ id: 'test', name: 'Test', rules: [
        { type: 'max_per_tx', amount: '1000000', symbol: 'USDT' }  // 1 USDT
      ]}]
    });

    // 5 XAUT swap — USDT rule should not apply
    const result = engine.evaluate(makeSwap({ symbol: 'XAUT', amount: '5000000', toSymbol: 'USDT' }));
    assert.equal(result.approved, true);
  });
});
