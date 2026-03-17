/**
 * Swarm Type Definitions — All interfaces for the Oikos Agent Swarm.
 *
 * Three layers:
 * - Board (public): discovery announcements, heartbeats, reputation
 * - Room (private): negotiation, bidding, settlement, payment confirmation
 * - Feed (lightweight): price data, strategy signals
 *
 * Privacy invariant: Board NEVER contains transaction details.
 * All amounts, addresses, txids are ONLY shared inside private rooms.
 */
export {};
//# sourceMappingURL=types.js.map