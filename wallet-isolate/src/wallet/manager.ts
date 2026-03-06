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
import type { ChainConfig, WalletBalance, TransactionResult, WalletOperations } from './types.js';

/** Decimals per token for formatting */
function getDecimals(symbol: TokenSymbol): number {
  switch (symbol) {
    case 'BTC': return 8;
    case 'ETH': return 18;
    default: return 6; // USDT, XAUT, USAT
  }
}

/** Format raw balance to human-readable string */
function formatBalance(raw: bigint, symbol: TokenSymbol): string {
  const decimals = getDecimals(symbol);
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0');
  // Trim trailing zeros for readability, keep at least 2
  const trimmed = fractionStr.replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${trimmed} ${symbol}`;
}

/**
 * WDK Wallet Manager — real implementation using @tetherto/wdk.
 *
 * Initializes WDK with the seed phrase and registers chain wallets.
 * Provides getAddress, getBalance, and sendTransaction.
 */
export class WalletManager implements WalletOperations {
  private wdk: unknown = null;
  private initialized = false;

  /**
   * Initialize the wallet.
   * @security Seed is consumed here and NEVER stored or exposed.
   */
  async initialize(seed: string, chains: ChainConfig[]): Promise<void> {
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
        (wdk as any).registerWallet(config.chain, WalletManagerEvm, {
          provider: config.provider
        });
      } else if (config.chain === 'bitcoin') {
        const { default: WalletManagerBtc } = await import('@tetherto/wdk-wallet-btc');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WDK registerWallet has loose typing
        (wdk as any).registerWallet(config.chain, WalletManagerBtc, {
          network: config.network,
          host: config.host,
          port: config.port
        });
      }
    }

    this.wdk = wdk;
    this.initialized = true;
  }

  async getAddress(chain: Chain): Promise<string> {
    this.ensureInitialized();
    const wdk = this.wdk as { getAccount: (chain: string, index: number) => Promise<{ getAddress: () => Promise<string> }> };
    const account = await wdk.getAccount(chain, 0);
    return account.getAddress();
  }

  async getBalance(chain: Chain, symbol: TokenSymbol): Promise<WalletBalance> {
    this.ensureInitialized();
    const wdk = this.wdk as { getAccount: (chain: string, index: number) => Promise<{ getBalance: () => Promise<bigint> }> };
    const account = await wdk.getAccount(chain, 0);
    const raw = await account.getBalance();
    return { chain, symbol, raw, formatted: formatBalance(raw, symbol) };
  }

  async getBalances(): Promise<WalletBalance[]> {
    // TODO: implement full multi-asset balance query via WDK
    return [];
  }

  /**
   * @security THE CODE PATH THAT MOVES FUNDS FOR PAYMENTS.
   * This must only be called from ProposalExecutor after policy approval.
   */
  async sendTransaction(chain: Chain, to: string, amount: bigint, _symbol: TokenSymbol): Promise<TransactionResult> {
    this.ensureInitialized();

    try {
      const wdk = this.wdk as {
        getAccount: (chain: string, index: number) => Promise<{
          sendTransaction: (opts: { to: string; value: bigint }) => Promise<{ hash: string }>
        }>
      };
      const account = await wdk.getAccount(chain, 0);
      const result = await account.sendTransaction({ to, value: amount });
      return { success: true, txHash: result.hash };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown transaction error';
      return { success: false, error: message };
    }
  }

  async swap(_chain: Chain, _fromSymbol: TokenSymbol, _toSymbol: TokenSymbol, _fromAmount: bigint): Promise<TransactionResult> {
    // TODO: implement via WDK swap modules when available
    return { success: false, error: 'Real WDK swap not yet implemented' };
  }

  async bridge(_fromChain: Chain, _toChain: Chain, _symbol: TokenSymbol, _amount: bigint): Promise<TransactionResult> {
    // TODO: implement via WDK bridge modules when available
    return { success: false, error: 'Real WDK bridge not yet implemented' };
  }

  async deposit(_chain: Chain, _symbol: TokenSymbol, _amount: bigint, _protocol: string): Promise<TransactionResult> {
    // TODO: implement via WDK lending modules when available
    return { success: false, error: 'Real WDK yield deposit not yet implemented' };
  }

  async withdraw(_chain: Chain, _symbol: TokenSymbol, _amount: bigint, _protocol: string): Promise<TransactionResult> {
    // TODO: implement via WDK lending modules when available
    return { success: false, error: 'Real WDK yield withdraw not yet implemented' };
  }

  private ensureInitialized(): void {
    if (!this.initialized || this.wdk === null) {
      throw new Error('WalletManager not initialized');
    }
  }
}

// ── Mock Exchange Rates (hardcoded for demo) ──
const MOCK_RATES: Record<string, number> = {
  'USDT:XAUT': 1 / 2400,     // 1 USDT = 0.000417 XAUT
  'XAUT:USDT': 2400,          // 1 XAUT = 2400 USDT
  'USDT:USAT': 1,             // 1:1 stablecoin peg
  'USAT:USDT': 1,
  'USDT:ETH': 1 / 3000,       // 1 USDT = 0.000333 ETH
  'ETH:USDT': 3000,
  'USDT:BTC': 1 / 60000,      // 1 USDT = 0.0000167 BTC
  'BTC:USDT': 60000,
  'XAUT:USAT': 2400,
  'USAT:XAUT': 1 / 2400,
};

/**
 * Mock Wallet Manager — for testing and demo without real WDK.
 * Returns predictable values, never touches a blockchain.
 */
export class MockWalletManager implements WalletOperations {
  private balances: Map<string, bigint> = new Map();
  private initialized = false;

  async initialize(_seed: string, chains: ChainConfig[]): Promise<void> {
    // Seed up mock balances per chain
    for (const chain of chains) {
      if (chain.chain === 'bitcoin') {
        this.balances.set(`${chain.chain}:BTC`, 10_000_000n);  // 0.1 BTC (8 decimals)
      } else {
        // EVM chains get all ERC-20 tokens + ETH
        this.balances.set(`${chain.chain}:USDT`, 100_000_000n);  // 100 USDT (6 decimals)
        this.balances.set(`${chain.chain}:XAUT`, 1_000_000n);    // 1 XAUT (6 decimals)
        this.balances.set(`${chain.chain}:USAT`, 100_000_000n);  // 100 USAT (6 decimals)
        this.balances.set(`${chain.chain}:ETH`, 100_000_000_000_000_000n); // 0.1 ETH (18 decimals)
      }
    }
    this.initialized = true;
  }

  async getAddress(chain: Chain): Promise<string> {
    this.ensureInit();
    if (chain === 'bitcoin') return 'tb1qmock000000000000000000000000000000dead';
    return '0xMOCK0000000000000000000000000000DEAD';
  }

  async getBalance(chain: Chain, symbol: TokenSymbol): Promise<WalletBalance> {
    this.ensureInit();
    const raw = this.balances.get(`${chain}:${symbol}`) ?? 0n;
    return { chain, symbol, raw, formatted: formatBalance(raw, symbol) };
  }

  async getBalances(): Promise<WalletBalance[]> {
    this.ensureInit();
    const results: WalletBalance[] = [];
    for (const [key, raw] of this.balances) {
      const [chain, symbol] = key.split(':') as [Chain, TokenSymbol];
      if (raw > 0n) {
        results.push({ chain, symbol, raw, formatted: formatBalance(raw, symbol) });
      }
    }
    return results;
  }

  async sendTransaction(chain: Chain, _to: string, amount: bigint, symbol: TokenSymbol): Promise<TransactionResult> {
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

  async swap(chain: Chain, fromSymbol: TokenSymbol, toSymbol: TokenSymbol, fromAmount: bigint): Promise<TransactionResult> {
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

  async bridge(fromChain: Chain, toChain: Chain, symbol: TokenSymbol, amount: bigint): Promise<TransactionResult> {
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

  async deposit(chain: Chain, symbol: TokenSymbol, amount: bigint, _protocol: string): Promise<TransactionResult> {
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

  async withdraw(chain: Chain, symbol: TokenSymbol, amount: bigint, _protocol: string): Promise<TransactionResult> {
    this.ensureInit();
    const key = `${chain}:${symbol}`;
    const balance = this.balances.get(key) ?? 0n;

    // Return tokens from protocol
    this.balances.set(key, balance + amount);
    const mockHash = `0xwithdraw${Date.now().toString(16)}`;
    return { success: true, txHash: mockHash };
  }

  private ensureInit(): void {
    if (!this.initialized) throw new Error('MockWalletManager not initialized');
  }
}
