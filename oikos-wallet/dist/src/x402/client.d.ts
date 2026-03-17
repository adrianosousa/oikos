/**
 * x402 Client — Auto-pay for commodity services via HTTP 402.
 *
 * Intercepts HTTP 402 responses from x402-enabled services,
 * parses payment requirements, creates PaymentProposals that go
 * through the PolicyEngine, and retries with signed authorization.
 *
 * Key invariant: x402 payments flow through the SAME PolicyEngine
 * as all other payment types. The client MUST NOT sign without policy approval.
 *
 * For hackathon: simplified implementation without @x402/fetch dependency.
 * Uses native fetch + manual 402 parsing. Production would use @x402/fetch.
 */
import type { WalletIPCClient } from '../ipc/client.js';
import type { X402Service, X402Economics } from './types.js';
export declare class X402Client {
    private wallet;
    private economics;
    private knownServices;
    constructor(wallet: WalletIPCClient);
    /**
     * Fetch a URL with x402 auto-pay.
     *
     * 1. Makes initial request
     * 2. If 402 returned, parses payment requirements
     * 3. Creates PaymentProposal → sends to Wallet via IPC → PolicyEngine evaluates
     * 4. If approved, retries with X-PAYMENT header
     * 5. Returns the final response
     */
    fetch(url: string, init?: RequestInit, maxPaymentUsd?: number): Promise<{
        ok: boolean;
        status: number;
        data: unknown;
        paid: boolean;
        paymentResult?: string;
    }>;
    /** Register a known x402 service (for dashboard display and auto-discovery) */
    registerService(service: X402Service): void;
    /** Get x402 economics for dashboard */
    getEconomics(): X402Economics;
    /** Get known x402 services */
    getServices(): X402Service[];
    /** Parse a 402 response to extract payment requirements */
    private _parse402;
    /** Track spending for economics */
    private _trackSpend;
    /** Parse response body safely */
    private _parseBody;
}
//# sourceMappingURL=client.d.ts.map