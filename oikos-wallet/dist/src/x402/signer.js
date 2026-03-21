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
/**
 * ClientEvmSigner-compatible adapter backed by Wallet Isolate IPC.
 *
 * Satisfies the signer interface expected by @x402/evm's registerExactEvmScheme:
 * - address: string (the EOA address)
 * - signTypedData(domain, types, value): Promise<string>
 */
export class IPCEvmSigner {
    wallet;
    _address = '';
    _addressPromise = null;
    constructor(wallet) {
        this.wallet = wallet;
    }
    /** Eagerly resolve and cache the wallet address */
    async init() {
        this._address = await this.wallet.x402GetAddress();
    }
    /** The EOA address of the wallet (used by x402 for from-address in typed data) */
    get address() {
        if (!this._address) {
            // Lazy resolve: trigger async fetch but return empty for now
            // x402 client will typically await init() first
            if (!this._addressPromise) {
                this._addressPromise = this.wallet.x402GetAddress().then(addr => {
                    this._address = addr;
                    return addr;
                });
            }
            return '';
        }
        return this._address;
    }
    /**
     * Get address as async method (some x402 versions use this)
     */
    async getAddress() {
        if (this._address)
            return this._address;
        this._address = await this.wallet.x402GetAddress();
        return this._address;
    }
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
    async signTypedData(domain, types, value) {
        // Extract policy-relevant fields from the EIP-3009 message
        // transferWithAuthorization: from, to, value, validAfter, validBefore, nonce
        const policyAmount = String(value['value'] ?? '0');
        const policyRecipient = String(value['to'] ?? '');
        // Map chain from domain.chainId
        const chainId = Number(domain['chainId'] ?? 0);
        const policyChain = CHAIN_ID_MAP[chainId] ?? 'ethereum';
        // Map symbol from domain.name (token contract name)
        const tokenName = String(domain['name'] ?? '');
        const policySymbol = TOKEN_NAME_MAP[tokenName] ?? 'USDT';
        const result = await this.wallet.x402Sign({
            domain,
            types,
            message: value,
            policyAmount,
            policyRecipient,
            policyChain,
            policySymbol,
        });
        if (!result.approved || !result.signature) {
            throw new Error(`x402 signing rejected: ${result.error ?? 'policy violation'}`);
        }
        return result.signature;
    }
}
/** Map EVM chain IDs to our Chain type for policy evaluation */
const CHAIN_ID_MAP = {
    1: 'ethereum',
    11155111: 'ethereum', // Sepolia
    137: 'polygon',
    42161: 'arbitrum',
    9745: 'ethereum', // Plasma → route through Ethereum policy
    988: 'ethereum', // Stable → route through Ethereum policy
};
/** Map token contract names to our TokenSymbol for policy evaluation */
const TOKEN_NAME_MAP = {
    'USDT0': 'USDT',
    'USD₮0': 'USDT',
    'Tether USD': 'USDT',
    'Tether Gold': 'XAUT',
    'XAUT': 'XAUT',
    'USAT': 'USAT',
    'Tether US': 'USAT',
};
//# sourceMappingURL=signer.js.map