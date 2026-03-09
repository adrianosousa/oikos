/**
 * Marketplace tests — room lifecycle, bid selection, settlement, expiry.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Marketplace } from '../../src/swarm/marketplace.js';

function makeAnnouncement(id?: string) {
  return {
    type: 'announcement' as const,
    id: id ?? 'ann-' + Math.random().toString(36).slice(2, 8),
    agentPubkey: 'aabbccdd',
    agentName: 'TestAgent',
    reputation: 0.8,
    category: 'service' as const,
    title: 'Price Feed Service',
    description: 'Real-time price data',
    priceRange: { min: '10', max: '50', symbol: 'USDT' },
    capabilities: ['price-feed' as const],
    expiresAt: Date.now() + 60000,
    timestamp: Date.now(),
  };
}

function makeBid(announcementId: string, price: string, pubkey?: string) {
  return {
    type: 'bid' as const,
    announcementId,
    bidderPubkey: pubkey ?? 'bidder-' + Math.random().toString(36).slice(2, 8),
    bidderName: 'BidderBot',
    price,
    symbol: 'USDT',
    reason: 'I can do it',
    timestamp: Date.now(),
  };
}

describe('Marketplace: room creation', () => {
  it('createRoom sets status to open with creator role', () => {
    const mp = new Marketplace();
    const ann = makeAnnouncement('ann-1');
    const room = mp.createRoom(ann);
    assert.equal(room.status, 'open');
    assert.equal(room.role, 'creator');
    assert.equal(room.announcementId, 'ann-1');
  });

  it('joinRoom sets status to negotiating with bidder role', () => {
    const mp = new Marketplace();
    const ann = makeAnnouncement('ann-2');
    const room = mp.joinRoom(ann);
    assert.equal(room.status, 'negotiating');
    assert.equal(room.role, 'bidder');
  });

  it('joinRoom does not overwrite existing creator room', () => {
    const mp = new Marketplace();
    const ann = makeAnnouncement('ann-3');
    mp.createRoom(ann);
    const room = mp.joinRoom(ann);
    assert.equal(room.role, 'creator');
  });
});

describe('Marketplace: bid handling', () => {
  it('handleRoomMessage adds bids and transitions to negotiating', () => {
    const mp = new Marketplace();
    const ann = makeAnnouncement('ann-bid');
    mp.createRoom(ann);

    mp.handleRoomMessage('ann-bid', makeBid('ann-bid', '25'));
    mp.handleRoomMessage('ann-bid', makeBid('ann-bid', '20'));

    const room = mp.getRoom('ann-bid');
    assert.ok(room);
    assert.equal(room.bids.length, 2);
    assert.equal(room.status, 'negotiating');
  });

  it('getBestBid returns the lowest-price bid', () => {
    const mp = new Marketplace();
    const ann = makeAnnouncement('ann-best');
    mp.createRoom(ann);

    mp.handleRoomMessage('ann-best', makeBid('ann-best', '50', 'bidder-expensive'));
    mp.handleRoomMessage('ann-best', makeBid('ann-best', '15', 'bidder-cheap'));
    mp.handleRoomMessage('ann-best', makeBid('ann-best', '30', 'bidder-mid'));

    const best = mp.getBestBid('ann-best');
    assert.ok(best);
    assert.equal(best.price, '15');
    assert.equal(best.bidderPubkey, 'bidder-cheap');
  });

  it('getBestBid returns undefined for empty room', () => {
    const mp = new Marketplace();
    assert.equal(mp.getBestBid('nonexistent'), undefined);
  });
});

describe('Marketplace: accept and settle', () => {
  it('acceptBid transitions room to accepted with agreed price', () => {
    const mp = new Marketplace();
    const ann = makeAnnouncement('ann-accept');
    mp.createRoom(ann);

    mp.handleRoomMessage('ann-accept', makeBid('ann-accept', '25', 'winner'));
    const accept = mp.acceptBid('ann-accept', 'winner', '0xPaymentAddr', 'ethereum');

    assert.ok(accept);
    assert.equal(accept.type, 'accept');
    assert.equal(accept.agreedPrice, '25');
    assert.equal(accept.acceptedBidderPubkey, 'winner');

    const room = mp.getRoom('ann-accept');
    assert.ok(room);
    assert.equal(room.status, 'accepted');
    assert.equal(room.agreedPrice, '25');
  });

  it('acceptBid returns undefined for bidder role', () => {
    const mp = new Marketplace();
    const ann = makeAnnouncement('ann-bidder');
    mp.joinRoom(ann);
    const accept = mp.acceptBid('ann-bidder', 'someone', '0x', 'ethereum');
    assert.equal(accept, undefined);
  });

  it('settleRoom transitions to settled and updates economics', () => {
    const mp = new Marketplace();
    const ann = makeAnnouncement('ann-settle');
    mp.createRoom(ann);

    mp.handleRoomMessage('ann-settle', makeBid('ann-settle', '30', 'worker'));
    mp.acceptBid('ann-settle', 'worker', '0x', 'ethereum');
    mp.settleRoom('ann-settle', '0xTxHash123');

    const room = mp.getRoom('ann-settle');
    assert.ok(room);
    assert.equal(room.status, 'settled');
    assert.equal(room.paymentTxHash, '0xTxHash123');

    const econ = mp.getEconomics();
    assert.equal(econ.completedTasks, 1);
    assert.equal(parseFloat(econ.totalCosts), 30);
  });
});

describe('Marketplace: expiry', () => {
  it('expireStaleRooms expires rooms past timeout', () => {
    const mp = new Marketplace();
    const ann = makeAnnouncement('ann-expire');
    mp.createRoom(ann, 1); // 1ms timeout

    // Wait for expiry
    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }

    const expired = mp.expireStaleRooms();
    assert.ok(expired.includes('ann-expire'));

    const room = mp.getRoom('ann-expire');
    assert.ok(room);
    assert.equal(room.status, 'expired');
  });

  it('does not expire settled rooms', () => {
    const mp = new Marketplace();
    const ann = makeAnnouncement('ann-no-expire');
    mp.createRoom(ann, 1);

    mp.handleRoomMessage('ann-no-expire', makeBid('ann-no-expire', '10', 'w'));
    mp.acceptBid('ann-no-expire', 'w', '0x', 'ethereum');
    mp.settleRoom('ann-no-expire', '0xhash');

    const start = Date.now();
    while (Date.now() - start < 5) { /* spin */ }

    const expired = mp.expireStaleRooms();
    assert.ok(!expired.includes('ann-no-expire'));
  });
});

describe('Marketplace: economics', () => {
  it('tracks revenue for bidder role', () => {
    const mp = new Marketplace();
    const ann = makeAnnouncement('ann-rev');
    mp.joinRoom(ann); // bidder role

    mp.handleRoomMessage('ann-rev', {
      type: 'accept',
      announcementId: 'ann-rev',
      acceptedBidderPubkey: 'me',
      agreedPrice: '100',
      agreedSymbol: 'USDT',
      paymentAddress: '0x',
      paymentChain: 'ethereum',
      timestamp: Date.now(),
    });

    mp.settleRoom('ann-rev', '0xhash');

    const econ = mp.getEconomics();
    assert.equal(parseFloat(econ.totalRevenue), 100);
    assert.equal(econ.completedTasks, 1);
  });
});
