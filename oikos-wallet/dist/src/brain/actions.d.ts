/**
 * Action Parser & Executor — bridges brain text output to MCP tool execution.
 *
 * The brain (Ollama/Qwen) outputs structured ACTION lines in its replies.
 * This module parses them, executes via the existing MCP handlers,
 * and returns enriched replies with real execution results.
 *
 * Format the brain is taught to produce:
 *   ACTION: {"tool": "swarm_announce", "args": {"category": "seller", ...}}
 *
 * Multiple actions per reply are supported (one per line).
 *
 * @security All actions flow through the same MCP handlers which route
 * proposals through the PolicyEngine. No bypass possible.
 */
import type { OikosServices } from '../types.js';
/** A parsed action from the brain's text output */
export interface ParsedAction {
    tool: string;
    args: Record<string, unknown>;
    /** Original matched text (for replacement in reply) */
    raw: string;
}
/** Result of executing an action */
export interface ActionResult {
    tool: string;
    success: boolean;
    data?: unknown;
    error?: string;
}
/**
 * Parse ACTION lines from brain reply text.
 *
 * Matches patterns like:
 *   ACTION: {"tool": "swarm_announce", "args": {...}}
 *   ACTION:{"tool":"wallet_balance_all","args":{}}
 *
 * Robust to minor formatting issues from small models.
 */
export declare function parseActions(reply: string): ParsedAction[];
/**
 * Execute parsed actions via MCP handlers.
 * Returns results for each action.
 */
export declare function executeActions(actions: ParsedAction[], services: OikosServices): Promise<ActionResult[]>;
/**
 * Process a brain reply: parse actions, execute them, and enrich the reply
 * with execution results.
 *
 * Returns { reply, results } where reply has ACTION lines replaced with
 * human-readable result summaries.
 */
export declare function processActions(reply: string, services: OikosServices): Promise<{
    reply: string;
    results: ActionResult[];
}>;
//# sourceMappingURL=actions.d.ts.map