/**
 * MCP Server — Model Context Protocol tools for wallet operations.
 *
 * Exposes Oikos wallet capabilities as MCP tools so any MCP-compatible
 * agent (Claude, OpenClaw, custom) can query balances, propose payments,
 * check policies, and interact with events/swarm.
 *
 * Agent-agnostic: uses OikosServices directly, no brain plugin.
 *
 * @security All proposals flow through the Wallet Isolate's PolicyEngine.
 * The MCP server NEVER signs transactions or handles keys.
 */
import type { Request, Response } from 'express';
import type { OikosServices } from '../types.js';
type ToolHandler = (params: Record<string, unknown>, svc: OikosServices) => Promise<unknown>;
declare const handlers: Record<string, ToolHandler>;
export { handlers as mcpHandlers };
export declare function mountMCP(app: {
    post: (path: string, ...handlers: Array<(req: Request, res: Response) => void>) => void;
}, services: OikosServices): void;
//# sourceMappingURL=server.d.ts.map