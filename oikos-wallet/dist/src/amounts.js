/**
 * Amount Conversion — human-readable ↔ smallest-unit.
 *
 * Converts between human-readable decimal strings ("1.5")
 * and smallest-unit integer strings ("1500000") at the
 * MCP/REST boundary. IPC always uses smallest-unit strings.
 */
/** Token decimal places — must match wallet-isolate/src/wallet/manager.ts */
const DECIMALS = {
    USDT: 6,
    XAUT: 6,
    USAT: 6,
    BTC: 8,
    ETH: 18,
    RGB: 6,
};
/** Get decimal places for a token */
export function getDecimals(symbol) {
    return DECIMALS[symbol] ?? 6;
}
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
export function toSmallestUnit(amount, symbol) {
    const trimmed = amount.trim();
    // If it's already a pure integer and looks like smallest-unit
    // (no decimal point, and large enough to be smallest-unit already),
    // pass it through. This provides backwards compatibility.
    if (/^\d+$/.test(trimmed) && isLikelySmallestUnit(trimmed, symbol)) {
        return trimmed;
    }
    const decimals = getDecimals(symbol);
    // Split on decimal point
    const parts = trimmed.split('.');
    const wholePart = parts[0] ?? '0';
    let fracPart = parts[1] ?? '';
    // Pad or truncate fractional part to match decimals
    if (fracPart.length > decimals) {
        fracPart = fracPart.slice(0, decimals);
    }
    else {
        fracPart = fracPart.padEnd(decimals, '0');
    }
    // Combine and remove leading zeros
    const raw = wholePart + fracPart;
    const result = raw.replace(/^0+/, '') || '0';
    return result;
}
/**
 * Convert smallest-unit string to human-readable format.
 *
 * Examples:
 *   toHumanReadable("1500000", "USDT")  → "1.50"
 *   toHumanReadable("1000000", "BTC")   → "0.01"
 */
export function toHumanReadable(smallestUnit, symbol) {
    const decimals = getDecimals(symbol);
    const padded = smallestUnit.padStart(decimals + 1, '0');
    const wholeEnd = padded.length - decimals;
    const whole = padded.slice(0, wholeEnd);
    const frac = padded.slice(wholeEnd);
    // Trim trailing zeros but keep at least 2 decimal places
    const trimmed = frac.replace(/0+$/, '').padEnd(2, '0');
    return `${whole}.${trimmed}`;
}
/**
 * Detect if a pure-integer string is likely already in smallest-unit format.
 *
 * Heuristic: if the number is >= 10^(decimals), it's probably already
 * in smallest-unit format (e.g., "1000000" for USDT is 1.0 USDT).
 * If it's small (e.g., "5" for USDT), treat it as human-readable (5 USDT).
 */
function isLikelySmallestUnit(value, symbol) {
    const decimals = getDecimals(symbol);
    // If the number has more digits than the decimal places, it's likely smallest-unit
    return value.length > decimals;
}
//# sourceMappingURL=amounts.js.map