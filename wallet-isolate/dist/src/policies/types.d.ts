/**
 * Policy Types
 *
 * Defines the declarative policy rule system. Policies are loaded
 * from a JSON config file at startup and are IMMUTABLE thereafter.
 *
 * All amounts are in the token's smallest unit as strings (BigInt serialization).
 */
export type PolicyRuleType = 'max_per_tx' | 'max_per_session' | 'max_per_day' | 'max_per_recipient_per_day' | 'cooldown_seconds' | 'require_confidence' | 'whitelist_recipients' | 'time_window';
export interface MaxPerTxRule {
    type: 'max_per_tx';
    amount: string;
    symbol: string;
}
export interface MaxPerSessionRule {
    type: 'max_per_session';
    amount: string;
    symbol: string;
}
export interface MaxPerDayRule {
    type: 'max_per_day';
    amount: string;
    symbol: string;
}
export interface MaxPerRecipientPerDayRule {
    type: 'max_per_recipient_per_day';
    amount: string;
    symbol: string;
}
export interface CooldownSecondsRule {
    type: 'cooldown_seconds';
    seconds: number;
}
export interface RequireConfidenceRule {
    type: 'require_confidence';
    min: number;
}
export interface WhitelistRecipientsRule {
    type: 'whitelist_recipients';
    addresses: string[];
}
export interface TimeWindowRule {
    type: 'time_window';
    start_hour: number;
    end_hour: number;
    timezone: string;
}
export type PolicyRule = MaxPerTxRule | MaxPerSessionRule | MaxPerDayRule | MaxPerRecipientPerDayRule | CooldownSecondsRule | RequireConfidenceRule | WhitelistRecipientsRule | TimeWindowRule;
export interface PaymentPolicy {
    id: string;
    name: string;
    rules: PolicyRule[];
}
export interface PolicyConfig {
    policies: PaymentPolicy[];
}
export interface PolicyEvaluationResult {
    approved: boolean;
    violations: string[];
    policyId: string;
}
//# sourceMappingURL=types.d.ts.map