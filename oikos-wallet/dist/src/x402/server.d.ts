/**
 * x402 Resource Server — Sell services behind HTTP 402 paywalls.
 *
 * Adds x402 payment middleware to the Brain's Express dashboard.
 * Agents can monetize their services (price feeds, analysis, strategy files)
 * by requiring x402 micropayments.
 *
 * Uses the hosted SemanticPay facilitator for verification + settlement.
 * The agent's wallet address receives payments.
 *
 * Chains: Plasma (eip155:9745) with USD₮0
 * Facilitator: https://x402.semanticpay.io/
 *
 * @security Revenue flows TO the wallet, not from it. No policy check needed
 * for receiving payments. The facilitator handles verification and settlement.
 */
import type { Express } from 'express';
import type { WalletIPCClient } from '../ipc/client.js';
/** Price in smallest units (6 decimals). 1000 = $0.001 */
export interface X402RouteConfig {
    /** Route path (e.g., "/api/x402/price-feed") */
    path: string;
    /** HTTP method */
    method: 'GET' | 'POST';
    /** Price in USDT0 smallest units */
    price: string;
    /** Human description */
    description: string;
    /** MIME type of response */
    mimeType?: string;
}
/** Default x402 service routes */
export declare const DEFAULT_ROUTES: X402RouteConfig[];
/**
 * Mount x402 payment-protected routes on the Express app.
 *
 * Two modes:
 * 1. With @x402/express — proper protocol with facilitator verification
 * 2. Without @x402/express — manual 402 responses (demo/fallback)
 */
export declare function mountX402Server(app: Express, wallet: WalletIPCClient, routes?: X402RouteConfig[]): Promise<{
    mounted: boolean;
    routes: string[];
    payToAddress: string;
}>;
/**
 * x402 service discovery endpoint.
 * Returns available paid services in a machine-readable format.
 */
export declare function mountX402Discovery(app: Express, routes: X402RouteConfig[], payToAddress: string): void;
//# sourceMappingURL=server.d.ts.map