/**
 * Reputation system tests — score computation, audit hash, edge cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReputation,
  computeAuditHash,
  reputationFromAuditEntries,
} from '../../src/swarm/reputation.js';

describe('computeReputation', () => {
  it('returns 0.5 for empty history', () => {
    const score = computeReputation({
      successfulTxs: 0,
      failedTxs: 0,
      rejectedTxs: 0,
      totalVolumeUsd: 0,
      historyDays: 0,
    });
    assert.equal(score, 0.5);
  });

  it('returns high score for all successful transactions', () => {
    const score = computeReputation({
      successfulTxs: 100,
      failedTxs: 0,
      rejectedTxs: 0,
      totalVolumeUsd: 5000,
      historyDays: 60,
    });
    // successRate=1.0, volumeScore=1.0, historyScore=1.0
    // score = 0.5*1.0 + 0.3*1.0 + 0.2*1.0 = 1.0
    assert.equal(score, 1.0);
  });

  it('penalizes failures', () => {
    const score = computeReputation({
      successfulTxs: 50,
      failedTxs: 50,
      rejectedTxs: 0,
      totalVolumeUsd: 500,
      historyDays: 15,
    });
    // successRate=0.5, volumeScore=0.5, historyScore=0.5
    // score = 0.5*0.5 + 0.3*0.5 + 0.2*0.5 = 0.5
    assert.equal(score, 0.5);
  });

  it('caps at 1.0 even with extreme values', () => {
    const score = computeReputation({
      successfulTxs: 10000,
      failedTxs: 0,
      rejectedTxs: 0,
      totalVolumeUsd: 1000000,
      historyDays: 365,
    });
    assert.ok(score <= 1.0);
  });

  it('never goes below 0', () => {
    const score = computeReputation({
      successfulTxs: 0,
      failedTxs: 100,
      rejectedTxs: 0,
      totalVolumeUsd: 0,
      historyDays: 0,
    });
    assert.ok(score >= 0);
  });

  it('volume saturation at $1000', () => {
    const low = computeReputation({
      successfulTxs: 10,
      failedTxs: 0,
      rejectedTxs: 0,
      totalVolumeUsd: 100,
      historyDays: 0,
    });
    const high = computeReputation({
      successfulTxs: 10,
      failedTxs: 0,
      rejectedTxs: 0,
      totalVolumeUsd: 10000,
      historyDays: 0,
    });
    // Both have successRate=1.0, historyScore=0. Volume differs.
    assert.ok(high > low);
  });
});

describe('computeAuditHash', () => {
  it('returns a 64-char hex string (32 bytes)', () => {
    const hash = computeAuditHash([{ type: 'test' }]);
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    const entries = [{ type: 'execution_success', amount: '100' }];
    const h1 = computeAuditHash(entries);
    const h2 = computeAuditHash(entries);
    assert.equal(h1, h2);
  });

  it('different entries produce different hashes', () => {
    const h1 = computeAuditHash([{ type: 'a' }]);
    const h2 = computeAuditHash([{ type: 'b' }]);
    assert.notEqual(h1, h2);
  });
});

describe('reputationFromAuditEntries', () => {
  it('counts successes and failures correctly', () => {
    const entries = [
      { type: 'execution_success', proposal: { amount: '100', symbol: 'USDT' }, timestamp: Date.now() },
      { type: 'execution_success', proposal: { amount: '200', symbol: 'USDT' }, timestamp: Date.now() },
      { type: 'execution_failure', timestamp: Date.now() },
      { type: 'policy_enforcement', timestamp: Date.now() },
    ];

    const input = reputationFromAuditEntries(entries);
    assert.equal(input.successfulTxs, 2);
    assert.equal(input.failedTxs, 1);
    assert.equal(input.rejectedTxs, 1);
    assert.ok(input.totalVolumeUsd > 0);
  });

  it('returns zero input for empty entries', () => {
    const input = reputationFromAuditEntries([]);
    assert.equal(input.successfulTxs, 0);
    assert.equal(input.failedTxs, 0);
    assert.equal(input.totalVolumeUsd, 0);
  });
});
