/**
 * Identity tests — keypair generation, persistence, identity construction.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'fs';
import {
  generateKeypair,
  loadOrCreateKeypair,
  buildIdentity,
} from '../../src/swarm/identity.js';

const TEST_KEYPAIR_PATH = '/tmp/oikos-test-keypair.json';

afterEach(() => {
  if (existsSync(TEST_KEYPAIR_PATH)) {
    unlinkSync(TEST_KEYPAIR_PATH);
  }
});

describe('generateKeypair', () => {
  it('returns publicKey and secretKey as Buffers', () => {
    const kp = generateKeypair();
    assert.ok(Buffer.isBuffer(kp.publicKey));
    assert.ok(Buffer.isBuffer(kp.secretKey));
    assert.equal(kp.publicKey.length, 32);
    assert.equal(kp.secretKey.length, 64);
  });
});

describe('loadOrCreateKeypair', () => {
  it('creates a new keypair if file does not exist', () => {
    assert.ok(!existsSync(TEST_KEYPAIR_PATH));
    const kp = loadOrCreateKeypair(TEST_KEYPAIR_PATH);
    assert.ok(Buffer.isBuffer(kp.publicKey));
    assert.ok(existsSync(TEST_KEYPAIR_PATH));
  });

  it('loads the same keypair on subsequent calls', () => {
    const kp1 = loadOrCreateKeypair(TEST_KEYPAIR_PATH);
    const kp2 = loadOrCreateKeypair(TEST_KEYPAIR_PATH);
    assert.deepEqual(kp1.publicKey, kp2.publicKey);
    assert.deepEqual(kp1.secretKey, kp2.secretKey);
  });
});

describe('buildIdentity', () => {
  it('constructs AgentIdentity with correct fields', () => {
    const kp = generateKeypair();
    const identity = buildIdentity(
      kp,
      'TestAgent',
      ['portfolio-analyst', 'price-feed'],
      0.75,
      'abc123hash',
    );

    assert.equal(identity.pubkey, kp.publicKey.toString('hex'));
    assert.equal(identity.name, 'TestAgent');
    assert.deepEqual(identity.capabilities, ['portfolio-analyst', 'price-feed']);
    assert.equal(identity.reputation, 0.75);
    assert.equal(identity.auditHash, 'abc123hash');
  });
});
