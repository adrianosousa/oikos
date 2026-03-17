/**
 * MCP Server — Model Context Protocol tools for wallet operations.
 *
 * Two transports:
 *   1. POST /mcp          — local JSON-RPC (for stdio bridge, localhost agents)
 *   2. POST /mcp/remote   — Streamable HTTP transport (MCP 2025-03-26 spec)
 *      GET  /mcp/remote   — SSE stream for server-initiated messages
 *      DELETE /mcp/remote  — session termination
 *
 * The remote endpoint supports Claude iOS/web custom connectors.
 * Optional Bearer token auth via MCP_AUTH_TOKEN env var.
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
/**
 * Mount the Streamable HTTP MCP endpoint at /mcp/remote.
 *
 * Implements the MCP Streamable HTTP transport spec:
 * - POST: receives JSON-RPC, returns JSON or SSE stream
 * - GET: opens SSE stream for server-initiated messages
 * - DELETE: terminates a session
 *
 * Auth: Bearer token if MCP_AUTH_TOKEN is set, otherwise authless.
 *
 * @see https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
 */
export declare function mountRemoteMCP(app: {
    post: (path: string, ...handlers: Array<(req: Request, res: Response) => void>) => void;
    get: (path: string, ...handlers: Array<(req: Request, res: Response) => void>) => void;
    delete: (path: string, ...handlers: Array<(req: Request, res: Response) => void>) => void;
    options: (path: string, ...handlers: Array<(req: Request, res: Response) => void>) => void;
}, services: OikosServices, authToken?: string): void;
//# sourceMappingURL=server.d.ts.map