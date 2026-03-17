/**
 * Wallet Isolate — Entry Point
 *
 * Boots the isolated wallet process:
 * 1. Load policy config (immutable)
 * 2. Initialize WDK with seed
 * 3. Start IPC listener on stdin
 * 4. Process requests, write responses to stdout
 *
 * This process runs on Bare Runtime. It has:
 * - Access to blockchain RPC nodes
 * - Access to private keys (via WDK)
 * - NO internet access beyond chain nodes
 * - NO LLM access
 * - NO way to modify its own policies
 *
 * @security The seed phrase is read from env ONCE at startup
 * and passed to WalletManager. It is never stored, logged, or
 * transmitted after that point.
 */
export {};
//# sourceMappingURL=main.d.ts.map