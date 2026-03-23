/**
 * ERC-8004 Contract Constants
 *
 * Hardcoded addresses, selectors, and EIP-712 definitions for the
 * Trustless Agents standard. Only the specific functions we call.
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */
/** Deployed ERC-8004 contract addresses on Sepolia testnet. */
export declare const ERC8004_CONTRACTS: {
    readonly identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e";
    readonly reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713";
    readonly chainId: 11155111;
};
/**
 * Pre-computed function selectors (keccak256 of signature, first 4 bytes).
 * Verified against ethers.id() — these are immutable constants.
 */
export declare const SELECTORS: {
    readonly register: "0xf2c298be";
    readonly setAgentWallet: "0x2d1ef5ae";
    readonly setMetadata: "0x466648da";
    readonly getMetadata: "0xcb4799f2";
    readonly setAgentURI: "0x0af28bd3";
    readonly giveFeedback: "0x3c036a7e";
    readonly getSummary: "0x81bbba58";
    readonly readFeedback: "0x232b0810";
    readonly readAllFeedback: "0xd9d84224";
    readonly getClients: "0x42dd519c";
    readonly getLastIndex: "0xf2d81759";
    readonly appendResponse: "0xc2349ab2";
    readonly revokeFeedback: "0x4ab3ca99";
    readonly getResponseCount: "0x6e04cacd";
};
/**
 * EIP-712 domain for `setAgentWallet` signature verification.
 * The IdentityRegistry uses this to verify the new wallet consents.
 */
export declare const EIP712_DOMAIN: {
    readonly name: "ERC8004IdentityRegistry";
    readonly version: "1";
    readonly chainId: 11155111;
    readonly verifyingContract: "0x8004A818BFB912233c491871b3d84c89A494BD9e";
};
/**
 * EIP-712 type definition for SetAgentWallet.
 * Used when signing the `setAgentWallet` authorization.
 * @see EIP-8004 spec: SetAgentWallet(uint256 agentId, address newWallet, uint256 deadline, uint256 nonce)
 */
export declare const SET_AGENT_WALLET_TYPES: {
    readonly SetAgentWallet: readonly [{
        readonly name: "agentId";
        readonly type: "uint256";
    }, {
        readonly name: "newWallet";
        readonly type: "address";
    }, {
        readonly name: "deadline";
        readonly type: "uint256";
    }, {
        readonly name: "nonce";
        readonly type: "uint256";
    }];
};
/** ERC-721 Transfer event topic (for parsing agentId from register tx receipt). */
export declare const TRANSFER_EVENT_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
//# sourceMappingURL=constants.d.ts.map