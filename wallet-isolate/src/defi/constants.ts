/**
 * DeFi Protocol Constants — Sepolia Testnet
 *
 * Addresses and function selectors for direct contract calls
 * to DeFi protocols on Sepolia. Used as fallback when WDK
 * protocol modules don't support testnet chains.
 *
 * @see https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses
 */

/** Aave V3 deployed contract addresses on Sepolia. */
export const AAVE_V3_SEPOLIA = {
  pool: '0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951',
  faucet: '0xC959483DBa39aa9E78757139af0e9a2EDEb3f42D',
  chainId: 11155111,
} as const;

/**
 * Aave V3 testnet token addresses on Sepolia.
 * These are Aave's own test tokens — different from WDK's test USDT.
 */
export const AAVE_TOKENS_SEPOLIA: Record<string, string> = {
  USDT: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
  USDC: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
  DAI:  '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357',
  WETH: '0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c',
  WBTC: '0x29f2D40B0605204364af54EC677bD022dA425d03',
  LINK: '0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5',
  AAVE: '0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a',
};

/** Pre-computed function selectors for Aave V3 Pool. */
export const AAVE_SELECTORS = {
  // Pool.supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
  supply: '0x617ba037',
  // Pool.withdraw(address asset, uint256 amount, address to) returns (uint256)
  withdraw: '0x69328dec',
} as const;

/** Pre-computed function selector for ERC-20 approve. */
export const ERC20_SELECTORS = {
  // approve(address spender, uint256 amount) returns (bool)
  approve: '0x095ea7b3',
} as const;
