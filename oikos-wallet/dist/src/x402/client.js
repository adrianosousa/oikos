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
import { IPCEvmSigner } from './signer.js';
export class X402Client {
    wallet;
    signer;
    economics;
    knownServices = [];
    wrappedFetch = null;
    initialized = false;
    constructor(wallet) {
        this.wallet = wallet;
        this.signer = new IPCEvmSigner(wallet);
        this.economics = {
            totalSpent: '0',
            totalEarned: '0',
            requestsCompleted: 0,
            requestsFailed: 0,
            servicesPaid: [],
        };
    }
    /**
     * Initialize the x402 client — must be called before fetch().
     * Resolves the wallet address and sets up @x402/fetch wrapper.
     */
    async init() {
        if (this.initialized)
            return;
        // Resolve wallet address for the signer
        await this.signer.init();
        try {
            // Dynamic import of @x402 packages
            const { x402Client, wrapFetchWithPayment } = await import('@x402/fetch');
            const { registerExactEvmScheme } = await import('@x402/evm/exact/client');
            const client = new x402Client();
            registerExactEvmScheme(client, { signer: this.signer });
            this.wrappedFetch = wrapFetchWithPayment(globalThis.fetch, client);
            this.initialized = true;
            console.error(`[x402] Client initialized — address: ${this.signer.address}`);
        }
        catch (err) {
            console.error('[x402] Failed to initialize @x402/fetch — falling back to manual mode:', err instanceof Error ? err.message : err);
            this.initialized = true; // Mark as initialized even on failure — fallback mode
        }
    }
    /**
     * Fetch a URL with x402 auto-pay.
     *
     * If @x402/fetch is available:
     *   Uses proper EIP-3009 transferWithAuthorization flow via facilitator
     *
     * If @x402/fetch unavailable:
     *   Falls back to manual 402 parsing + IPC payment proposal
     */
    async fetch(url, init, maxPaymentUsd = 1.0) {
        if (!this.initialized)
            await this.init();
        // If @x402/fetch wrapper is available, use proper protocol
        if (this.wrappedFetch) {
            return this._fetchWithX402(url, init, maxPaymentUsd);
        }
        // Fallback: manual 402 parsing via IPC payment proposal
        return this._fetchManual(url, init, maxPaymentUsd);
    }
    /** Register a known x402 service (for dashboard display) */
    registerService(service) {
        if (!this.knownServices.find(s => s.url === service.url)) {
            this.knownServices.push(service);
        }
    }
    /** Get x402 economics for dashboard */
    getEconomics() {
        return { ...this.economics };
    }
    /** Get known x402 services */
    getServices() {
        return [...this.knownServices];
    }
    /** Get the signer's address */
    getAddress() {
        return this.signer.address;
    }
    // ── Proper @x402/fetch flow ──
    async _fetchWithX402(url, init, _maxPaymentUsd) {
        try {
            const response = await this.wrappedFetch(url, init);
            const data = await this._parseBody(response);
            if (response.ok) {
                this.economics.requestsCompleted++;
                // Check if payment was made (x-payment-response header)
                const paymentResponse = response.headers.get('x-payment-response');
                if (paymentResponse) {
                    this._trackSpend(url, '0'); // TODO: extract actual amount from header
                    return { ok: true, status: response.status, data, paid: true, paymentResult: paymentResponse };
                }
                return { ok: true, status: response.status, data, paid: false };
            }
            // If still 402 after wrapper attempted payment, the signing was rejected by policy
            if (response.status === 402) {
                this.economics.requestsFailed++;
                return { ok: false, status: 402, data, paid: false, paymentResult: 'policy_rejected' };
            }
            this.economics.requestsFailed++;
            return { ok: false, status: response.status, data, paid: false };
        }
        catch (err) {
            this.economics.requestsFailed++;
            const message = err instanceof Error ? err.message : 'x402 fetch failed';
            return { ok: false, status: 0, data: { error: message }, paid: false };
        }
    }
    // ── Manual fallback (no @x402/fetch) ──
    async _fetchManual(url, init, maxPaymentUsd = 1.0) {
        let response;
        try {
            response = await globalThis.fetch(url, init);
        }
        catch (err) {
            this.economics.requestsFailed++;
            return { ok: false, status: 0, data: { error: err instanceof Error ? err.message : 'Fetch failed' }, paid: false };
        }
        if (response.status !== 402) {
            if (response.ok)
                this.economics.requestsCompleted++;
            else
                this.economics.requestsFailed++;
            return { ok: response.ok, status: response.status, data: await this._parseBody(response), paid: false };
        }
        // Parse 402 body for payment requirements
        const body = await this._parseBody(response);
        const accepts = body['accepts'] ?? [];
        if (accepts.length === 0) {
            this.economics.requestsFailed++;
            return { ok: false, status: 402, data: { error: 'No payment options in 402 response' }, paid: false };
        }
        const option = accepts[0];
        const price = option['price'];
        const amount = String(price?.['amount'] ?? option['maxAmountRequired'] ?? '0');
        const amountNum = Number(amount) / 1_000_000;
        if (amountNum > maxPaymentUsd) {
            this.economics.requestsFailed++;
            return { ok: false, status: 402, data: { error: `Payment too high: $${amountNum} > max $${maxPaymentUsd}` }, paid: false };
        }
        // Route through IPC as a payment proposal (fallback mode)
        try {
            const payTo = String(option['payTo'] ?? '');
            const network = String(option['network'] ?? '');
            const NETWORK_TO_CHAIN = {
                'eip155:11155111': 'ethereum', 'eip155:1': 'ethereum',
                'eip155:137': 'polygon', 'eip155:42161': 'arbitrum',
                'eip155:9745': 'ethereum', 'eip155:988': 'ethereum',
            };
            const chain = NETWORK_TO_CHAIN[network] ?? 'ethereum';
            const proposal = {
                amount,
                symbol: 'USDT',
                chain: chain,
                to: payTo,
                reason: `x402 payment for ${url}`,
                confidence: 0.95,
                strategy: 'x402-auto-pay',
                timestamp: Date.now(),
            };
            const result = await this.wallet.proposalFromExternal('x402', 'payment', proposal);
            if (result.status !== 'executed' || !result.txHash) {
                this.economics.requestsFailed++;
                return { ok: false, status: 402, data: { error: result.error ?? 'Policy rejected' }, paid: false };
            }
            // Retry with payment proof
            const retryResponse = await globalThis.fetch(url, {
                ...init,
                headers: { ...(init?.headers ?? {}), 'X-PAYMENT': result.txHash },
            });
            const data = await this._parseBody(retryResponse);
            this._trackSpend(url, amount);
            if (retryResponse.ok)
                this.economics.requestsCompleted++;
            else
                this.economics.requestsFailed++;
            return { ok: retryResponse.ok, status: retryResponse.status, data, paid: true, paymentResult: result.txHash };
        }
        catch (err) {
            this.economics.requestsFailed++;
            return { ok: false, status: 402, data: { error: err instanceof Error ? err.message : 'Payment failed' }, paid: false };
        }
    }
    // ── Helpers ──
    _trackSpend(url, amount) {
        try {
            const prev = BigInt(this.economics.totalSpent);
            const spent = BigInt(amount);
            this.economics.totalSpent = (prev + spent).toString();
        }
        catch {
            // amount might not be a valid BigInt — ignore
        }
        const domain = new URL(url).hostname;
        if (!this.economics.servicesPaid.includes(domain)) {
            this.economics.servicesPaid.push(domain);
        }
    }
    async _parseBody(response) {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
            try {
                return await response.json();
            }
            catch { /* fall through */ }
        }
        try {
            return await response.text();
        }
        catch {
            return null;
        }
    }
}
//# sourceMappingURL=client.js.map