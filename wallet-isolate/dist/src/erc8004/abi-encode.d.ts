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
/** Encode a uint256 as a 32-byte hex word (zero-padded left). */
export declare function encodeUint256(value: bigint | number | string): string;
/** Encode an address as a 32-byte hex word (zero-padded left). */
export declare function encodeAddress(addr: string): string;
/** Encode an int128 as a 32-byte hex word (two's complement). */
export declare function encodeInt128(value: number | bigint): string;
/** Encode a uint8 as a 32-byte hex word. */
export declare function encodeUint8(value: number): string;
/** Encode a bytes32 as a 32-byte hex word. */
export declare function encodeBytes32(hex: string): string;
/**
 * Encode `register(string agentURI)` calldata.
 * ABI: selector + offset(string) + string_data
 */
export declare function encodeRegister(agentURI: string): string;
/**
 * Encode `setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature)`.
 * Head: agentId (static) + newWallet (static) + deadline (static) + offset(bytes)
 * Tail: bytes_data
 */
export declare function encodeSetAgentWallet(agentId: string, newWallet: string, deadline: number, signature: string): string;
/**
 * Encode `giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals,
 *   string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)`.
 *
 * 3 static params + 4 dynamic strings + 1 static bytes32
 * Head: agentId + value + valueDecimals + offset(tag1) + offset(tag2) +
 *       offset(endpoint) + offset(feedbackURI) + feedbackHash
 * Tail: tag1_data + tag2_data + endpoint_data + feedbackURI_data
 */
export declare function encodeGiveFeedback(agentId: string, value: number, valueDecimals: number, tag1: string, tag2: string, endpoint: string, feedbackURI: string, feedbackHash: string): string;
/**
 * Encode a dynamic `address[]` as ABI tail data.
 * Format: length word + each address as a 32-byte word.
 */
export declare function encodeAddressArray(addresses: string[]): string;
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
export declare function encodeGetSummary(agentId: string, clientAddresses?: string[], tag1?: string, tag2?: string): string;
/**
 * Decode a uint256 from a 32-byte hex word.
 * Used for parsing agentId from Transfer event log data.
 */
export declare function decodeUint256(hex: string): string;
/**
 * Decode getSummary return data: (uint64 count, int128 value, uint8 decimals).
 * Returns as an object with numeric values.
 */
export declare function decodeSummaryResult(hex: string): {
    count: number;
    totalValue: string;
    valueDecimals: number;
};
/**
 * Encode `readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)`.
 * View call — returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked).
 */
export declare function encodeReadFeedback(agentId: string, clientAddress: string, feedbackIndex: number): string;
/**
 * Decode readFeedback return data.
 * Returns: (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)
 *
 * For simplicity we decode value + valueDecimals + isRevoked from fixed positions.
 * tag1 and tag2 are dynamic strings — we skip them in this basic decoder.
 */
export declare function decodeReadFeedbackResult(hex: string): {
    value: number;
    valueDecimals: number;
    isRevoked: boolean;
};
/**
 * Encode `getClients(uint256 agentId)`.
 * View call — returns address[] of all feedback givers.
 */
export declare function encodeGetClients(agentId: string): string;
/**
 * Decode getClients return data: address[].
 * Returns array of checksummed addresses.
 */
export declare function decodeAddressArray(hex: string): string[];
/**
 * Encode `getLastIndex(uint256 agentId, address clientAddress)`.
 * View call — returns uint64.
 */
export declare function encodeGetLastIndex(agentId: string, clientAddress: string): string;
/**
 * Decode getLastIndex return: uint64.
 */
export declare function decodeUint64(hex: string): number;
/**
 * Encode `appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex,
 *   string responseURI, bytes32 responseHash)`.
 * Transaction — agent responds to feedback with evidence.
 */
export declare function encodeAppendResponse(agentId: string, clientAddress: string, feedbackIndex: number, responseURI: string, responseHash: string): string;
/**
 * Encode `revokeFeedback(uint256 agentId, uint64 feedbackIndex)`.
 * Transaction — revoke own feedback.
 */
export declare function encodeRevokeFeedback(agentId: string, feedbackIndex: number): string;
/**
 * Encode `setMetadata(uint256 agentId, string metadataKey, bytes metadataValue)`.
 * Transaction — set extensible key-value metadata on identity.
 */
export declare function encodeSetMetadata(agentId: string, key: string, value: string): string;
/**
 * Encode `getMetadata(uint256 agentId, string metadataKey)`.
 * View call — returns bytes.
 */
export declare function encodeGetMetadata(agentId: string, key: string): string;
/**
 * Encode `getResponseCount(uint256 agentId, address clientAddress,
 *   uint64 feedbackIndex, address[] responders)`.
 * View call — returns uint64 count of responses.
 */
export declare function encodeGetResponseCount(agentId: string, clientAddress: string, feedbackIndex: number, responders?: string[]): string;
//# sourceMappingURL=abi-encode.d.ts.map