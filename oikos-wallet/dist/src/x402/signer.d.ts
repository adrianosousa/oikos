/**
 * IPC-Bridged EVM Signer for x402
 *
 * Implements the ClientEvmSigner interface from @x402/evm by proxying
 * all signing operations through the Wallet Isolate via IPC.
 *
 * This is the key architectural piece that preserves process isolation:
 * - The Brain (Node.js) runs the x402 client logic
 * - The Wallet Isolate (Bare Runtime) holds keys and signs
 * - Policy evaluation happens INSIDE the Wallet Isolate before signing
 *
 * @security The Brain NEVER sees private keys. It sends typed data to the
 * Wallet Isolate, which evaluates policy, signs if approved, and returns
 * only the signature.
 */
import type { WalletIPCClient } from '../ipc/client.js';
/**
 * ClientEvmSigner-compatible adapter backed by Wallet Isolate IPC.
 *
 * Satisfies the signer interface expected by @x402/evm's registerExactEvmScheme:
 * - address: string (the EOA address)
 * - signTypedData(domain, types, value): Promise<string>
 */
export declare class IPCEvmSigner {
    private wallet;
    private _address;
    private _addressPromise;
    constructor(wallet: WalletIPCClient);
    /** Eagerly resolve and cache the wallet address */
    init(): Promise<void>;
    /** The EOA address of the wallet (used by x402 for from-address in typed data) */
    get address(): string;
    /**
     * Get address as async method (some x402 versions use this)
     */
    getAddress(): Promise<string>;
    /**
     * Sign EIP-712 typed data via IPC to the Wallet Isolate.
     *
     * The Wallet Isolate:
     * 1. Evaluates the payment amount against PolicyEngine
     * 2. If approved, signs with WDK's WalletAccountEvm.signTypedData
     * 3. Returns the signature (or rejection reason)
     *
     * @throws Error if policy rejects the payment or signing fails
     */
    signTypedData(domain: Record<string, unknown>, types: Record<string, Array<{
        name: string;
        type: string;
    }>>, value: Record<string, unknown>): Promise<string>;
}
//# sourceMappingURL=signer.d.ts.map