/**
 * ERC-8004 Contract Constants
 *
 * Hardcoded addresses, selectors, and EIP-712 definitions for the
 * Trustless Agents standard. Only the specific functions we call.
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */
/** Deployed ERC-8004 contract addresses on Sepolia testnet. */
export const ERC8004_CONTRACTS = {
    identityRegistry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    reputationRegistry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
    chainId: 11155111, // Sepolia
};
/**
 * Pre-computed function selectors (keccak256 of signature, first 4 bytes).
 * Verified against ethers.id() — these are immutable constants.
 */
export const SELECTORS = {
    // IdentityRegistry
    register: '0xf2c298be', // register(string)
    setAgentWallet: '0x2d1ef5ae', // setAgentWallet(uint256,address,uint256,bytes)
    // ReputationRegistry
    giveFeedback: '0x3c036a7e', // giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)
    getSummary: '0x81bbba58', // getSummary(uint256,address[],string,string)
};
/**
 * EIP-712 domain for `setAgentWallet` signature verification.
 * The IdentityRegistry uses this to verify the new wallet consents.
 */
export const EIP712_DOMAIN = {
    name: 'ERC8004IdentityRegistry',
    version: '1',
    chainId: ERC8004_CONTRACTS.chainId,
    verifyingContract: ERC8004_CONTRACTS.identityRegistry,
};
/**
 * EIP-712 type definition for SetAgentWallet.
 * Used when signing the `setAgentWallet` authorization.
 * @see EIP-8004 spec: SetAgentWallet(uint256 agentId, address newWallet, uint256 deadline, uint256 nonce)
 */
export const SET_AGENT_WALLET_TYPES = {
    SetAgentWallet: [
        { name: 'agentId', type: 'uint256' },
        { name: 'newWallet', type: 'address' },
        { name: 'deadline', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
    ],
};
/** ERC-721 Transfer event topic (for parsing agentId from register tx receipt). */
export const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
//# sourceMappingURL=constants.js.map