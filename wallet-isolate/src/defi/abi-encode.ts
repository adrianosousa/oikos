/**
 * ABI Encoder for DeFi Direct Contract Calls
 *
 * Encodes calldata for Aave V3 Pool and ERC-20 approve operations.
 * Used as fallback when WDK protocol modules don't support Sepolia.
 *
 * Reuses the same pure-JS ABI encoding approach as erc8004/abi-encode.ts.
 * Zero external dependencies.
 *
 * @see https://docs.soliditylang.org/en/latest/abi-spec.html
 */

import { AAVE_SELECTORS, ERC20_SELECTORS } from './constants.js';

// ── Primitive Encoders ──

/** Encode a uint256 as a 32-byte hex word (zero-padded left). */
function encodeUint256(value: bigint | number | string): string {
  const n = BigInt(value);
  if (n < 0n) throw new Error('uint256 cannot be negative');
  return n.toString(16).padStart(64, '0');
}

/** Encode an address as a 32-byte hex word (zero-padded left). */
function encodeAddress(addr: string): string {
  const clean = addr.toLowerCase().replace('0x', '');
  if (clean.length !== 40) throw new Error(`Invalid address length: ${clean.length}`);
  return clean.padStart(64, '0');
}

/** Encode a uint16 as a 32-byte hex word (zero-padded left). */
function encodeUint16(value: number): string {
  if (value < 0 || value > 65535) throw new Error(`uint16 out of range: ${value}`);
  return value.toString(16).padStart(64, '0');
}

// ── Calldata Encoders ──

/**
 * Encode `approve(address spender, uint256 amount)` calldata.
 * Standard ERC-20 approve — needed before Aave supply.
 */
export function encodeApprove(spender: string, amount: bigint): string {
  return '0x'
    + ERC20_SELECTORS.approve.slice(2)
    + encodeAddress(spender)
    + encodeUint256(amount);
}

/**
 * Encode `supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)` calldata.
 * Aave V3 Pool — deposit tokens into the lending pool.
 */
export function encodeAaveSupply(
  asset: string,
  amount: bigint,
  onBehalfOf: string,
  referralCode: number = 0,
): string {
  return '0x'
    + AAVE_SELECTORS.supply.slice(2)
    + encodeAddress(asset)
    + encodeUint256(amount)
    + encodeAddress(onBehalfOf)
    + encodeUint16(referralCode);
}

/**
 * Encode `withdraw(address asset, uint256 amount, address to)` calldata.
 * Aave V3 Pool — withdraw tokens from the lending pool.
 * Use amount = type(uint256).max to withdraw entire balance.
 */
export function encodeAaveWithdraw(
  asset: string,
  amount: bigint,
  to: string,
): string {
  return '0x'
    + AAVE_SELECTORS.withdraw.slice(2)
    + encodeAddress(asset)
    + encodeUint256(amount)
    + encodeAddress(to);
}
