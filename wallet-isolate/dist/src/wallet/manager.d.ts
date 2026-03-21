/**
 * Wallet Manager — WDK initialization and operations.
 *
 * THE ONLY MODULE THAT TOUCHES THE SEED PHRASE.
 * THE ONLY MODULE THAT INTERACTS WITH WDK.
 *
 * @security The seed phrase is passed to `new WDK(seed)` exactly once.
 * After initialization, no other module can access the seed.
 * This module NEVER logs, returns, or exposes the seed in any way.
 */
import type { Chain, TokenSymbol } from '../ipc/types.js';
import type { ChainConfig, WalletBalance, TransactionResult, WalletOperations, IdentityOperationResult, OnChainReputation } from './types.js';
export declare class WalletManager implements WalletOperations {
    private wdk;
    private sparkManager;
    private sparkAccount;
    private sparkAddress;
    private initialized;
    private rpcUrls;
    /**
     * Initialize the wallet.
     * @security Seed is consumed here and NEVER stored or exposed.
     */
    initialize(seed: string, chains: ChainConfig[]): Promise<void>;
    getAddress(chain: Chain): Promise<string>;
    getBalance(chain: Chain, symbol: TokenSymbol): Promise<WalletBalance>;
    getBalances(): Promise<WalletBalance[]>;
    /**
     * @security THE CODE PATH THAT MOVES FUNDS FOR PAYMENTS.
     * This must only be called from ProposalExecutor after policy approval.
     */
    sendTransaction(chain: Chain, to: string, amount: bigint, symbol: TokenSymbol): Promise<TransactionResult>;
    /**
     * Swap tokens via Velora DEX protocol.
     * Requires @tetherto/wdk-protocol-swap-velora-evm.
     */
    swap(chain: Chain, fromSymbol: TokenSymbol, toSymbol: TokenSymbol, fromAmount: bigint): Promise<TransactionResult>;
    /**
     * Bridge tokens cross-chain via USDT0 protocol.
     * Requires @tetherto/wdk-protocol-bridge-usdt0-evm.
     */
    bridge(fromChain: Chain, toChain: Chain, symbol: TokenSymbol, amount: bigint): Promise<TransactionResult>;
    /**
     * Deposit tokens into Aave lending pool.
     * Requires @tetherto/wdk-protocol-lending-aave-evm.
     */
    deposit(chain: Chain, symbol: TokenSymbol, amount: bigint, _protocol: string): Promise<TransactionResult>;
    /**
     * Withdraw tokens from Aave lending pool.
     * Requires @tetherto/wdk-protocol-lending-aave-evm.
     */
    withdraw(chain: Chain, symbol: TokenSymbol, amount: bigint, _protocol: string): Promise<TransactionResult>;
    /**
     * Register an on-chain ERC-8004 identity by calling IdentityRegistry.register(agentURI).
     * Mints an ERC-721 NFT. Parses the Transfer event to extract the agentId.
     */
    registerIdentity(chain: Chain, agentURI: string): Promise<IdentityOperationResult>;
    /**
     * Set the agent's wallet address on the IdentityRegistry.
     * Requires EIP-712 signing via WDK's signer.
     *
     * The agent's EOA is both the NFT owner and the wallet being set,
     * so it signs the EIP-712 data with its own key and sends the tx.
     */
    setAgentWallet(chain: Chain, agentId: string, deadline: number): Promise<IdentityOperationResult>;
    /**
     * Submit on-chain reputation feedback to the ReputationRegistry.
     */
    giveFeedback(chain: Chain, targetAgentId: string, value: number, valueDecimals: number, tag1: string, tag2: string, endpoint: string, feedbackURI: string, feedbackHash: string): Promise<TransactionResult>;
    /**
     * Query on-chain reputation from the ReputationRegistry via eth_call.
     * This is a read-only call (no gas, no tx).
     */
    getOnChainReputation(chain: Chain, agentId: string): Promise<OnChainReputation>;
    rgbIssueAsset(_ticker: string, _name: string, _supply: bigint, _precision: number): Promise<TransactionResult & {
        assetId?: string;
    }>;
    rgbTransfer(_invoice: string, _amount: bigint, _assetId: string): Promise<TransactionResult>;
    rgbReceiveAsset(_assetId?: string): Promise<{
        invoice: string;
        recipientId: string;
    }>;
    rgbListAssets(): Promise<Array<{
        assetId: string;
        ticker: string;
        name: string;
        precision: number;
        balance: string;
    }>>;
    /** Create a Lightning invoice for receiving payments. */
    sparkCreateInvoice(amountSats?: number, memo?: string): Promise<{
        invoice: string;
        id: string;
        amountSats: number;
    }>;
    /** Pay a Lightning invoice. */
    sparkPayInvoice(encodedInvoice: string, maxFeeSats?: number): Promise<TransactionResult>;
    /** Get a deposit address for bridging BTC L1 → Spark L2. */
    sparkGetDepositAddress(): Promise<string>;
    /** Get the Spark account (cached at init time for performance). */
    private getSparkAccount;
    /**
     * Sign EIP-712 typed data using the EVM wallet account.
     * Used by x402 for EIP-3009 transferWithAuthorization.
     * @security Only called after PolicyEngine approval in wallet-isolate main.
     */
    signTypedData(typedData: {
        domain: Record<string, unknown>;
        types: Record<string, Array<{
            name: string;
            type: string;
        }>>;
        message: Record<string, unknown>;
    }): Promise<string>;
    /** Get the WDK account for a given chain. */
    private getAccount;
    /**
     * Make a raw JSON-RPC eth_call to a contract (read-only, no gas).
     * Used for ERC-8004 reputation queries.
     */
    private ethCall;
    private ensureInitialized;
}
/**
 * Mock Wallet Manager — for testing and demo without real WDK.
 * Returns predictable values, never touches a blockchain.
 */
export declare class MockWalletManager implements WalletOperations {
    private balances;
    private initialized;
    private nextAgentId;
    private feedbackStore;
    private mockRgbAssets;
    private nextRgbAssetId;
    initialize(_seed: string, chains: ChainConfig[]): Promise<void>;
    getAddress(chain: Chain): Promise<string>;
    sparkCreateInvoice(amountSats?: number, _memo?: string): Promise<{
        invoice: string;
        id: string;
        amountSats: number;
    }>;
    sparkPayInvoice(encodedInvoice: string, _maxFeeSats?: number): Promise<TransactionResult>;
    sparkGetDepositAddress(): Promise<string>;
    getBalance(chain: Chain, symbol: TokenSymbol): Promise<WalletBalance>;
    getBalances(): Promise<WalletBalance[]>;
    sendTransaction(chain: Chain, _to: string, amount: bigint, symbol: TokenSymbol): Promise<TransactionResult>;
    swap(chain: Chain, fromSymbol: TokenSymbol, toSymbol: TokenSymbol, fromAmount: bigint): Promise<TransactionResult>;
    bridge(fromChain: Chain, toChain: Chain, symbol: TokenSymbol, amount: bigint): Promise<TransactionResult>;
    deposit(chain: Chain, symbol: TokenSymbol, amount: bigint, _protocol: string): Promise<TransactionResult>;
    withdraw(chain: Chain, symbol: TokenSymbol, amount: bigint, _protocol: string): Promise<TransactionResult>;
    registerIdentity(_chain: Chain, _agentURI: string): Promise<IdentityOperationResult>;
    setAgentWallet(_chain: Chain, _agentId: string, _deadline: number): Promise<IdentityOperationResult>;
    giveFeedback(_chain: Chain, targetAgentId: string, value: number, valueDecimals: number, _tag1: string, _tag2: string, _endpoint: string, _feedbackURI: string, _feedbackHash: string): Promise<TransactionResult>;
    getOnChainReputation(_chain: Chain, agentId: string): Promise<OnChainReputation>;
    rgbIssueAsset(ticker: string, name: string, supply: bigint, precision: number): Promise<TransactionResult & {
        assetId?: string;
    }>;
    rgbTransfer(invoice: string, amount: bigint, assetId: string): Promise<TransactionResult>;
    rgbReceiveAsset(assetId?: string): Promise<{
        invoice: string;
        recipientId: string;
    }>;
    rgbListAssets(): Promise<Array<{
        assetId: string;
        ticker: string;
        name: string;
        precision: number;
        balance: string;
    }>>;
    private ensureInit;
}
//# sourceMappingURL=manager.d.ts.map