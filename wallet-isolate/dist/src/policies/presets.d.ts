/**
 * Policy Presets — ready-to-use policy configurations.
 *
 * Multi-asset rules: each asset has independent spending limits.
 * Cross-asset rules (cooldown, confidence) apply to ALL operations.
 */
import type { PolicyConfig } from './types.js';
/** Conservative: low limits, strict confidence, cooldown. For production. */
export declare const CONSERVATIVE: PolicyConfig;
/** Moderate: balanced limits for everyday use. */
export declare const MODERATE: PolicyConfig;
/**
 * Demo: designed to show policy enforcement within a 5-minute demo.
 * Low limits so the agent hits them quickly across multiple assets.
 */
export declare const DEMO: PolicyConfig;
//# sourceMappingURL=presets.d.ts.map