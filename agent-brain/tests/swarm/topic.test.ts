/**
 * Topic derivation tests — determinism, domain separation, uniqueness.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveBoardTopic, deriveRoomTopic } from '../../src/swarm/topic.js';

describe('deriveBoardTopic', () => {
  it('returns a 32-byte Buffer', () => {
    const topic = deriveBoardTopic('oikos-hackathon-v1');
    assert.equal(topic.length, 32);
    assert.ok(Buffer.isBuffer(topic));
  });

  it('is deterministic — same input produces same output', () => {
    const t1 = deriveBoardTopic('test-swarm');
    const t2 = deriveBoardTopic('test-swarm');
    assert.deepEqual(t1, t2);
  });

  it('different swarm IDs produce different topics', () => {
    const t1 = deriveBoardTopic('swarm-alpha');
    const t2 = deriveBoardTopic('swarm-beta');
    assert.notDeepEqual(t1, t2);
  });
});

describe('deriveRoomTopic', () => {
  it('returns a 32-byte Buffer', () => {
    const creatorPubkey = Buffer.alloc(32, 0xab);
    const topic = deriveRoomTopic('announcement-123', creatorPubkey);
    assert.equal(topic.length, 32);
    assert.ok(Buffer.isBuffer(topic));
  });

  it('is deterministic — same inputs produce same output', () => {
    const pubkey = Buffer.alloc(32, 0xcd);
    const t1 = deriveRoomTopic('ann-1', pubkey);
    const t2 = deriveRoomTopic('ann-1', pubkey);
    assert.deepEqual(t1, t2);
  });

  it('different announcement IDs produce different topics', () => {
    const pubkey = Buffer.alloc(32, 0xef);
    const t1 = deriveRoomTopic('ann-1', pubkey);
    const t2 = deriveRoomTopic('ann-2', pubkey);
    assert.notDeepEqual(t1, t2);
  });

  it('different creator pubkeys produce different topics', () => {
    const pk1 = Buffer.alloc(32, 0x01);
    const pk2 = Buffer.alloc(32, 0x02);
    const t1 = deriveRoomTopic('same-ann', pk1);
    const t2 = deriveRoomTopic('same-ann', pk2);
    assert.notDeepEqual(t1, t2);
  });
});

describe('Domain separation', () => {
  it('board and room topics are different even with overlapping input', () => {
    const boardTopic = deriveBoardTopic('overlap-test');
    const pubkey = Buffer.alloc(32, 0);
    const roomTopic = deriveRoomTopic('overlap-test', pubkey);
    assert.notDeepEqual(boardTopic, roomTopic);
  });
});
