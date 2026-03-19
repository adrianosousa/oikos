/**
 * Chain Configurations — testnet defaults.
 *
 * These are the chain configurations for development and demo.
 * Production would use mainnet endpoints.
 */

import type { ChainConfig } from './types.js';

export const TESTNET_CHAINS: ChainConfig[] = [
  {
    chain: 'ethereum',
    provider: 'https://ethereum-sepolia-rpc.publicnode.com'
  },
  {
    chain: 'arbitrum',
    provider: 'https://sepolia-rollup.arbitrum.io/rpc'
  },
  {
    chain: 'bitcoin',
    network: 'testnet',
    host: 'electrum.blockstream.info',
    port: 50001
  },
  {
    chain: 'spark',
    network: 'REGTEST'  // MAINNET | SIGNET | REGTEST
  }
];

export const SEPOLIA_ONLY: ChainConfig[] = [
  {
    chain: 'ethereum',
    provider: 'https://ethereum-sepolia-rpc.publicnode.com'
  }
];
