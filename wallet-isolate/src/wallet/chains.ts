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
    provider: 'https://rpc.sepolia.org'
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
  }
];

export const SEPOLIA_ONLY: ChainConfig[] = [
  {
    chain: 'ethereum',
    provider: 'https://rpc.sepolia.org'
  }
];
