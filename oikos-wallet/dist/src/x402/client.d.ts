/**
 * x402 Client — Auto-pay for commodity services via HTTP 402.
 *
 * Uses @x402/fetch with an IPC-bridged signer to automatically:
 * 1. Detect 402 Payment Required responses
 * 2. Sign EIP-3009 transferWithAuthorization via Wallet Isolate IPC
 * 3. Retry with the signed authorization
 *
 * Key invariant: x402 payments flow through the SAME PolicyEngine
 * as all other payment types. The signer proxy sends typed data to
 * the Wallet Isolate, which evaluates policy before signing.
 *
 * Supports: Plasma (eip155:9745), Stable (eip155:988), Sepolia (eip155:11155111)
 * Asset: USD₮0 on Plasma/Stable, USDT on Sepolia
 */
import type { WalletIPCClient } from '../ipc/client.js';
import type { X402Service, X402Economics } from './types.js';
export declare class X402Client {
    private wallet;
    private signer;
    private economics;
    private knownServices;
    private wrappedFetch;
    private initialized;
    constructor(wallet: WalletIPCClient);
    /**
     * Initialize the x402 client — must be called before fetch().
     * Resolves the wallet address and sets up @x402/fetch wrapper.
     */
    init(): Promise<void>;
    /**
     * Fetch a URL with x402 auto-pay.
     *
     * If @x402/fetch is available:
     *   Uses proper EIP-3009 transferWithAuthorization flow via facilitator
     *
     * If @x402/fetch unavailable:
     *   Falls back to manual 402 parsing + IPC payment proposal
     */
    fetch(url: string, init?: RequestInit, maxPaymentUsd?: number): Promise<{
        ok: boolean;
        status: number;
        data: unknown;
        paid: boolean;
        paymentResult?: string;
    }>;
    /** Register a known x402 service (for dashboard display) */
    registerService(service: X402Service): void;
    /** Get x402 economics for dashboard */
    getEconomics(): X402Economics;
    /** Get known x402 services */
    getServices(): X402Service[];
    /** Get the signer's address */
    getAddress(): string;
    private _fetchWithX402;
    private _fetchManual;
    private _trackSpend;
    private _parseBody;
}
//# sourceMappingURL=client.d.ts.map