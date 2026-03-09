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
import type {
  X402PaymentRequired,
  X402Service,
  X402Economics,
} from './types.js';
import type { TokenSymbol, Chain } from '../ipc/types.js';

/** Map x402 network identifiers to our Chain type */
const NETWORK_TO_CHAIN: Record<string, Chain> = {
  'eip155:11155111': 'ethereum', // Sepolia
  'eip155:1': 'ethereum',
  'eip155:137': 'polygon',
  'eip155:42161': 'arbitrum',
  'eip155:9745': 'ethereum',  // Plasma → route through Ethereum for hackathon
  'eip155:988': 'ethereum',   // Stable → route through Ethereum for hackathon
};

/** Map x402 asset identifiers to our TokenSymbol */
const ASSET_TO_SYMBOL: Record<string, TokenSymbol> = {
  'USDT': 'USDT',
  'USD₮0': 'USDT',  // Plasma/Stable native stablecoin
  'USAT': 'USAT',
  'XAUT': 'XAUT',
};

export class X402Client {
  private wallet: WalletIPCClient;
  private economics: X402Economics;
  private knownServices: X402Service[] = [];

  constructor(wallet: WalletIPCClient) {
    this.wallet = wallet;
    this.economics = {
      totalSpent: '0',
      totalEarned: '0',
      requestsCompleted: 0,
      requestsFailed: 0,
      servicesPaid: [],
    };
  }

  /**
   * Fetch a URL with x402 auto-pay.
   *
   * 1. Makes initial request
   * 2. If 402 returned, parses payment requirements
   * 3. Creates PaymentProposal → sends to Wallet via IPC → PolicyEngine evaluates
   * 4. If approved, retries with X-PAYMENT header
   * 5. Returns the final response
   *
   * @param url Target URL
   * @param init Standard fetch options
   * @param maxPaymentUsd Maximum USD willing to pay (safety cap)
   * @returns Response from the service
   */
  async fetch(
    url: string,
    init?: RequestInit,
    maxPaymentUsd = 1.0,
  ): Promise<{ ok: boolean; status: number; data: unknown; paid: boolean; paymentResult?: string }> {
    // Step 1: Initial request
    let response: Response;
    try {
      response = await globalThis.fetch(url, init);
    } catch (err) {
      this.economics.requestsFailed++;
      const message = err instanceof Error ? err.message : 'Fetch failed';
      return { ok: false, status: 0, data: { error: message }, paid: false };
    }

    // Not a 402 — return as-is
    if (response.status !== 402) {
      if (response.ok) this.economics.requestsCompleted++;
      else this.economics.requestsFailed++;
      const data = await this._parseBody(response);
      return { ok: response.ok, status: response.status, data, paid: false };
    }

    // Step 2: Parse 402 payment requirements
    const paymentReq = this._parse402(response);
    if (!paymentReq) {
      this.economics.requestsFailed++;
      return { ok: false, status: 402, data: { error: 'Unparseable 402 response' }, paid: false };
    }

    // Safety check: don't pay more than maxPaymentUsd
    const amountNum = Number(paymentReq.amount) / 1_000_000; // Assume 6 decimals
    if (amountNum > maxPaymentUsd) {
      this.economics.requestsFailed++;
      return {
        ok: false, status: 402,
        data: { error: `Payment too high: $${amountNum} > max $${maxPaymentUsd}` },
        paid: false,
      };
    }

    // Step 3: Create payment proposal and send through PolicyEngine
    const chain = NETWORK_TO_CHAIN[paymentReq.network] ?? 'ethereum';
    const symbol = ASSET_TO_SYMBOL[paymentReq.asset] ?? 'USDT';

    try {
      const result = await this.wallet.proposalFromExternal('x402', 'payment', {
        amount: paymentReq.amount,
        symbol,
        chain,
        to: paymentReq.payTo,
        reason: `x402 payment for ${url}`,
        confidence: 0.95,
        strategy: 'x402-auto-pay',
        timestamp: Date.now(),
      } as import('../ipc/types.js').PaymentProposal);

      if (result.status !== 'executed' || !result.txHash) {
        this.economics.requestsFailed++;
        const reason = result.status === 'rejected'
          ? `Policy rejected: ${result.violations.join(', ')}`
          : result.error ?? 'Unknown failure';
        return { ok: false, status: 402, data: { error: reason }, paid: false, paymentResult: result.status };
      }

      // Step 4: Retry with payment proof
      const retryResponse = await globalThis.fetch(url, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          'X-PAYMENT': result.txHash,
          'X-PAYMENT-NETWORK': paymentReq.network,
        },
      });

      // Track economics
      this._trackSpend(url, paymentReq.amount);

      const data = await this._parseBody(retryResponse);
      if (retryResponse.ok) this.economics.requestsCompleted++;
      else this.economics.requestsFailed++;

      return {
        ok: retryResponse.ok,
        status: retryResponse.status,
        data,
        paid: true,
        paymentResult: result.txHash,
      };
    } catch (err) {
      this.economics.requestsFailed++;
      const message = err instanceof Error ? err.message : 'Payment failed';
      return { ok: false, status: 402, data: { error: message }, paid: false };
    }
  }

  /** Register a known x402 service (for dashboard display and auto-discovery) */
  registerService(service: X402Service): void {
    if (!this.knownServices.find(s => s.url === service.url)) {
      this.knownServices.push(service);
    }
  }

  /** Get x402 economics for dashboard */
  getEconomics(): X402Economics {
    return { ...this.economics };
  }

  /** Get known x402 services */
  getServices(): X402Service[] {
    return [...this.knownServices];
  }

  // ── Private ──

  /** Parse a 402 response to extract payment requirements */
  private _parse402(response: Response): X402PaymentRequired | null {
    // Try X-PAYMENT-REQUIRED header (standard x402)
    const header = response.headers.get('x-payment-required');
    if (header) {
      try {
        return JSON.parse(header) as X402PaymentRequired;
      } catch {
        // Fall through to body parsing
      }
    }

    // Try response body (alternative format)
    // We can't easily await here since this is called from sync context,
    // but the body was already consumed. Return null for unparseable.
    return null;
  }

  /** Track spending for economics */
  private _trackSpend(url: string, amount: string): void {
    const prev = BigInt(this.economics.totalSpent);
    const spent = BigInt(amount);
    this.economics.totalSpent = (prev + spent).toString();

    const domain = new URL(url).hostname;
    if (!this.economics.servicesPaid.includes(domain)) {
      this.economics.servicesPaid.push(domain);
    }
  }

  /** Parse response body safely */
  private async _parseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try { return await response.json(); } catch { /* fall through */ }
    }
    try { return await response.text(); } catch { return null; }
  }
}
