/**
 * Policy Presets — ready-to-use policy configurations.
 *
 * Multi-asset rules: each asset has independent spending limits.
 * Cross-asset rules (cooldown, confidence) apply to ALL operations.
 */
/** Conservative: low limits, strict confidence, cooldown. For production. */
export const CONSERVATIVE = {
    policies: [{
            id: 'conservative',
            name: 'Conservative Policy',
            rules: [
                // USDT limits
                { type: 'max_per_tx', amount: '2000000', symbol: 'USDT' }, // 2 USDT
                { type: 'max_per_session', amount: '10000000', symbol: 'USDT' }, // 10 USDT
                { type: 'max_per_day', amount: '25000000', symbol: 'USDT' }, // 25 USDT
                { type: 'max_per_recipient_per_day', amount: '5000000', symbol: 'USDT' }, // 5 USDT
                // XAUT limits
                { type: 'max_per_tx', amount: '200000', symbol: 'XAUT' }, // 0.2 XAUT
                { type: 'max_per_session', amount: '1000000', symbol: 'XAUT' }, // 1 XAUT
                // USAT limits
                { type: 'max_per_tx', amount: '2000000', symbol: 'USAT' }, // 2 USAT
                { type: 'max_per_session', amount: '10000000', symbol: 'USAT' }, // 10 USAT
                // Cross-asset
                { type: 'cooldown_seconds', seconds: 60 },
                { type: 'require_confidence', min: 0.8 },
                { type: 'time_window', start_hour: 8, end_hour: 22, timezone: 'UTC' }
            ]
        }]
};
/** Moderate: balanced limits for everyday use. */
export const MODERATE = {
    policies: [{
            id: 'moderate',
            name: 'Moderate Policy',
            rules: [
                // USDT
                { type: 'max_per_tx', amount: '5000000', symbol: 'USDT' }, // 5 USDT
                { type: 'max_per_session', amount: '25000000', symbol: 'USDT' }, // 25 USDT
                { type: 'max_per_day', amount: '50000000', symbol: 'USDT' }, // 50 USDT
                { type: 'max_per_recipient_per_day', amount: '15000000', symbol: 'USDT' }, // 15 USDT
                // XAUT
                { type: 'max_per_tx', amount: '500000', symbol: 'XAUT' }, // 0.5 XAUT
                { type: 'max_per_session', amount: '2000000', symbol: 'XAUT' }, // 2 XAUT
                // USAT
                { type: 'max_per_tx', amount: '5000000', symbol: 'USAT' }, // 5 USAT
                { type: 'max_per_session', amount: '15000000', symbol: 'USAT' }, // 15 USAT
                // Cross-asset
                { type: 'cooldown_seconds', seconds: 30 },
                { type: 'require_confidence', min: 0.65 }
            ]
        }]
};
/**
 * Demo: designed to show policy enforcement within a 5-minute demo.
 * Low limits so the agent hits them quickly across multiple assets.
 */
export const DEMO = {
    policies: [{
            id: 'demo',
            name: 'Demo Policy (5-min showcase)',
            rules: [
                // USDT — primary asset, low limits for demo
                { type: 'max_per_tx', amount: '5000000', symbol: 'USDT' }, // 5 USDT
                { type: 'max_per_session', amount: '15000000', symbol: 'USDT' }, // 15 USDT (hit by min 5)
                { type: 'max_per_day', amount: '50000000', symbol: 'USDT' }, // 50 USDT
                { type: 'max_per_recipient_per_day', amount: '10000000', symbol: 'USDT' }, // 10 USDT
                // XAUT — gold, tight limits
                { type: 'max_per_tx', amount: '500000', symbol: 'XAUT' }, // 0.5 XAUT
                { type: 'max_per_session', amount: '2000000', symbol: 'XAUT' }, // 2 XAUT
                // USAT — stablecoin, same as USDT
                { type: 'max_per_tx', amount: '5000000', symbol: 'USAT' }, // 5 USAT
                { type: 'max_per_session', amount: '15000000', symbol: 'USAT' }, // 15 USAT
                // Cross-asset: cooldown + confidence for ALL operations
                { type: 'cooldown_seconds', seconds: 15 },
                { type: 'require_confidence', min: 0.6 }
            ]
        }]
};
//# sourceMappingURL=presets.js.map