/**
 * Wallet Types
 *
 * Abstracts WDK wallet operations behind a clean interface.
 * This keeps the rest of the codebase decoupled from WDK internals.
 */
import type { Chain, TokenSymbol } from '../ipc/types.js';
export interface ChainConfig {
    chain: Chain;
    provider?: string;
    network?: string;
    host?: string;
    port?: number;
    indexerUrl?: string;
    transportEndpoint?: string;
    dataDir?: string;
}
export interface WalletBalance {
    chain: Chain;
    symbol: TokenSymbol;
    raw: bigint;
    formatted: string;
}
export interface TransactionResult {
    success: boolean;
    txHash?: string;
    error?: string;
}
/** Result of an ERC-8004 identity lifecycle operation. */
export interface IdentityOperationResult {
    success: boolean;
    txHash?: string;
    agentId?: string;
    error?: string;
}
/** On-chain reputation data from ERC-8004 ReputationRegistry. */
export interface OnChainReputation {
    feedbackCount: number;
    totalValue: string;
    valueDecimals: number;
}
export interface WalletOperations {
    /** Initialize the wallet with a seed phrase and register chains. */
    initialize(seed: string, chains: ChainConfig[]): Promise<void>;
    /** Get the wallet address for a chain. */
    getAddress(chain: Chain): Promise<string>;
    /** Get the balance for a chain and token. */
    getBalance(chain: Chain, symbol: TokenSymbol): Promise<WalletBalance>;
    /** Get all balances across all chains and assets. */
    getBalances(): Promise<WalletBalance[]>;
    /**
     * Send a transaction.
     * @security This is the code path that moves funds for payments.
     */
    sendTransaction(chain: Chain, to: string, amount: bigint, symbol: TokenSymbol): Promise<TransactionResult>;
    /** Swap between token pairs on the same chain. */
    swap(chain: Chain, fromSymbol: TokenSymbol, toSymbol: TokenSymbol, fromAmount: bigint): Promise<TransactionResult>;
    /** Bridge tokens cross-chain. */
    bridge(fromChain: Chain, toChain: Chain, symbol: TokenSymbol, amount: bigint): Promise<TransactionResult>;
    /** Deposit tokens into a yield protocol. */
    deposit(chain: Chain, symbol: TokenSymbol, amount: bigint, protocol: string): Promise<TransactionResult>;
    /** Withdraw tokens from a yield protocol. */
    withdraw(chain: Chain, symbol: TokenSymbol, amount: bigint, protocol: string): Promise<TransactionResult>;
    /** Register an on-chain ERC-8004 identity (mints ERC-721 NFT). */
    registerIdentity(chain: Chain, agentURI: string): Promise<IdentityOperationResult>;
    /** Set the agent's wallet address on the IdentityRegistry (EIP-712 signed). */
    setAgentWallet(chain: Chain, agentId: string, deadline: number): Promise<IdentityOperationResult>;
    /** Submit on-chain reputation feedback for a peer agent. */
    giveFeedback(chain: Chain, targetAgentId: string, value: number, valueDecimals: number, tag1: string, tag2: string, endpoint: string, feedbackURI: string, feedbackHash: string): Promise<TransactionResult>;
    /** Query on-chain reputation from ERC-8004 ReputationRegistry. */
    getOnChainReputation(chain: Chain, agentId: string): Promise<OnChainReputation>;
    /** Issue a new RGB asset with given ticker, name, supply, and precision. */
    rgbIssueAsset(ticker: string, name: string, supply: bigint, precision: number): Promise<TransactionResult & {
        assetId?: string;
    }>;
    /** Transfer an RGB asset to a receiver via invoice. */
    rgbTransfer(invoice: string, amount: bigint, assetId: string): Promise<TransactionResult>;
    /** Generate a receive invoice for incoming RGB transfers. */
    rgbReceiveAsset(assetId?: string): Promise<{
        invoice: string;
        recipientId: string;
    }>;
    /** List all RGB assets with balances. */
    rgbListAssets(): Promise<Array<{
        assetId: string;
        ticker: string;
        name: string;
        precision: number;
        balance: string;
    }>>;
}
//# sourceMappingURL=types.d.ts.map