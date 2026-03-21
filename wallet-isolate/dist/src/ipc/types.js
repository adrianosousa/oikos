/**
 * IPC Protocol Types
 *
 * Defines the structured message format for communication between
 * the Agent Brain (Node.js) and Wallet Isolate (Bare Runtime).
 *
 * Messages are newline-delimited JSON over stdin/stdout.
 * Every request gets exactly one response, correlated by `id`.
 */
// ── Validation ──
const VALID_SYMBOLS = new Set(['USDT', 'BTC', 'XAUT', 'USAT', 'ETH', 'RGB']);
const VALID_CHAINS = new Set(['ethereum', 'polygon', 'bitcoin', 'arbitrum', 'rgb', 'spark']);
const VALID_REQUEST_TYPES = new Set([
    'propose_payment', 'propose_swap', 'propose_bridge', 'propose_yield', 'propose_feedback',
    'propose_rgb_issue', 'propose_rgb_transfer',
    'identity_register', 'identity_set_wallet',
    'query_balance', 'query_balance_all', 'query_address', 'query_policy', 'query_audit', 'query_reputation',
    'query_rgb_assets', 'query_policy_check',
    'spark_create_invoice', 'spark_pay_invoice', 'spark_deposit_address', 'spark_get_transfers',
    'x402_sign', 'x402_get_address',
]);
const VALID_YIELD_ACTIONS = new Set(['deposit', 'withdraw']);
export function isValidTokenSymbol(value) {
    return typeof value === 'string' && VALID_SYMBOLS.has(value);
}
export function isValidChain(value) {
    return typeof value === 'string' && VALID_CHAINS.has(value);
}
/** Extract counterparty from any proposal type (for whitelist evaluation) */
export function getCounterparty(proposal) {
    if ('to' in proposal)
        return proposal.to;
    if ('protocol' in proposal)
        return proposal.protocol;
    return undefined; // swaps and bridges don't have a specific counterparty
}
export function validateIPCRequest(raw) {
    if (typeof raw !== 'object' || raw === null)
        return null;
    const obj = raw;
    if (typeof obj['id'] !== 'string' || obj['id'].length === 0)
        return null;
    if (typeof obj['type'] !== 'string' || !VALID_REQUEST_TYPES.has(obj['type']))
        return null;
    if (typeof obj['payload'] !== 'object' || obj['payload'] === null)
        return null;
    const type = obj['type'];
    const payload = obj['payload'];
    switch (type) {
        case 'propose_payment':
            if (!validatePaymentProposal(payload))
                return null;
            break;
        case 'propose_swap':
            if (!validateSwapProposal(payload))
                return null;
            break;
        case 'propose_bridge':
            if (!validateBridgeProposal(payload))
                return null;
            break;
        case 'propose_yield':
            if (!validateYieldProposal(payload))
                return null;
            break;
        case 'propose_feedback':
            if (!validateFeedbackProposal(payload))
                return null;
            break;
        case 'propose_rgb_issue':
            if (!validateRGBIssueProposal(payload))
                return null;
            break;
        case 'propose_rgb_transfer':
            if (!validateRGBTransferProposal(payload))
                return null;
            break;
        case 'query_rgb_assets':
            break; // No payload validation needed
        case 'query_policy_check':
            // Dry-run: validate that the payload is a valid proposal (any type)
            if (!validateProposalCommon(payload))
                return null;
            break;
        case 'identity_register':
            if (!validateIdentityRegisterRequest(payload))
                return null;
            break;
        case 'identity_set_wallet':
            if (!validateIdentitySetWalletRequest(payload))
                return null;
            break;
        case 'query_reputation':
            if (typeof payload['agentId'] !== 'string' || payload['agentId'].length === 0)
                return null;
            if (!isValidChain(payload['chain']))
                return null;
            break;
        case 'query_balance':
            if (!isValidChain(payload['chain']) || !isValidTokenSymbol(payload['symbol']))
                return null;
            break;
        case 'query_balance_all':
            break; // No payload validation needed
        case 'query_address':
            if (!isValidChain(payload['chain']))
                return null;
            break;
        case 'query_policy':
        case 'query_audit':
            break; // Optional fields only
        case 'x402_sign':
            if (typeof payload['domain'] !== 'object' || payload['domain'] === null)
                return null;
            if (typeof payload['types'] !== 'object' || payload['types'] === null)
                return null;
            if (typeof payload['message'] !== 'object' || payload['message'] === null)
                return null;
            if (typeof payload['policyAmount'] !== 'string' || payload['policyAmount'].length === 0)
                return null;
            if (typeof payload['policyRecipient'] !== 'string')
                return null;
            if (!isValidChain(payload['policyChain']))
                return null;
            if (!isValidTokenSymbol(payload['policySymbol']))
                return null;
            break;
        case 'x402_get_address':
            break; // No payload needed — returns the EVM wallet address
    }
    // Extract optional source field from envelope
    const source = typeof obj['source'] === 'string' ? obj['source'] : undefined;
    return {
        id: obj['id'],
        type,
        source: source,
        payload: payload,
    };
}
/** Validate fields common to all proposals (amount, symbol, chain, confidence, etc.) */
function validateProposalCommon(obj) {
    if (typeof obj['amount'] !== 'string' || obj['amount'].length === 0)
        return false;
    if (!isValidTokenSymbol(obj['symbol']))
        return false;
    if (!isValidChain(obj['chain']))
        return false;
    if (typeof obj['reason'] !== 'string')
        return false;
    if (typeof obj['confidence'] !== 'number' || obj['confidence'] < 0 || obj['confidence'] > 1)
        return false;
    if (typeof obj['strategy'] !== 'string')
        return false;
    if (typeof obj['timestamp'] !== 'number')
        return false;
    // Validate amount is a valid non-negative integer string (BigInt)
    try {
        const val = BigInt(obj['amount']);
        if (val < 0n)
            return false;
    }
    catch {
        return false;
    }
    return true;
}
function validatePaymentProposal(obj) {
    if (typeof obj['to'] !== 'string' || obj['to'].length === 0)
        return false;
    return validateProposalCommon(obj);
}
function validateSwapProposal(obj) {
    if (!isValidTokenSymbol(obj['toSymbol']))
        return false;
    return validateProposalCommon(obj);
}
function validateBridgeProposal(obj) {
    if (!isValidChain(obj['fromChain']))
        return false;
    if (!isValidChain(obj['toChain']))
        return false;
    return validateProposalCommon(obj);
}
function validateYieldProposal(obj) {
    if (typeof obj['protocol'] !== 'string' || obj['protocol'].length === 0)
        return false;
    if (typeof obj['action'] !== 'string' || !VALID_YIELD_ACTIONS.has(obj['action']))
        return false;
    return validateProposalCommon(obj);
}
function validateFeedbackProposal(obj) {
    if (typeof obj['targetAgentId'] !== 'string' || obj['targetAgentId'].length === 0)
        return false;
    if (typeof obj['feedbackValue'] !== 'number')
        return false;
    if (typeof obj['tag1'] !== 'string')
        return false;
    if (typeof obj['tag2'] !== 'string')
        return false;
    if (typeof obj['endpoint'] !== 'string')
        return false;
    if (typeof obj['feedbackURI'] !== 'string')
        return false;
    if (typeof obj['feedbackHash'] !== 'string')
        return false;
    return validateProposalCommon(obj);
}
function validateRGBIssueProposal(obj) {
    if (typeof obj['ticker'] !== 'string' || obj['ticker'].length === 0)
        return false;
    if (typeof obj['name'] !== 'string' || obj['name'].length === 0)
        return false;
    if (typeof obj['precision'] !== 'number' || obj['precision'] < 0 || obj['precision'] > 18)
        return false;
    return validateProposalCommon(obj);
}
function validateRGBTransferProposal(obj) {
    if (typeof obj['invoice'] !== 'string' || obj['invoice'].length === 0)
        return false;
    return validateProposalCommon(obj);
}
function validateIdentityRegisterRequest(obj) {
    if (typeof obj['agentURI'] !== 'string' || obj['agentURI'].length === 0)
        return false;
    if (!isValidChain(obj['chain']))
        return false;
    return true;
}
function validateIdentitySetWalletRequest(obj) {
    if (typeof obj['agentId'] !== 'string' || obj['agentId'].length === 0)
        return false;
    if (typeof obj['deadline'] !== 'number' || obj['deadline'] <= 0)
        return false;
    if (!isValidChain(obj['chain']))
        return false;
    return true;
}
//# sourceMappingURL=types.js.map