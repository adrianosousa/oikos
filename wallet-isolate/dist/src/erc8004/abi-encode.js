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
 * Encode a dynamic `address[]` as ABI tail data.
 * Format: length word + each address as a 32-byte word.
 */
export function encodeAddressArray(addresses) {
    const lenWord = encodeUint256(addresses.length);
    const elements = addresses.map((a) => encodeAddress(a)).join('');
    return lenWord + elements;
}
/**
 * Encode `getSummary(uint256 agentId, address[] clients, string tag1, string tag2)`.
 * This is a view call (eth_call, not a transaction).
 *
 * Head: agentId + offset(clients) + offset(tag1) + offset(tag2)
 * Tail: clients_data + tag1_data + tag2_data
 *
 * When clientAddresses/tag1/tag2 are not provided, defaults to empty
 * arrays/strings for backward compatibility.
 */
export function encodeGetSummary(agentId, clientAddresses, tag1, tag2) {
    const selector = SELECTORS.getSummary.replace('0x', '');
    const clientsData = encodeAddressArray(clientAddresses ?? []);
    const tag1Data = encodeStringData(tag1 ?? '');
    const tag2Data = encodeStringData(tag2 ?? '');
    // Head: 4 words (128 bytes), dynamic offsets start at 128
    const headSize = 128;
    const clientsOffset = headSize;
    const clientsDataLen = clientsData.length / 2;
    const tag1Offset = clientsOffset + clientsDataLen;
    const tag1DataLen = tag1Data.length / 2;
    const tag2Offset = tag1Offset + tag1DataLen;
    const head = encodeUint256(agentId) +
        encodeUint256(clientsOffset) +
        encodeUint256(tag1Offset) +
        encodeUint256(tag2Offset);
    return '0x' + selector + head + clientsData + tag1Data + tag2Data;
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
// ── Phase 4: Read Operation Encoders ──
/**
 * Encode `readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)`.
 * View call — returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked).
 */
export function encodeReadFeedback(agentId, clientAddress, feedbackIndex) {
    const selector = SELECTORS.readFeedback.replace('0x', '');
    return '0x' + selector +
        encodeUint256(agentId) +
        encodeAddress(clientAddress) +
        encodeUint256(feedbackIndex);
}
/**
 * Decode readFeedback return data.
 * Returns: (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)
 *
 * For simplicity we decode value + valueDecimals + isRevoked from fixed positions.
 * tag1 and tag2 are dynamic strings — we skip them in this basic decoder.
 */
export function decodeReadFeedbackResult(hex) {
    const clean = hex.replace('0x', '');
    if (clean.length < 320) {
        return { value: 0, valueDecimals: 0, isRevoked: false };
    }
    // word 0: int128 value (we read as int256, safe for our range)
    const valueHex = clean.slice(0, 64);
    const valueBig = BigInt('0x' + valueHex);
    // Handle two's complement for negative values
    const value = valueBig > BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
        ? Number(valueBig - (1n << 256n))
        : Number(valueBig);
    // word 1: uint8 valueDecimals
    const decimalsHex = clean.slice(64, 128);
    const valueDecimals = Number(BigInt('0x' + decimalsHex));
    // Words 2-4 are offsets for dynamic types (tag1, tag2) + isRevoked
    // In the ABI layout: value(static) + decimals(static) + offset(tag1) + offset(tag2) + isRevoked(static)
    // isRevoked is at word 4 (position 256-320)
    const revokedHex = clean.slice(256, 320);
    const isRevoked = BigInt('0x' + revokedHex) !== 0n;
    return { value, valueDecimals, isRevoked };
}
/**
 * Encode `getClients(uint256 agentId)`.
 * View call — returns address[] of all feedback givers.
 */
export function encodeGetClients(agentId) {
    const selector = SELECTORS.getClients.replace('0x', '');
    return '0x' + selector + encodeUint256(agentId);
}
/**
 * Decode getClients return data: address[].
 * Returns array of checksummed addresses.
 */
export function decodeAddressArray(hex) {
    const clean = hex.replace('0x', '');
    if (clean.length < 128)
        return [];
    // word 0: offset to array data (always 32 = 0x20)
    // word 1: array length
    const lengthHex = clean.slice(64, 128);
    const length = Number(BigInt('0x' + lengthHex));
    if (length === 0)
        return [];
    const addresses = [];
    for (let i = 0; i < length; i++) {
        const start = 128 + i * 64;
        const addrHex = clean.slice(start + 24, start + 64); // last 20 bytes
        addresses.push('0x' + addrHex);
    }
    return addresses;
}
/**
 * Encode `getLastIndex(uint256 agentId, address clientAddress)`.
 * View call — returns uint64.
 */
export function encodeGetLastIndex(agentId, clientAddress) {
    const selector = SELECTORS.getLastIndex.replace('0x', '');
    return '0x' + selector +
        encodeUint256(agentId) +
        encodeAddress(clientAddress);
}
/**
 * Decode getLastIndex return: uint64.
 */
export function decodeUint64(hex) {
    const clean = hex.replace('0x', '');
    if (clean.length < 64)
        return 0;
    return Number(BigInt('0x' + clean.slice(0, 64)));
}
/**
 * Encode `appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex,
 *   string responseURI, bytes32 responseHash)`.
 * Transaction — agent responds to feedback with evidence.
 */
export function encodeAppendResponse(agentId, clientAddress, feedbackIndex, responseURI, responseHash) {
    const selector = SELECTORS.appendResponse.replace('0x', '');
    const responseURIData = encodeStringData(responseURI);
    // Head: 5 words (160 bytes), dynamic offset for responseURI starts at 160
    const headSize = 160;
    const responseURIOffset = headSize;
    const head = encodeUint256(agentId) +
        encodeAddress(clientAddress) +
        encodeUint256(feedbackIndex) +
        encodeUint256(responseURIOffset) +
        encodeBytes32(responseHash);
    return '0x' + selector + head + responseURIData;
}
/**
 * Encode `revokeFeedback(uint256 agentId, uint64 feedbackIndex)`.
 * Transaction — revoke own feedback.
 */
export function encodeRevokeFeedback(agentId, feedbackIndex) {
    const selector = SELECTORS.revokeFeedback.replace('0x', '');
    return '0x' + selector +
        encodeUint256(agentId) +
        encodeUint256(feedbackIndex);
}
/**
 * Encode `setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)`.
 * Transaction — set extensible key-value metadata on identity.
 */
export function encodeSetMetadata(agentId, key, value) {
    const selector = SELECTORS.setMetadata.replace('0x', '');
    const keyData = encodeStringData(key);
    const valueData = encodeBytesData(value);
    // Head: 3 words (96 bytes)
    const headSize = 96;
    const keyOffset = headSize;
    const keyDataLen = keyData.length / 2;
    const valueOffset = keyOffset + keyDataLen;
    const head = encodeUint256(agentId) +
        encodeUint256(keyOffset) +
        encodeUint256(valueOffset);
    return '0x' + selector + head + keyData + valueData;
}
/**
 * Encode `getMetadata(uint256 agentId, string metadataKey)`.
 * View call — returns bytes.
 */
export function encodeGetMetadata(agentId, key) {
    const selector = SELECTORS.getMetadata.replace('0x', '');
    const keyData = encodeStringData(key);
    // Head: 2 words (64 bytes)
    const headSize = 64;
    const keyOffset = headSize;
    const head = encodeUint256(agentId) +
        encodeUint256(keyOffset);
    return '0x' + selector + head + keyData;
}
/**
 * Encode `getResponseCount(uint256 agentId, address clientAddress,
 *   uint64 feedbackIndex, address[] responders)`.
 * View call — returns uint64 count of responses.
 */
export function encodeGetResponseCount(agentId, clientAddress, feedbackIndex, responders) {
    const selector = SELECTORS.getResponseCount.replace('0x', '');
    const respondersArray = responders ?? [];
    const respondersData = encodeUint256(respondersArray.length) +
        respondersArray.map(addr => encodeAddress(addr)).join('');
    // Head: 4 words (128 bytes)
    const headSize = 128;
    const respondersOffset = headSize;
    const head = encodeUint256(agentId) +
        encodeAddress(clientAddress) +
        encodeUint256(feedbackIndex) +
        encodeUint256(respondersOffset);
    return '0x' + selector + head + respondersData;
}
//# sourceMappingURL=abi-encode.js.map