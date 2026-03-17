/**
 * Minimal ABI Encoder for ERC-8004 Contract Calls
 *
 * Encodes calldata for the specific functions we call on the
 * IdentityRegistry and ReputationRegistry contracts. Pure JS,
 * zero external dependencies.
 *
 * Only handles: uint256, address, int128, uint8, bytes32, string, bytes, address[]
 *
 * @see https://docs.soliditylang.org/en/latest/abi-spec.html
 */
import { SELECTORS } from './constants.js';
// ── Primitive Encoders ──
/** Encode a uint256 as a 32-byte hex word (zero-padded left). */
export function encodeUint256(value) {
    const n = BigInt(value);
    if (n < 0n)
        throw new Error('uint256 cannot be negative');
    return n.toString(16).padStart(64, '0');
}
/** Encode an address as a 32-byte hex word (zero-padded left). */
export function encodeAddress(addr) {
    const clean = addr.toLowerCase().replace('0x', '');
    if (clean.length !== 40)
        throw new Error(`Invalid address length: ${clean.length}`);
    return clean.padStart(64, '0');
}
/** Encode an int128 as a 32-byte hex word (two's complement). */
export function encodeInt128(value) {
    let n = BigInt(value);
    if (n < 0n) {
        // Two's complement for 256-bit representation
        n = (1n << 256n) + n;
    }
    return n.toString(16).padStart(64, '0');
}
/** Encode a uint8 as a 32-byte hex word. */
export function encodeUint8(value) {
    if (value < 0 || value > 255)
        throw new Error(`uint8 out of range: ${value}`);
    return value.toString(16).padStart(64, '0');
}
/** Encode a bytes32 as a 32-byte hex word. */
export function encodeBytes32(hex) {
    const clean = hex.replace('0x', '');
    if (clean.length !== 64)
        throw new Error(`bytes32 must be 64 hex chars, got ${clean.length}`);
    return clean;
}
/**
 * Encode a dynamic string. Returns [offset_placeholder, encoded_data].
 * The caller must assemble offsets correctly for dynamic types.
 */
function encodeStringData(s) {
    const bytes = Buffer.from(s, 'utf-8');
    const len = encodeUint256(bytes.length);
    const hex = bytes.toString('hex');
    // Pad to 32-byte boundary
    const padded = hex.padEnd(Math.ceil(hex.length / 64) * 64, '0');
    return len + padded;
}
/**
 * Encode a dynamic bytes value. Similar to string encoding.
 */
function encodeBytesData(hex) {
    const clean = hex.replace('0x', '');
    const len = encodeUint256(clean.length / 2);
    const padded = clean.padEnd(Math.ceil(clean.length / 64) * 64, '0');
    return len + padded;
}
// ── High-Level Calldata Encoders ──
/**
 * Encode `register(string agentURI)` calldata.
 * ABI: selector + offset(string) + string_data
 */
export function encodeRegister(agentURI) {
    const selector = SELECTORS.register.replace('0x', '');
    // Single dynamic param: offset points to position 32 (one word after head)
    const offset = encodeUint256(32);
    const data = encodeStringData(agentURI);
    return '0x' + selector + offset + data;
}
/**
 * Encode `setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)`.
 * Head: agentId (static) + newWallet (static) + deadline (static) + offset(bytes)
 * Tail: bytes_data
 */
export function encodeSetAgentWallet(agentId, newWallet, deadline, signature) {
    const selector = SELECTORS.setAgentWallet.replace('0x', '');
    const head = encodeUint256(agentId) +
        encodeAddress(newWallet) +
        encodeUint256(deadline) +
        encodeUint256(128); // offset to bytes data = 4 * 32 = 128
    const tail = encodeBytesData(signature);
    return '0x' + selector + head + tail;
}
/**
 * Encode `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals,
 *   string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)`.
 *
 * 3 static params + 4 dynamic strings + 1 static bytes32
 * Head: agentId + value + valueDecimals + offset(tag1) + offset(tag2) +
 *       offset(endpoint) + offset(feedbackURI) + feedbackHash
 * Tail: tag1_data + tag2_data + endpoint_data + feedbackURI_data
 */
export function encodeGiveFeedback(agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash) {
    const selector = SELECTORS.giveFeedback.replace('0x', '');
    // Encode dynamic parts first to compute their sizes
    const tag1Data = encodeStringData(tag1);
    const tag2Data = encodeStringData(tag2);
    const endpointData = encodeStringData(endpoint);
    const feedbackURIData = encodeStringData(feedbackURI);
    // Head has 8 words (8 * 32 = 256 bytes), dynamic offsets start at 256
    const headSize = 256;
    const tag1Offset = headSize;
    const tag2Offset = tag1Offset + tag1Data.length / 2;
    const endpointOffset = tag2Offset + tag2Data.length / 2;
    const feedbackURIOffset = endpointOffset + endpointData.length / 2;
    const head = encodeUint256(agentId) + // word 0: agentId
        encodeInt128(value) + // word 1: value
        encodeUint8(valueDecimals) + // word 2: valueDecimals
        encodeUint256(tag1Offset) + // word 3: offset(tag1)
        encodeUint256(tag2Offset) + // word 4: offset(tag2)
        encodeUint256(endpointOffset) + // word 5: offset(endpoint)
        encodeUint256(feedbackURIOffset) + // word 6: offset(feedbackURI)
        encodeBytes32(feedbackHash); // word 7: feedbackHash (static)
    return '0x' + selector + head + tag1Data + tag2Data + endpointData + feedbackURIData;
}
/**
 * Encode `getSummary(uint256 agentId, address[] clients, string tag1, string tag2)`.
 * This is a view call (eth_call, not a transaction).
 *
 * Head: agentId + offset(clients) + offset(tag1) + offset(tag2)
 * Tail: clients_data + tag1_data + tag2_data
 */
export function encodeGetSummary(agentId) {
    const selector = SELECTORS.getSummary.replace('0x', '');
    // We always pass empty clients array and empty tag filters
    const emptyArrayData = encodeUint256(0); // length = 0
    const emptyStringData = encodeStringData('');
    // Head: 4 words (128 bytes), dynamic offsets start at 128
    const headSize = 128;
    const clientsOffset = headSize;
    const clientsDataLen = emptyArrayData.length / 2;
    const tag1Offset = clientsOffset + clientsDataLen;
    const tag1DataLen = emptyStringData.length / 2;
    const tag2Offset = tag1Offset + tag1DataLen;
    const head = encodeUint256(agentId) +
        encodeUint256(clientsOffset) +
        encodeUint256(tag1Offset) +
        encodeUint256(tag2Offset);
    return '0x' + selector + head + emptyArrayData + emptyStringData + emptyStringData;
}
// ── Decoders ──
/**
 * Decode a uint256 from a 32-byte hex word.
 * Used for parsing agentId from Transfer event log data.
 */
export function decodeUint256(hex) {
    const clean = hex.replace('0x', '');
    return BigInt('0x' + clean).toString();
}
/**
 * Decode getSummary return data: (uint64 count, int128 value, uint8 decimals).
 * Returns as an object with numeric values.
 */
export function decodeSummaryResult(hex) {
    const clean = hex.replace('0x', '');
    if (clean.length < 192) {
        return { count: 0, totalValue: '0', valueDecimals: 0 };
    }
    const countHex = clean.slice(0, 64);
    const valueHex = clean.slice(64, 128);
    const decimalsHex = clean.slice(128, 192);
    return {
        count: Number(BigInt('0x' + countHex)),
        totalValue: BigInt('0x' + valueHex).toString(),
        valueDecimals: Number(BigInt('0x' + decimalsHex)),
    };
}
//# sourceMappingURL=abi-encode.js.map