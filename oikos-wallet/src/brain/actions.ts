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
import { mcpHandlers } from '../mcp/server.js';

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
export function parseActions(reply: string): ParsedAction[] {
  const actions: ParsedAction[] = [];

  // Match ACTION: followed by JSON on the same line
  const actionRegex = /ACTION:\s*(\{[^\n]+\})/gi;
  let match: RegExpExecArray | null;

  while ((match = actionRegex.exec(reply)) !== null) {
    const jsonStr = match[1];
    if (!jsonStr) continue;
    try {
      const parsed = JSON.parse(jsonStr) as { tool?: string; args?: Record<string, unknown> };
      if (parsed.tool && typeof parsed.tool === 'string') {
        actions.push({
          tool: parsed.tool,
          args: parsed.args ?? {},
          raw: match[0],
        });
      }
    } catch {
      // Malformed JSON — skip silently. Small models sometimes break JSON.
      console.error(`[actions] Failed to parse action JSON: ${jsonStr.slice(0, 100)}`);
    }
  }

  return actions;
}

/**
 * Execute parsed actions via MCP handlers.
 * Returns results for each action.
 */
export async function executeActions(
  actions: ParsedAction[],
  services: OikosServices,
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];

  for (const action of actions) {
    const handler = mcpHandlers[action.tool];
    if (!handler) {
      results.push({ tool: action.tool, success: false, error: `Unknown tool: ${action.tool}` });
      continue;
    }

    try {
      const data = await handler(action.args, services);

      // Check if the handler returned an error object
      const dataObj = data as Record<string, unknown> | null;
      if (dataObj && typeof dataObj['error'] === 'string') {
        results.push({ tool: action.tool, success: false, error: dataObj['error'] as string });
      } else {
        results.push({ tool: action.tool, success: true, data });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ tool: action.tool, success: false, error: msg });
    }
  }

  return results;
}

/**
 * Process a brain reply: parse actions, execute them, and enrich the reply
 * with execution results.
 *
 * Returns { reply, results } where reply has ACTION lines replaced with
 * human-readable result summaries.
 */
export async function processActions(
  reply: string,
  services: OikosServices,
): Promise<{ reply: string; results: ActionResult[] }> {
  const actions = parseActions(reply);

  if (actions.length === 0) {
    return { reply, results: [] };
  }

  const results = await executeActions(actions, services);

  // Replace each ACTION line with a result summary
  let enriched = reply;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i] as ParsedAction;
    const result = results[i] as ActionResult;

    let summary: string;
    if (result.success) {
      // Compact JSON result
      const dataStr = JSON.stringify(result.data);
      summary = `[${action.tool}: OK] ${dataStr.length > 200 ? dataStr.slice(0, 200) + '...' : dataStr}`;
    } else {
      summary = `[${action.tool}: FAILED] ${result.error}`;
    }

    enriched = enriched.replace(action.raw, summary);
  }

  return { reply: enriched, results };
}
