/**
 * Secret Manager — Encrypted seed phrase persistence.
 *
 * Uses @tetherto/wdk-secret-manager for:
 * - PBKDF2-SHA256 key derivation from passphrase
 * - XSalsa20-Poly1305 authenticated encryption
 * - BIP39 mnemonic <-> entropy conversion
 *
 * Lifecycle:
 * 1. First run: Generate seed -> encrypt -> save to file
 * 2. Subsequent runs: Load file -> decrypt -> return seed
 * 3. Shutdown: dispose() wipes secrets from memory
 *
 * The encrypted seed file contains:
 * - salt (hex, 16 bytes)
 * - encryptedEntropy (hex, encrypted 16-byte entropy)
 *
 * The passphrase comes from environment (WALLET_PASSPHRASE).
 * The seed file path comes from environment (WALLET_SEED_FILE).
 *
 * @security The decrypted seed phrase is returned to the caller
 * (wallet main.ts) and passed to WDK. It is NEVER logged or persisted
 * in plaintext. Only the encrypted entropy is saved to disk.
 */
/** Result of seed resolution */
export interface SeedResult {
    /** The BIP39 mnemonic seed phrase (12 words) */
    seedPhrase: string;
    /** Whether this was a fresh generation or loaded from disk */
    source: 'generated' | 'loaded' | 'env';
}
/**
 * Resolve the wallet seed phrase.
 *
 * Priority:
 * 1. WALLET_SEED env var (backward compat / explicit seed)
 * 2. Encrypted seed file on disk (decrypt with passphrase)
 * 3. Generate new seed -> encrypt -> save -> return
 *
 * @param opts.passphrase - Encryption passphrase (min 12 chars)
 * @param opts.seedFilePath - Path to encrypted seed file
 * @param opts.existingSeed - Optional explicit seed (from WALLET_SEED env)
 */
export declare function resolveSeed(opts: {
    passphrase: string;
    seedFilePath: string;
    existingSeed?: string;
}): Promise<SeedResult>;
//# sourceMappingURL=manager.d.ts.map