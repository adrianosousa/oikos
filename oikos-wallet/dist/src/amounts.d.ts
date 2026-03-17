/**
 * Amount Conversion — human-readable ↔ smallest-unit.
 *
 * Converts between human-readable decimal strings ("1.5")
 * and smallest-unit integer strings ("1500000") at the
 * MCP/REST boundary. IPC always uses smallest-unit strings.
 */
import type { TokenSymbol } from './ipc/types.js';
/** Get decimal places for a token */
export declare function getDecimals(symbol: TokenSymbol): number;
/**
 * Convert human-readable amount to smallest-unit string.
 *
 * Examples:
 *   toSmallestUnit("1.5", "USDT")  → "1500000"
 *   toSmallestUnit("0.01", "BTC")  → "1000000"
 *   toSmallestUnit("100", "USDT")  → "100000000"
 *
 * Also accepts amounts that are already in smallest-unit format
 * (pure integers with no decimal point and > reasonable threshold).
 */
export declare function toSmallestUnit(amount: string, symbol: TokenSymbol): string;
/**
 * Convert smallest-unit string to human-readable format.
 *
 * Examples:
 *   toHumanReadable("1500000", "USDT")  → "1.50"
 *   toHumanReadable("1000000", "BTC")   → "0.01"
 */
export declare function toHumanReadable(smallestUnit: string, symbol: TokenSymbol): string;
//# sourceMappingURL=amounts.d.ts.map