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
import { readFileSync, writeFileSync, existsSync } from '../compat/fs.js';
// ── Hex helpers ──
function toHex(buf) {
    return Buffer.from(buf).toString('hex');
}
function fromHex(hex) {
    return Buffer.from(hex, 'hex');
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
export async function resolveSeed(opts) {
    // Priority 1: Explicit seed from environment
    if (opts.existingSeed) {
        return { seedPhrase: opts.existingSeed, source: 'env' };
    }
    if (opts.passphrase.length < 12) {
        throw new Error('WALLET_PASSPHRASE must be at least 12 characters');
    }
    // Dynamic import — WDK Secret Manager is CommonJS
    const mod = await import('@tetherto/wdk-secret-manager');
    const WdkSecretManager = mod.WdkSecretManager;
    const wdkSaltGenerator = mod.wdkSaltGenerator;
    // Priority 2: Load existing encrypted seed
    if (existsSync(opts.seedFilePath)) {
        console.error('[secret] Loading encrypted seed from disk...');
        const raw = readFileSync(opts.seedFilePath, 'utf-8');
        const fileData = JSON.parse(raw);
        if (fileData.version !== 1) {
            throw new Error(`Unsupported seed file version: ${String(fileData.version)}`);
        }
        const salt = fromHex(fileData.salt);
        const sm = new WdkSecretManager(opts.passphrase, salt);
        try {
            const encryptedEntropy = fromHex(fileData.encryptedEntropy);
            const entropy = sm.decrypt(encryptedEntropy);
            const seedPhrase = sm.entropyToMnemonic(entropy);
            sm.dispose();
            console.error('[secret] Seed decrypted successfully');
            return { seedPhrase, source: 'loaded' };
        }
        catch (err) {
            sm.dispose();
            throw new Error(`Failed to decrypt seed file: ${err instanceof Error ? err.message : 'unknown'}`);
        }
    }
    // Priority 3: Generate new seed
    console.error('[secret] No seed file found — generating new encrypted seed...');
    const salt = wdkSaltGenerator.generate();
    const sm = new WdkSecretManager(opts.passphrase, salt);
    try {
        const { encryptedEntropy } = sm.generateAndEncrypt();
        // Decrypt to get the mnemonic (we need it for WDK init)
        const entropy = sm.decrypt(encryptedEntropy);
        const seedPhrase = sm.entropyToMnemonic(entropy);
        // Save encrypted seed to disk
        const seedFile = {
            version: 1,
            salt: toHex(salt),
            encryptedEntropy: toHex(encryptedEntropy),
            createdAt: new Date().toISOString(),
        };
        writeFileSync(opts.seedFilePath, JSON.stringify(seedFile, null, 2), 'utf-8');
        console.error(`[secret] Encrypted seed saved to ${opts.seedFilePath}`);
        sm.dispose();
        return { seedPhrase, source: 'generated' };
    }
    catch (err) {
        sm.dispose();
        throw new Error(`Failed to generate seed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
}
//# sourceMappingURL=manager.js.map