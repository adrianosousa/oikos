/**
 * x402 Client — Auto-pay for commodity services via HTTP 402.
 *
 * STUB: Interfaces and structure defined. Full implementation in Phase 5.
 *
 * When implemented:
 * - Intercepts HTTP 402 responses from x402-enabled services
 * - Parses payment requirements (amount, asset, network, payTo)
 * - Creates PaymentProposal and sends to Wallet via IPC
 * - Only retries with signed X-PAYMENT header after PolicyEngine approval
 * - WDK WalletAccountEvm satisfies ClientEvmSigner directly (drop-in)
 *
 * Key invariant: x402 payments flow through the SAME PolicyEngine
 * as all other payment types. The client MUST NOT sign without policy approval.
 */

export class X402Client {
  // TODO Phase 5: @x402/fetch integration
  // TODO Phase 5: 402 response parsing
  // TODO Phase 5: PaymentProposal creation from 402 response
  // TODO Phase 5: Policy-checked signing via wallet IPC
  // TODO Phase 5: Support Plasma (eip155:9745) and Stable (eip155:988) chains
}
