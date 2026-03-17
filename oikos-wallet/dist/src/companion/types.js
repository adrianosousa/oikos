/**
 * Companion Channel Types — Human-Agent P2P Communication.
 *
 * The companion app connects to the Agent Brain via Hyperswarm Noise-authenticated
 * P2P channel. Same protomux infrastructure as the swarm — just a different
 * channel type with owner-level authentication.
 *
 * Privacy invariant: Companion NEVER talks to the Wallet Isolate directly.
 * It talks to the Brain, which translates instructions into IPC proposals.
 * Process isolation is preserved.
 */
export {};
//# sourceMappingURL=types.js.map