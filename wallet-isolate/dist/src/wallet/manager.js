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
import { ERC8004_CONTRACTS, TRANSFER_EVENT_TOPIC, EIP712_DOMAIN, SET_AGENT_WALLET_TYPES } from '../erc8004/constants.js';
import { encodeRegister, encodeSetAgentWallet, encodeGiveFeedback, encodeGetSummary, decodeUint256, decodeSummaryResult, } from '../erc8004/abi-encode.js';
/** Decimals per token for formatting */
function getDecimals(symbol) {
    switch (symbol) {
        case 'BTC': return 8;
        case 'ETH': return 18;
        default: return 6; // USDT, XAUT, USAT
    }
}
/** Format raw balance to human-readable string */
function formatBalance(raw, symbol) {
    const decimals = getDecimals(symbol);
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const fraction = raw % divisor;
    const fractionStr = fraction.toString().padStart(decimals, '0');
    // Trim trailing zeros for readability, keep at least 2
    const trimmed = fractionStr.replace(/0+$/, '').padEnd(2, '0');
    return `${whole}.${trimmed} ${symbol}`;
}
// ── Known Token Addresses per Chain ──
// WDK protocol modules require contract addresses (not symbols).
// These are testnet addresses — production would use mainnet.
const TOKEN_ADDRESSES = {
    ethereum: {
        USDT: '0xd077a400968890eacc75cdc901f0356c943e4fdb', // Sepolia USDT (confirmed faucet)
        ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native ETH sentinel
    },
    arbitrum: {
        USDT: '0x30a51024e25A6E8bDc4C1B68A9BDcF1B3C8fDB70', // Arbitrum Sepolia USDT
        ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    },
};
/** Resolve a TokenSymbol to its contract address for a given chain. */
function getTokenAddress(chain, symbol) {
    return TOKEN_ADDRESSES[chain]?.[symbol];
}
export class WalletManager {
    wdk = null;
    sparkManager = null;
    initialized = false;
    rpcUrls = new Map();
    /**
     * Initialize the wallet.
     * @security Seed is consumed here and NEVER stored or exposed.
     */
    async initialize(seed, chains) {
        if (this.initialized) {
            throw new Error('WalletManager already initialized');
        }
        // Dynamic import — WDK may need Bare-specific loading
        const { default: WDK } = await import('@tetherto/wdk');
        const wdk = new WDK(seed);
        for (const config of chains) {
            if (config.chain === 'ethereum' || config.chain === 'polygon' || config.chain === 'arbitrum') {
                const { default: WalletManagerEvm } = await import('@tetherto/wdk-wallet-evm');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WDK registerWallet has loose typing
                wdk.registerWallet(config.chain, WalletManagerEvm, {
                    provider: config.provider
                });
                // Store RPC URL for eth_call operations
                if (config.provider) {
                    this.rpcUrls.set(config.chain, config.provider);
                }
            }
            else if (config.chain === 'bitcoin') {
                const { default: WalletManagerBtc } = await import('@tetherto/wdk-wallet-btc');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WDK registerWallet has loose typing
                wdk.registerWallet(config.chain, WalletManagerBtc, {
                    network: config.network,
                    host: config.host,
                    port: config.port
                });
            }
            else if (config.chain === 'spark') {
                try {
                    const { default: WalletManagerSpark } = await import('@tetherto/wdk-wallet-spark');
                    // Spark is a standalone wallet, not registered with WDK core
                    const sparkConfig = {};
                    if (config.network)
                        sparkConfig.network = config.network;
                    if (config.sparkScanApiKey)
                        sparkConfig.sparkScanApiKey = config.sparkScanApiKey;
                    this.sparkManager = new WalletManagerSpark(seed, sparkConfig);
                    console.log(`[wallet-isolate] Spark wallet initialized (${config.network || 'MAINNET'})`);
                }
                catch (err) {
                    console.error('[wallet-isolate] Spark init failed:', err instanceof Error ? err.message : err);
                }
            }
        }
        this.wdk = wdk;
        this.initialized = true;
    }
    async getAddress(chain) {
        if (chain === 'spark') {
            const sparkAccount = await this.getSparkAccount();
            return sparkAccount.getAddress();
        }
        const account = await this.getAccount(chain);
        return account.getAddress();
    }
    async getBalance(chain, symbol) {
        if (chain === 'spark') {
            const sparkAccount = await this.getSparkAccount();
            const raw = await sparkAccount.getBalance();
            return { chain, symbol: 'BTC', raw, formatted: formatBalance(raw, 'BTC') };
        }
        const account = await this.getAccount(chain);
        // For ERC-20 tokens, use getTokenBalance with contract address
        if (symbol !== 'ETH' && symbol !== 'BTC') {
            const tokenAddress = getTokenAddress(chain, symbol);
            if (tokenAddress && tokenAddress !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
                try {
                    // WDK EVM account has getTokenBalance for ERC-20
                    const raw = await account.getTokenBalance(tokenAddress);
                    return { chain, symbol, raw: BigInt(raw), formatted: formatBalance(BigInt(raw), symbol) };
                }
                catch {
                    // Fallback: token might not exist on this chain
                    return { chain, symbol, raw: 0n, formatted: formatBalance(0n, symbol) };
                }
            }
        }
        // Native balance (ETH or BTC)
        const raw = await account.getBalance();
        return { chain, symbol, raw, formatted: formatBalance(raw, symbol) };
    }
    async getBalances() {
        // TODO: implement full multi-asset balance query via WDK
        return [];
    }
    /**
     * @security THE CODE PATH THAT MOVES FUNDS FOR PAYMENTS.
     * This must only be called from ProposalExecutor after policy approval.
     */
    async sendTransaction(chain, to, amount, _symbol) {
        this.ensureInitialized();
        try {
            if (chain === 'spark') {
                const sparkAccount = await this.getSparkAccount();
                const result = await sparkAccount.sendTransaction({ to, value: amount });
                return { success: true, txHash: result.hash };
            }
            const account = await this.getAccount(chain);
            const result = await account.sendTransaction({ to, value: amount });
            return { success: true, txHash: result.hash };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown transaction error';
            return { success: false, error: message };
        }
    }
    // ── DeFi Operations via WDK Protocol Modules ──
    /**
     * Swap tokens via Velora DEX protocol.
     * Requires @tetherto/wdk-protocol-swap-velora-evm.
     */
    async swap(chain, fromSymbol, toSymbol, fromAmount) {
        this.ensureInitialized();
        try {
            const account = await this.getAccount(chain);
            // Resolve token addresses
            const tokenIn = getTokenAddress(chain, fromSymbol);
            const tokenOut = getTokenAddress(chain, toSymbol);
            if (!tokenIn)
                return { success: false, error: `No token address for ${fromSymbol} on ${chain}` };
            if (!tokenOut)
                return { success: false, error: `No token address for ${toSymbol} on ${chain}` };
            // Dynamic import — only loaded when swap is actually called
            const { default: VeloraProtocolEvm } = await import('@tetherto/wdk-protocol-swap-velora-evm');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WDK account satisfies interface at runtime
            const velora = new VeloraProtocolEvm(account, { swapMaxFee: 1000000n });
            const result = await velora.swap({
                tokenIn,
                tokenOut,
                tokenInAmount: fromAmount,
            });
            return { success: true, txHash: result.hash };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown swap error';
            return { success: false, error: message };
        }
    }
    /**
     * Bridge tokens cross-chain via USDT0 protocol.
     * Requires @tetherto/wdk-protocol-bridge-usdt0-evm.
     */
    async bridge(fromChain, toChain, symbol, amount) {
        this.ensureInitialized();
        try {
            const account = await this.getAccount(fromChain);
            const address = await account.getAddress();
            // Resolve token address on the source chain
            const token = getTokenAddress(fromChain, symbol);
            if (!token)
                return { success: false, error: `No token address for ${symbol} on ${fromChain}` };
            const { default: Usdt0ProtocolEvm } = await import('@tetherto/wdk-protocol-bridge-usdt0-evm');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WDK account satisfies interface at runtime
            const bridgeProtocol = new Usdt0ProtocolEvm(account, { bridgeMaxFee: 1000000n });
            const result = await bridgeProtocol.bridge({
                targetChain: toChain,
                recipient: address,
                token,
                amount,
            });
            return { success: true, txHash: result.hash };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown bridge error';
            return { success: false, error: message };
        }
    }
    /**
     * Deposit tokens into Aave lending pool.
     * Requires @tetherto/wdk-protocol-lending-aave-evm.
     */
    async deposit(chain, symbol, amount, _protocol) {
        this.ensureInitialized();
        try {
            const account = await this.getAccount(chain);
            const token = getTokenAddress(chain, symbol);
            if (!token)
                return { success: false, error: `No token address for ${symbol} on ${chain}` };
            const { default: AaveProtocolEvm } = await import('@tetherto/wdk-protocol-lending-aave-evm');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WDK account satisfies interface at runtime
            const aave = new AaveProtocolEvm(account);
            const result = await aave.supply({ token, amount });
            return { success: true, txHash: result.hash };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown deposit error';
            return { success: false, error: message };
        }
    }
    /**
     * Withdraw tokens from Aave lending pool.
     * Requires @tetherto/wdk-protocol-lending-aave-evm.
     */
    async withdraw(chain, symbol, amount, _protocol) {
        this.ensureInitialized();
        try {
            const account = await this.getAccount(chain);
            const token = getTokenAddress(chain, symbol);
            if (!token)
                return { success: false, error: `No token address for ${symbol} on ${chain}` };
            const { default: AaveProtocolEvm } = await import('@tetherto/wdk-protocol-lending-aave-evm');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WDK account satisfies interface at runtime
            const aave = new AaveProtocolEvm(account);
            const result = await aave.withdraw({ token, amount });
            return { success: true, txHash: result.hash };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown withdraw error';
            return { success: false, error: message };
        }
    }
    // ── ERC-8004 Identity & Reputation ──
    /**
     * Register an on-chain ERC-8004 identity by calling IdentityRegistry.register(agentURI).
     * Mints an ERC-721 NFT. Parses the Transfer event to extract the agentId.
     */
    async registerIdentity(chain, agentURI) {
        this.ensureInitialized();
        try {
            const account = await this.getAccount(chain);
            const calldata = encodeRegister(agentURI);
            const tx = await account.sendTransaction({
                to: ERC8004_CONTRACTS.identityRegistry,
                value: 0n,
                data: calldata,
            });
            // Parse agentId from the Transfer event in the tx receipt
            let agentId;
            const receipt = await account.getTransactionReceipt(tx.hash);
            if (receipt?.logs) {
                for (const log of receipt.logs) {
                    // ERC-721 Transfer(address from, address to, uint256 tokenId)
                    // tokenId is the 3rd indexed topic (topics[3])
                    if (log.topics[0] === TRANSFER_EVENT_TOPIC && log.topics[3]) {
                        agentId = decodeUint256(log.topics[3]);
                        break;
                    }
                }
            }
            return { success: true, txHash: tx.hash, agentId };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown registerIdentity error';
            return { success: false, error: message };
        }
    }
    /**
     * Set the agent's wallet address on the IdentityRegistry.
     * Requires EIP-712 signing via WDK's signer.
     *
     * The agent's EOA is both the NFT owner and the wallet being set,
     * so it signs the EIP-712 data with its own key and sends the tx.
     */
    async setAgentWallet(chain, agentId, deadline) {
        this.ensureInitialized();
        try {
            const account = await this.getAccount(chain);
            const address = await account.getAddress();
            // Build EIP-712 message
            const message = {
                agentId: BigInt(agentId),
                newWallet: address,
                deadline: BigInt(deadline),
                nonce: 0n, // First wallet set — nonce 0
            };
            // Sign via WDK account's internal signer (EIP-712 typed data)
            let signature;
            if (account._signer && typeof account._signer.signTypedData === 'function') {
                // WDK signer has signTypedData (ethers pattern)
                signature = await account._signer.signTypedData(EIP712_DOMAIN, SET_AGENT_WALLET_TYPES, message);
            }
            else {
                return {
                    success: false,
                    error: 'WDK account signer does not support EIP-712 signTypedData — required for setAgentWallet',
                };
            }
            const calldata = encodeSetAgentWallet(agentId, address, deadline, signature);
            const tx = await account.sendTransaction({
                to: ERC8004_CONTRACTS.identityRegistry,
                value: 0n,
                data: calldata,
            });
            return { success: true, txHash: tx.hash };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown setAgentWallet error';
            return { success: false, error: message };
        }
    }
    /**
     * Submit on-chain reputation feedback to the ReputationRegistry.
     */
    async giveFeedback(chain, targetAgentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash) {
        this.ensureInitialized();
        try {
            const account = await this.getAccount(chain);
            const calldata = encodeGiveFeedback(targetAgentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash);
            const tx = await account.sendTransaction({
                to: ERC8004_CONTRACTS.reputationRegistry,
                value: 0n,
                data: calldata,
            });
            return { success: true, txHash: tx.hash };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'Unknown giveFeedback error';
            return { success: false, error: msg };
        }
    }
    /**
     * Query on-chain reputation from the ReputationRegistry via eth_call.
     * This is a read-only call (no gas, no tx).
     */
    async getOnChainReputation(chain, agentId) {
        this.ensureInitialized();
        try {
            const calldata = encodeGetSummary(agentId);
            const resultHex = await this.ethCall(chain, ERC8004_CONTRACTS.reputationRegistry, calldata);
            const summary = decodeSummaryResult(resultHex);
            return {
                feedbackCount: summary.count,
                totalValue: summary.totalValue,
                valueDecimals: summary.valueDecimals,
            };
        }
        catch {
            // Read-only query — return defaults on failure
            return { feedbackCount: 0, totalValue: '0', valueDecimals: 0 };
        }
    }
    // ── RGB Asset Operations ──
    // Real WDK RGB integration via @utexo/wdk-wallet-rgb (Step 4).
    // These stubs return errors until the RGB module is registered.
    async rgbIssueAsset(_ticker, _name, _supply, _precision) {
        return { success: false, error: 'RGB wallet module not configured. Set RGB_ENABLED=true.' };
    }
    async rgbTransfer(_invoice, _amount, _assetId) {
        return { success: false, error: 'RGB wallet module not configured. Set RGB_ENABLED=true.' };
    }
    async rgbReceiveAsset(_assetId) {
        throw new Error('RGB wallet module not configured. Set RGB_ENABLED=true.');
    }
    async rgbListAssets() {
        return [];
    }
    // ── Spark Lightning Operations ──
    /** Create a Lightning invoice for receiving payments. */
    async sparkCreateInvoice(amountSats, memo) {
        const sparkAccount = await this.getSparkAccount();
        return sparkAccount.createLightningInvoice({ amountSats, memo });
    }
    /** Pay a Lightning invoice. */
    async sparkPayInvoice(encodedInvoice, maxFeeSats) {
        try {
            const sparkAccount = await this.getSparkAccount();
            const result = await sparkAccount.payLightningInvoice({ encodedInvoice, maxFeeSats });
            return { success: true, txHash: result.id };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown Lightning payment error';
            return { success: false, error: message };
        }
    }
    /** Get a deposit address for bridging BTC L1 → Spark L2. */
    async sparkGetDepositAddress() {
        const sparkAccount = await this.getSparkAccount();
        return sparkAccount.getStaticDepositAddress();
    }
    // ── Private Helpers ──
    /** Get the Spark account (separate from WDK core). */
    async getSparkAccount() {
        this.ensureInitialized();
        if (!this.sparkManager) {
            throw new Error('Spark wallet not initialized. Add spark chain to config.');
        }
        return this.sparkManager.getAccount(0);
    }
    /** Get the WDK account for a given chain. */
    async getAccount(chain) {
        this.ensureInitialized();
        // wdk is guaranteed non-null after ensureInitialized
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.wdk.getAccount(chain, 0);
    }
    /**
     * Make a raw JSON-RPC eth_call to a contract (read-only, no gas).
     * Used for ERC-8004 reputation queries.
     */
    async ethCall(chain, to, data) {
        const rpcUrl = this.rpcUrls.get(chain);
        if (!rpcUrl)
            throw new Error(`No RPC URL configured for chain: ${chain}`);
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [{ to, data }, 'latest'],
            }),
        });
        const result = await response.json();
        if (result.error)
            throw new Error(`eth_call failed: ${result.error.message}`);
        return result.result ?? '0x';
    }
    ensureInitialized() {
        if (!this.initialized || this.wdk === null) {
            throw new Error('WalletManager not initialized');
        }
    }
}
// ── Mock Exchange Rates (hardcoded for demo) ──
const MOCK_RATES = {
    'USDT:XAUT': 1 / 2400, // 1 USDT = 0.000417 XAUT
    'XAUT:USDT': 2400, // 1 XAUT = 2400 USDT
    'USDT:USAT': 1, // 1:1 stablecoin peg
    'USAT:USDT': 1,
    'USDT:ETH': 1 / 3000, // 1 USDT = 0.000333 ETH
    'ETH:USDT': 3000,
    'USDT:BTC': 1 / 60000, // 1 USDT = 0.0000167 BTC
    'BTC:USDT': 60000,
    'XAUT:USAT': 2400,
    'USAT:XAUT': 1 / 2400,
};
/**
 * Mock Wallet Manager — for testing and demo without real WDK.
 * Returns predictable values, never touches a blockchain.
 */
export class MockWalletManager {
    balances = new Map();
    initialized = false;
    nextAgentId = 1;
    feedbackStore = [];
    mockRgbAssets = new Map();
    nextRgbAssetId = 1;
    async initialize(_seed, chains) {
        // Seed up mock balances per chain
        for (const chain of chains) {
            if (chain.chain === 'bitcoin') {
                this.balances.set(`${chain.chain}:BTC`, 10000000n); // 0.1 BTC (8 decimals)
            }
            else if (chain.chain === 'spark') {
                this.balances.set(`${chain.chain}:BTC`, 100000n); // 100,000 sats = 0.001 BTC on Spark
            }
            else {
                // EVM chains get all ERC-20 tokens + ETH
                this.balances.set(`${chain.chain}:USDT`, 100000000n); // 100 USDT (6 decimals)
                this.balances.set(`${chain.chain}:XAUT`, 1000000n); // 1 XAUT (6 decimals)
                this.balances.set(`${chain.chain}:USAT`, 100000000n); // 100 USAT (6 decimals)
                this.balances.set(`${chain.chain}:ETH`, 100000000000000000n); // 0.1 ETH (18 decimals)
            }
        }
        this.initialized = true;
    }
    async getAddress(chain) {
        this.ensureInit();
        if (chain === 'bitcoin')
            return 'tb1qmock000000000000000000000000000000dead';
        if (chain === 'spark')
            return 'spark1mock000000000000000000000dead';
        return '0xMOCK0000000000000000000000000000DEAD';
    }
    // ── Spark Mock Operations ──
    async sparkCreateInvoice(amountSats, _memo) {
        this.ensureInit();
        return {
            invoice: `lnbc${amountSats || 1000}u1mock${Date.now().toString(36)}`,
            id: `inv-mock-${Date.now().toString(36)}`,
            amountSats: amountSats || 1000,
        };
    }
    async sparkPayInvoice(encodedInvoice, _maxFeeSats) {
        this.ensureInit();
        void encodedInvoice;
        return { success: true, txHash: `spark-pay-mock-${Date.now().toString(36)}` };
    }
    async sparkGetDepositAddress() {
        this.ensureInit();
        return 'tb1qspark-deposit-mock-address';
    }
    async getBalance(chain, symbol) {
        this.ensureInit();
        const raw = this.balances.get(`${chain}:${symbol}`) ?? 0n;
        return { chain, symbol, raw, formatted: formatBalance(raw, symbol) };
    }
    async getBalances() {
        this.ensureInit();
        const results = [];
        for (const [key, raw] of this.balances) {
            const [chain, symbol] = key.split(':');
            if (raw > 0n) {
                results.push({ chain, symbol, raw, formatted: formatBalance(raw, symbol) });
            }
        }
        return results;
    }
    async sendTransaction(chain, _to, amount, symbol) {
        this.ensureInit();
        const key = `${chain}:${symbol}`;
        const balance = this.balances.get(key) ?? 0n;
        if (amount > balance) {
            return { success: false, error: 'Insufficient mock balance' };
        }
        this.balances.set(key, balance - amount);
        const mockHash = `0xmock${Date.now().toString(16)}`;
        return { success: true, txHash: mockHash };
    }
    async swap(chain, fromSymbol, toSymbol, fromAmount) {
        this.ensureInit();
        const fromKey = `${chain}:${fromSymbol}`;
        const toKey = `${chain}:${toSymbol}`;
        const fromBalance = this.balances.get(fromKey) ?? 0n;
        if (fromAmount > fromBalance) {
            return { success: false, error: `Insufficient ${fromSymbol} for swap` };
        }
        // Calculate output using mock rates
        const rateKey = `${fromSymbol}:${toSymbol}`;
        const rate = MOCK_RATES[rateKey];
        if (rate === undefined) {
            return { success: false, error: `No mock rate for ${fromSymbol} -> ${toSymbol}` };
        }
        const fromDecimals = getDecimals(fromSymbol);
        const toDecimals = getDecimals(toSymbol);
        // Convert: toAmount = fromAmount * rate, adjusting for decimal differences
        const fromNormalized = Number(fromAmount) / (10 ** fromDecimals);
        const toNormalized = fromNormalized * rate;
        const toAmount = BigInt(Math.floor(toNormalized * (10 ** toDecimals)));
        this.balances.set(fromKey, fromBalance - fromAmount);
        const toBalance = this.balances.get(toKey) ?? 0n;
        this.balances.set(toKey, toBalance + toAmount);
        const mockHash = `0xswap${Date.now().toString(16)}`;
        return { success: true, txHash: mockHash };
    }
    async bridge(fromChain, toChain, symbol, amount) {
        this.ensureInit();
        const fromKey = `${fromChain}:${symbol}`;
        const toKey = `${toChain}:${symbol}`;
        const fromBalance = this.balances.get(fromKey) ?? 0n;
        if (amount > fromBalance) {
            return { success: false, error: `Insufficient ${symbol} on ${fromChain} for bridge` };
        }
        // Move tokens between chains (no fee in mock)
        this.balances.set(fromKey, fromBalance - amount);
        const toBalance = this.balances.get(toKey) ?? 0n;
        this.balances.set(toKey, toBalance + amount);
        const mockHash = `0xbridge${Date.now().toString(16)}`;
        return { success: true, txHash: mockHash };
    }
    async deposit(chain, symbol, amount, _protocol) {
        this.ensureInit();
        const key = `${chain}:${symbol}`;
        const balance = this.balances.get(key) ?? 0n;
        if (amount > balance) {
            return { success: false, error: `Insufficient ${symbol} for deposit` };
        }
        // Lock tokens (deduct from available balance)
        this.balances.set(key, balance - amount);
        const mockHash = `0xdeposit${Date.now().toString(16)}`;
        return { success: true, txHash: mockHash };
    }
    async withdraw(chain, symbol, amount, _protocol) {
        this.ensureInit();
        const key = `${chain}:${symbol}`;
        const balance = this.balances.get(key) ?? 0n;
        // Return tokens from protocol
        this.balances.set(key, balance + amount);
        const mockHash = `0xwithdraw${Date.now().toString(16)}`;
        return { success: true, txHash: mockHash };
    }
    // ── ERC-8004 Identity & Reputation (Mock) ──
    async registerIdentity(_chain, _agentURI) {
        this.ensureInit();
        const agentId = String(this.nextAgentId++);
        const mockHash = `0xregister${Date.now().toString(16)}`;
        return { success: true, txHash: mockHash, agentId };
    }
    async setAgentWallet(_chain, _agentId, _deadline) {
        this.ensureInit();
        const mockHash = `0xsetwallet${Date.now().toString(16)}`;
        return { success: true, txHash: mockHash };
    }
    async giveFeedback(_chain, targetAgentId, value, valueDecimals, _tag1, _tag2, _endpoint, _feedbackURI, _feedbackHash) {
        this.ensureInit();
        this.feedbackStore.push({ targetAgentId, value, valueDecimals });
        const mockHash = `0xfeedback${Date.now().toString(16)}`;
        return { success: true, txHash: mockHash };
    }
    async getOnChainReputation(_chain, agentId) {
        this.ensureInit();
        const entries = this.feedbackStore.filter(f => f.targetAgentId === agentId);
        if (entries.length === 0) {
            return { feedbackCount: 0, totalValue: '0', valueDecimals: 0 };
        }
        const totalValue = entries.reduce((sum, e) => sum + e.value, 0);
        return {
            feedbackCount: entries.length,
            totalValue: String(totalValue),
            valueDecimals: entries[0]?.valueDecimals ?? 0,
        };
    }
    // ── RGB Asset Operations (Mock) ──
    async rgbIssueAsset(ticker, name, supply, precision) {
        this.ensureInit();
        const assetId = `rgb:mock-${this.nextRgbAssetId++}-${ticker.toLowerCase()}`;
        this.mockRgbAssets.set(assetId, { ticker, name, precision, balance: supply });
        const mockHash = `0xrgbissue${Date.now().toString(16)}`;
        return { success: true, txHash: mockHash, assetId };
    }
    async rgbTransfer(invoice, amount, assetId) {
        this.ensureInit();
        const asset = this.mockRgbAssets.get(assetId);
        if (!asset)
            return { success: false, error: `RGB asset not found: ${assetId}` };
        if (amount > asset.balance)
            return { success: false, error: `Insufficient RGB balance for ${asset.ticker}` };
        asset.balance -= amount;
        const mockHash = `0xrgbtransfer${Date.now().toString(16)}`;
        // Include invoice prefix in hash for traceability
        void invoice;
        return { success: true, txHash: mockHash };
    }
    async rgbReceiveAsset(assetId) {
        this.ensureInit();
        const recipientId = `mock-recipient-${Date.now().toString(36)}`;
        const invoiceAsset = assetId ? assetId.slice(0, 20) : 'any';
        return {
            invoice: `rgb:invoice:${invoiceAsset}:${recipientId}`,
            recipientId,
        };
    }
    async rgbListAssets() {
        this.ensureInit();
        const results = [];
        for (const [assetId, asset] of this.mockRgbAssets) {
            results.push({
                assetId,
                ticker: asset.ticker,
                name: asset.name,
                precision: asset.precision,
                balance: asset.balance.toString(),
            });
        }
        return results;
    }
    ensureInit() {
        if (!this.initialized)
            throw new Error('MockWalletManager not initialized');
    }
}
//# sourceMappingURL=manager.js.map