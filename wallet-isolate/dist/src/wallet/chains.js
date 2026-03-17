/**
 * Chain Configurations — testnet defaults.
 *
 * These are the chain configurations for development and demo.
 * Production would use mainnet endpoints.
 */
export const TESTNET_CHAINS = [
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
export const SEPOLIA_ONLY = [
    {
        chain: 'ethereum',
        provider: 'https://rpc.sepolia.org'
    }
];
//# sourceMappingURL=chains.js.map