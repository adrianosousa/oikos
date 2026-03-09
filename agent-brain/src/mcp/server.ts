/**
 * MCP Server — Model Context Protocol tools for wallet operations.
 *
 * Exposes Oikos wallet capabilities as MCP tools so any MCP-compatible
 * agent (Claude, etc.) can query balances, propose payments/swaps/bridges,
 * check policies, and interact with the swarm.
 *
 * Runs as an Express middleware on the dashboard server.
 * Implements JSON-RPC 2.0 following MCP spec (2025-06-18).
 *
 * @security All proposals flow through the Wallet Isolate's PolicyEngine.
 * The MCP server NEVER signs transactions or handles keys.
 */

import type { Request, Response } from 'express';
import type { AgentBrain } from '../agent/brain.js';
import type { WalletIPCClient } from '../ipc/client.js';
import type { SwarmCoordinatorInterface } from '../swarm/types.js';
import type {
  PaymentProposal,
  SwapProposal,
  BridgeProposal,
  YieldProposal,
  TokenSymbol,
  Chain,
} from '../ipc/types.js';

// ── MCP Types ──

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ── Tool Definitions ──

const TOOLS: MCPTool[] = [
  {
    name: 'wallet_balance_all',
    description: 'Get all wallet balances across all chains and assets (USDt, XAUt, USAt, BTC, ETH).',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'wallet_balance',
    description: 'Get balance for a specific chain and token.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { type: 'string', enum: ['ethereum', 'polygon', 'bitcoin', 'arbitrum'] },
        symbol: { type: 'string', enum: ['USDT', 'XAUT', 'USAT', 'BTC', 'ETH'] },
      },
      required: ['chain', 'symbol'],
    },
  },
  {
    name: 'wallet_address',
    description: 'Get wallet address for a specific chain.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { type: 'string', enum: ['ethereum', 'polygon', 'bitcoin', 'arbitrum'] },
      },
      required: ['chain'],
    },
  },
  {
    name: 'propose_payment',
    description: 'Propose a token transfer. Goes through PolicyEngine for approval before execution.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount in smallest unit (1 USDT = "1000000")' },
        symbol: { type: 'string', enum: ['USDT', 'XAUT', 'USAT', 'BTC', 'ETH'] },
        chain: { type: 'string', enum: ['ethereum', 'polygon', 'bitcoin', 'arbitrum'] },
        to: { type: 'string', description: 'Recipient address' },
        reason: { type: 'string', description: 'Why this payment is being made' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['amount', 'symbol', 'chain', 'to', 'reason', 'confidence'],
    },
  },
  {
    name: 'propose_swap',
    description: 'Propose a token swap (e.g., USDT to XAUT). Goes through PolicyEngine.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount to swap in smallest unit' },
        symbol: { type: 'string', enum: ['USDT', 'XAUT', 'USAT', 'BTC', 'ETH'] },
        toSymbol: { type: 'string', enum: ['USDT', 'XAUT', 'USAT', 'BTC', 'ETH'] },
        chain: { type: 'string', enum: ['ethereum', 'polygon', 'bitcoin', 'arbitrum'] },
        reason: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['amount', 'symbol', 'toSymbol', 'chain', 'reason', 'confidence'],
    },
  },
  {
    name: 'propose_bridge',
    description: 'Propose a cross-chain bridge (e.g., Ethereum to Arbitrum). Goes through PolicyEngine.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string' },
        symbol: { type: 'string', enum: ['USDT', 'XAUT', 'USAT', 'BTC', 'ETH'] },
        fromChain: { type: 'string', enum: ['ethereum', 'polygon', 'bitcoin', 'arbitrum'] },
        toChain: { type: 'string', enum: ['ethereum', 'polygon', 'bitcoin', 'arbitrum'] },
        reason: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['amount', 'symbol', 'fromChain', 'toChain', 'reason', 'confidence'],
    },
  },
  {
    name: 'propose_yield',
    description: 'Propose a yield deposit or withdrawal. Goes through PolicyEngine.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string' },
        symbol: { type: 'string', enum: ['USDT', 'XAUT', 'USAT', 'BTC', 'ETH'] },
        chain: { type: 'string', enum: ['ethereum', 'polygon', 'bitcoin', 'arbitrum'] },
        protocol: { type: 'string', description: 'DeFi protocol name (e.g., aave-v3)' },
        action: { type: 'string', enum: ['deposit', 'withdraw'] },
        reason: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['amount', 'symbol', 'chain', 'protocol', 'action', 'reason', 'confidence'],
    },
  },
  {
    name: 'policy_status',
    description: 'Get current policy state: remaining budgets, cooldowns, thresholds.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'audit_log',
    description: 'Query the audit trail. Returns recent proposals with policy decisions and execution results.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max entries to return (default: 20)' },
      },
      required: [],
    },
  },
  {
    name: 'agent_state',
    description: 'Get the agent brain state: status, reasoning, portfolio, recent results.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'swarm_state',
    description: 'Get swarm state: connected peers, active rooms, announcements, economics.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'swarm_announce',
    description: 'Post an announcement to the swarm board (service, auction, or request).',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['service', 'auction', 'request'] },
        title: { type: 'string' },
        description: { type: 'string' },
        minPrice: { type: 'string' },
        maxPrice: { type: 'string' },
        symbol: { type: 'string', enum: ['USDT', 'XAUT', 'USAT', 'BTC', 'ETH'] },
      },
      required: ['category', 'title', 'description', 'minPrice', 'maxPrice', 'symbol'],
    },
  },
  {
    name: 'identity_state',
    description: 'Get ERC-8004 on-chain identity status (registration, agentId, wallet link).',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'query_reputation',
    description: 'Query on-chain reputation from ERC-8004 ReputationRegistry.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'ERC-8004 agent ID to query' },
      },
      required: ['agentId'],
    },
  },
];

// ── Tool Handlers ──

type ToolHandler = (
  params: Record<string, unknown>,
  ctx: { brain: AgentBrain; wallet: WalletIPCClient; swarm?: SwarmCoordinatorInterface }
) => Promise<unknown>;

const handlers: Record<string, ToolHandler> = {
  async wallet_balance_all(_params, { wallet }) {
    const balances = await wallet.queryBalanceAll();
    return { balances };
  },

  async wallet_balance(params, { wallet }) {
    const balance = await wallet.queryBalance(
      params['chain'] as string,
      params['symbol'] as string,
    );
    return balance;
  },

  async wallet_address(params, { wallet }) {
    const address = await wallet.queryAddress(params['chain'] as string);
    return address;
  },

  async propose_payment(params, { wallet }) {
    const proposal: PaymentProposal = {
      amount: params['amount'] as string,
      symbol: params['symbol'] as TokenSymbol,
      chain: params['chain'] as Chain,
      to: params['to'] as string,
      reason: params['reason'] as string,
      confidence: params['confidence'] as number,
      strategy: 'mcp-tool',
      timestamp: Date.now(),
    };
    return wallet.proposePayment(proposal);
  },

  async propose_swap(params, { wallet }) {
    const proposal: SwapProposal = {
      amount: params['amount'] as string,
      symbol: params['symbol'] as TokenSymbol,
      toSymbol: params['toSymbol'] as TokenSymbol,
      chain: params['chain'] as Chain,
      reason: params['reason'] as string,
      confidence: params['confidence'] as number,
      strategy: 'mcp-tool',
      timestamp: Date.now(),
    };
    return wallet.proposeSwap(proposal);
  },

  async propose_bridge(params, { wallet }) {
    const proposal: BridgeProposal = {
      amount: params['amount'] as string,
      symbol: params['symbol'] as TokenSymbol,
      chain: params['fromChain'] as Chain,
      fromChain: params['fromChain'] as Chain,
      toChain: params['toChain'] as Chain,
      reason: params['reason'] as string,
      confidence: params['confidence'] as number,
      strategy: 'mcp-tool',
      timestamp: Date.now(),
    };
    return wallet.proposeBridge(proposal);
  },

  async propose_yield(params, { wallet }) {
    const proposal: YieldProposal = {
      amount: params['amount'] as string,
      symbol: params['symbol'] as TokenSymbol,
      chain: params['chain'] as Chain,
      protocol: params['protocol'] as string,
      action: params['action'] as 'deposit' | 'withdraw',
      reason: params['reason'] as string,
      confidence: params['confidence'] as number,
      strategy: 'mcp-tool',
      timestamp: Date.now(),
    };
    return wallet.proposeYield(proposal);
  },

  async policy_status(_params, { wallet }) {
    const policies = await wallet.queryPolicy();
    return { policies };
  },

  async audit_log(params, { wallet }) {
    const limit = typeof params['limit'] === 'number' ? params['limit'] : 20;
    const entries = await wallet.queryAudit(limit);
    return { entries };
  },

  async agent_state(_params, { brain }) {
    return brain.getState();
  },

  async swarm_state(_params, { swarm }) {
    if (!swarm) return { enabled: false };
    return { enabled: true, ...swarm.getState() };
  },

  async swarm_announce(params, { swarm }) {
    if (!swarm) return { error: 'Swarm not enabled' };
    const id = swarm.postAnnouncement({
      category: params['category'] as 'service' | 'auction' | 'request',
      title: params['title'] as string,
      description: params['description'] as string,
      priceRange: {
        min: params['minPrice'] as string,
        max: params['maxPrice'] as string,
        symbol: params['symbol'] as string,
      },
    });
    return { announcementId: id };
  },

  async identity_state(_params, { brain }) {
    return brain.getIdentityState();
  },

  async query_reputation(params, { wallet }) {
    const result = await wallet.queryReputation(params['agentId'] as string);
    return result;
  },
};

// ── JSON-RPC Router ──

function makeError(id: string | number, code: number, message: string): MCPResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleRequest(
  req: MCPRequest,
  ctx: { brain: AgentBrain; wallet: WalletIPCClient; swarm?: SwarmCoordinatorInterface }
): Promise<MCPResponse> {
  const { id, method, params } = req;

  // MCP lifecycle methods
  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'oikos-wallet', version: '0.2.0' },
      },
    };
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }

  if (method === 'tools/call') {
    const toolName = (params?.['name'] ?? '') as string;
    const toolArgs = (params?.['arguments'] ?? {}) as Record<string, unknown>;
    const handler = handlers[toolName];

    if (!handler) {
      return makeError(id, -32602, `Unknown tool: ${toolName}`);
    }

    try {
      const result = await handler(toolArgs, ctx);
      return {
        jsonrpc: '2.0', id,
        result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Tool execution failed';
      return makeError(id, -32000, message);
    }
  }

  if (method === 'notifications/initialized') {
    // Client notification — no response needed, but we return success for HTTP
    return { jsonrpc: '2.0', id, result: {} };
  }

  return makeError(id, -32601, `Method not found: ${method}`);
}

// ── Express Middleware ──

/**
 * Mount MCP endpoint on an Express app.
 * POST /mcp handles JSON-RPC 2.0 requests.
 */
export function mountMCP(
  app: { post: (path: string, ...handlers: Array<(req: Request, res: Response) => void>) => void },
  brain: AgentBrain,
  wallet: WalletIPCClient,
  swarm?: SwarmCoordinatorInterface,
): void {
  app.post('/mcp', async (req: Request, res: Response) => {
    const body = req.body as MCPRequest;

    if (!body || body.jsonrpc !== '2.0' || !body.method) {
      res.status(400).json(makeError(body?.id ?? 0, -32600, 'Invalid JSON-RPC request'));
      return;
    }

    const response = await handleRequest(body, { brain, wallet, swarm });
    res.json(response);
  });

  console.error('[mcp] MCP endpoint mounted at POST /mcp');
}
