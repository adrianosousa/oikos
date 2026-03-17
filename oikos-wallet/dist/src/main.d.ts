/**
 * Oikos App — Entry Point
 *
 * Agent-agnostic wallet infrastructure. Spawns the wallet isolate,
 * starts all services (swarm, companion, events, pricing, RGB),
 * and serves MCP + REST + CLI for any agent to connect.
 *
 * No LLM. No brain. No plugin. Just infrastructure.
 * Any agent connects via MCP tools at POST /mcp.
 *
 * @security The app NEVER touches seed phrases or private keys.
 * It sends structured proposals and receives execution results.
 */
export {};
//# sourceMappingURL=main.d.ts.map