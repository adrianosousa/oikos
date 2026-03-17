/**
 * x402 Machine Payment Types.
 *
 * HTTP 402 protocol for commodity machine-to-machine payments.
 *
 * x402 is the fourth payment model in Oikos:
 * 1. Direct payments — simple transfers via IPC
 * 2. Room-negotiated payments — complex deals via Hyperswarm
 * 3. x402 machine payments — commodity services via HTTP 402
 * 4. DeFi operations — swaps, bridges, yield via IPC
 */
/** What a 402 response contains */
export interface X402PaymentRequired {
    amount: string;
    asset: string;
    network: string;
    payTo: string;
    maxTimeoutSeconds: number;
}
/** The signed payment authorization (EIP-3009) */
export interface X402SignedPayment {
    authorization: string;
    signature: string;
}
/** x402 service discovery */
export interface X402Service {
    url: string;
    description: string;
    price: string;
    asset: string;
    network: string;
}
/** x402 economics tracking (for dashboard / self-sustaining metrics) */
export interface X402Economics {
    totalSpent: string;
    totalEarned: string;
    requestsCompleted: number;
    requestsFailed: number;
    servicesPaid: string[];
}
//# sourceMappingURL=types.d.ts.map