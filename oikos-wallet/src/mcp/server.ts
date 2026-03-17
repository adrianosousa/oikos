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
import type {
  PaymentProposal,
  SwapProposal,
  BridgeProposal,
  YieldProposal,
  RGBIssueProposal,
  RGBTransferProposal,
  ProposalCommon,
  TokenSymbol,
  Chain,
} from '../ipc/types.js';
import { toSmallestUnit } from '../amounts.js';

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
        amount: { type: 'string', description: 'Amount in human-readable units (e.g., "1.5" for 1.5 USDT)' },
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
        amount: { type: 'string', description: 'Amount in human-readable units' },
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
        amount: { type: 'string', description: 'Amount in human-readable units' },
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
        amount: { type: 'string', description: 'Amount in human-readable units' },
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
    description: 'Get wallet app state: events, swarm, companion, identity.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'swarm_state',
    description: 'Get swarm state: connected peers, active rooms, announcements, economics.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'swarm_announce',
    description: 'Post an announcement to the swarm board. The buyer always pays. "buyer" = you are buying (you pay the bidder). "seller" = you are selling (bidder pays you).',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['buyer', 'seller', 'auction'], description: '"buyer" = you are buying (you pay). "seller" = you are selling (bidder pays).' },
        title: { type: 'string' },
        description: { type: 'string' },
        minPrice: { type: 'string' },
        maxPrice: { type: 'string' },
        symbol: { type: 'string', enum: ['USDT', 'XAUT', 'USAT', 'BTC', 'ETH'] },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for discovery (e.g. ["defi", "yield", "portfolio"])' },
      },
      required: ['category', 'title', 'description', 'minPrice', 'maxPrice', 'symbol'],
    },
  },
  {
    name: 'swarm_remove_announcement',
    description: 'Remove your own announcement from the swarm board. Only the creator can remove.',
    inputSchema: {
      type: 'object',
      properties: {
        announcementId: { type: 'string', description: 'ID of the announcement to remove' },
      },
      required: ['announcementId'],
    },
  },
  // ── Room Negotiation Tools ──
  {
    name: 'swarm_bid',
    description: 'Bid on a peer announcement. Joins the private negotiation room and submits a price offer. The announcement creator will see the bid and can accept it.',
    inputSchema: {
      type: 'object',
      properties: {
        announcementId: { type: 'string', description: 'The announcement ID to bid on' },
        price: { type: 'string', description: 'Bid price (e.g., "50")' },
        symbol: { type: 'string', enum: ['USDT', 'XAUT', 'USAT', 'BTC', 'ETH'] },
        reason: { type: 'string', description: 'Why this agent is a good fit for the task' },
      },
      required: ['announcementId', 'price', 'symbol', 'reason'],
    },
  },
  {
    name: 'swarm_accept_bid',
    description: 'Accept the best bid on your announcement (creator only). Sends acceptance to the private room and exchanges payment details.',
    inputSchema: {
      type: 'object',
      properties: {
        announcementId: { type: 'string', description: 'The announcement ID whose best bid to accept' },
      },
      required: ['announcementId'],
    },
  },
  {
    name: 'swarm_submit_payment',
    description: 'Submit payment for an accepted bid. The buyer always pays. "buyer" announcements = creator pays bidder. "seller"/"auction" announcements = bidder pays creator. Only the correct payer can call this. Goes through PolicyEngine.',
    inputSchema: {
      type: 'object',
      properties: {
        announcementId: { type: 'string', description: 'The announcement ID to pay for' },
      },
      required: ['announcementId'],
    },
  },
  {
    name: 'swarm_cancel_room',
    description: 'Cancel a negotiation room (creator only). Use when you want to close a room without settling.',
    inputSchema: {
      type: 'object',
      properties: {
        announcementId: { type: 'string', description: 'The announcement ID whose room to cancel' },
      },
      required: ['announcementId'],
    },
  },
  {
    name: 'swarm_room_state',
    description: 'Get the state of negotiation rooms. Shows bids, status, accepted terms, and payment state.',
    inputSchema: {
      type: 'object',
      properties: {
        announcementId: { type: 'string', description: 'Optional: specific room ID. Omit to get all rooms.' },
      },
      required: [],
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
  // ── RGB Asset Tools ──
  {
    name: 'rgb_issue',
    description: 'Issue a new RGB asset on Bitcoin.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: { type: 'string' },
        name: { type: 'string' },
        amount: { type: 'string' },
        precision: { type: 'number' },
        reason: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['ticker', 'name', 'amount', 'precision', 'reason', 'confidence'],
    },
  },
  {
    name: 'rgb_transfer',
    description: 'Transfer an RGB asset to a recipient via their RGB invoice.',
    inputSchema: {
      type: 'object',
      properties: {
        invoice: { type: 'string' },
        amount: { type: 'string' },
        symbol: { type: 'string' },
        reason: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['invoice', 'amount', 'symbol', 'reason', 'confidence'],
    },
  },
  {
    name: 'rgb_assets',
    description: 'List all RGB assets and their balances.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  // ── Dry-Run Policy Check ──
  {
    name: 'simulate_proposal',
    description: 'Dry-run a proposal against the PolicyEngine without executing. Returns { wouldApprove, violations[] }.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['payment', 'swap', 'bridge', 'yield'] },
        amount: { type: 'string' },
        symbol: { type: 'string', enum: ['USDT', 'XAUT', 'USAT', 'BTC', 'ETH', 'RGB'] },
        chain: { type: 'string', enum: ['ethereum', 'polygon', 'bitcoin', 'arbitrum', 'rgb'] },
        to: { type: 'string' },
        toSymbol: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['type', 'amount', 'symbol', 'chain', 'confidence'],
    },
  },
  // ── Events (for connected agents) ──
  {
    name: 'get_events',
    description: 'Get recent wallet/blockchain events. Connected agents poll this to stay informed.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max events to return (default: 50)' },
      },
      required: [],
    },
  },
];

// ── Tool Handlers ──

type ToolHandler = (
  params: Record<string, unknown>,
  svc: OikosServices,
) => Promise<unknown>;

const handlers: Record<string, ToolHandler> = {
  async wallet_balance_all(_params, svc) {
    return { balances: await svc.wallet.queryBalanceAll() };
  },
  async wallet_balance(params, svc) {
    return svc.wallet.queryBalance(params['chain'] as string, params['symbol'] as string);
  },
  async wallet_address(params, svc) {
    return svc.wallet.queryAddress(params['chain'] as string);
  },
  async propose_payment(params, svc) {
    const symbol = params['symbol'] as TokenSymbol;
    const proposal: PaymentProposal = {
      amount: toSmallestUnit(params['amount'] as string, symbol),
      symbol, chain: params['chain'] as Chain, to: params['to'] as string,
      reason: params['reason'] as string, confidence: params['confidence'] as number,
      strategy: 'mcp-tool', timestamp: Date.now(),
    };
    return svc.wallet.proposePayment(proposal, 'mcp');
  },
  async propose_swap(params, svc) {
    const symbol = params['symbol'] as TokenSymbol;
    const proposal: SwapProposal = {
      amount: toSmallestUnit(params['amount'] as string, symbol),
      symbol, toSymbol: params['toSymbol'] as TokenSymbol, chain: params['chain'] as Chain,
      reason: params['reason'] as string, confidence: params['confidence'] as number,
      strategy: 'mcp-tool', timestamp: Date.now(),
    };
    return svc.wallet.proposeSwap(proposal, 'mcp');
  },
  async propose_bridge(params, svc) {
    const symbol = params['symbol'] as TokenSymbol;
    const proposal: BridgeProposal = {
      amount: toSmallestUnit(params['amount'] as string, symbol),
      symbol, chain: params['fromChain'] as Chain,
      fromChain: params['fromChain'] as Chain, toChain: params['toChain'] as Chain,
      reason: params['reason'] as string, confidence: params['confidence'] as number,
      strategy: 'mcp-tool', timestamp: Date.now(),
    };
    return svc.wallet.proposeBridge(proposal, 'mcp');
  },
  async propose_yield(params, svc) {
    const symbol = params['symbol'] as TokenSymbol;
    const proposal: YieldProposal = {
      amount: toSmallestUnit(params['amount'] as string, symbol),
      symbol, chain: params['chain'] as Chain,
      protocol: params['protocol'] as string, action: params['action'] as 'deposit' | 'withdraw',
      reason: params['reason'] as string, confidence: params['confidence'] as number,
      strategy: 'mcp-tool', timestamp: Date.now(),
    };
    return svc.wallet.proposeYield(proposal, 'mcp');
  },
  async policy_status(_params, svc) {
    return { policies: await svc.wallet.queryPolicy() };
  },
  async audit_log(params, svc) {
    const limit = typeof params['limit'] === 'number' ? params['limit'] : 20;
    return { entries: await svc.wallet.queryAudit(limit) };
  },
  async agent_state(_params, svc) {
    return {
      status: 'agent_agnostic',
      hint: 'Connect your agent via MCP tools. Oikos is the wallet, your agent is the brain.',
      swarmEnabled: !!svc.swarm,
      companionConnected: svc.companionConnected,
      eventsBuffered: svc.eventBus?.count ?? 0,
      identity: svc.identity,
    };
  },
  async swarm_state(_params, svc) {
    if (!svc.swarm) return { enabled: false };
    return { enabled: true, ...svc.swarm.getState() };
  },
  async swarm_announce(params, svc) {
    if (!svc.swarm) return { error: 'Swarm not enabled' };
    const id = svc.swarm.postAnnouncement({
      category: params['category'] as 'buyer' | 'seller' | 'auction',
      title: params['title'] as string,
      description: params['description'] as string,
      priceRange: { min: params['minPrice'] as string, max: params['maxPrice'] as string, symbol: params['symbol'] as string },
      tags: (params['tags'] as string[] | undefined) || [],
    });
    return { announcementId: id };
  },
  async swarm_remove_announcement(params, svc) {
    if (!svc.swarm) return { error: 'Swarm not enabled' };
    if (!svc.swarm.removeAnnouncement) return { error: 'Remove not supported' };
    const removed = svc.swarm.removeAnnouncement(params['announcementId'] as string);
    if (!removed) return { removed: false, reason: 'Announcement not found or not owned by you' };
    return { removed: true, announcementId: params['announcementId'] };
  },
  // ── Room Negotiation Handlers ──
  async swarm_bid(params, svc) {
    if (!svc.swarm) return { error: 'Swarm not enabled' };
    await svc.swarm.bidOnAnnouncement(
      params['announcementId'] as string,
      params['price'] as string,
      params['symbol'] as string,
      params['reason'] as string,
    );
    return { bid: true, announcementId: params['announcementId'] };
  },
  async swarm_accept_bid(params, svc) {
    if (!svc.swarm) return { error: 'Swarm not enabled' };
    const result = await svc.swarm.acceptBestBid(params['announcementId'] as string);
    if (!result) return { accepted: false, reason: 'No bids found or not the creator' };
    return { accepted: true, ...(result as Record<string, unknown>) };
  },
  async swarm_submit_payment(params, svc) {
    if (!svc.swarm) return { error: 'Swarm not enabled' };
    await svc.swarm.submitPayment(params['announcementId'] as string);
    return { submitted: true, announcementId: params['announcementId'] };
  },
  async swarm_cancel_room(params, svc) {
    if (!svc.swarm) return { error: 'Swarm not enabled' };
    if (!svc.swarm.cancelRoom) return { error: 'Cancel not supported' };
    const cancelled = svc.swarm.cancelRoom(params['announcementId'] as string);
    if (!cancelled) return { cancelled: false, reason: 'Room not found or already settled/cancelled' };
    return { cancelled: true, announcementId: params['announcementId'] };
  },
  async swarm_room_state(params, svc) {
    if (!svc.swarm) return { enabled: false };
    const state = svc.swarm.getState() as { activeRooms?: Array<{ announcementId: string }> };
    const rooms = state.activeRooms ?? [];
    const id = params['announcementId'] as string | undefined;
    if (id) {
      const room = rooms.find((r) => r.announcementId === id);
      return room ?? { error: 'Room not found' };
    }
    return { rooms };
  },
  async identity_state(_params, svc) {
    return svc.identity;
  },
  async query_reputation(params, svc) {
    return svc.wallet.queryReputation(params['agentId'] as string);
  },
  async rgb_issue(params, svc) {
    const proposal: RGBIssueProposal = {
      ticker: params['ticker'] as string, name: params['name'] as string,
      precision: params['precision'] as number,
      amount: toSmallestUnit(params['amount'] as string, 'RGB' as TokenSymbol),
      symbol: 'RGB' as TokenSymbol, chain: 'rgb' as Chain,
      reason: params['reason'] as string, confidence: params['confidence'] as number,
      strategy: 'mcp-tool', timestamp: Date.now(),
    };
    return svc.wallet.proposeRGBIssue(proposal, 'mcp');
  },
  async rgb_transfer(params, svc) {
    const proposal: RGBTransferProposal = {
      invoice: params['invoice'] as string,
      amount: toSmallestUnit(params['amount'] as string, 'RGB' as TokenSymbol),
      symbol: (params['symbol'] ?? 'RGB') as TokenSymbol, chain: 'rgb' as Chain,
      reason: params['reason'] as string, confidence: params['confidence'] as number,
      strategy: 'mcp-tool', timestamp: Date.now(),
    };
    return svc.wallet.proposeRGBTransfer(proposal, 'mcp');
  },
  async rgb_assets(_params, svc) {
    return { assets: await svc.wallet.queryRGBAssets() };
  },
  async simulate_proposal(params, svc) {
    const symbol = params['symbol'] as TokenSymbol;
    const proposal: ProposalCommon = {
      amount: toSmallestUnit(params['amount'] as string, symbol),
      symbol, chain: params['chain'] as Chain,
      reason: 'dry-run simulation', confidence: params['confidence'] as number,
      strategy: 'simulate', timestamp: Date.now(),
    };
    const p = proposal as unknown as Record<string, unknown>;
    if (params['to']) p['to'] = params['to'];
    if (params['toSymbol']) p['toSymbol'] = params['toSymbol'];
    return svc.wallet.simulateProposal(proposal);
  },
  async get_events(params, svc) {
    if (!svc.eventBus) return { events: [] };
    const limit = typeof params['limit'] === 'number' ? params['limit'] : 50;
    return { events: svc.eventBus.getRecent(limit) };
  },
};

// ── Exported handler access (for chat action executor) ──

export { handlers as mcpHandlers };

// ── JSON-RPC Router ──

function makeError(id: string | number, code: number, message: string): MCPResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleRequest(req: MCPRequest, svc: OikosServices): Promise<MCPResponse> {
  const { id, method, params } = req;

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

    if (!handler) return makeError(id, -32602, `Unknown tool: ${toolName}`);

    try {
      const result = await handler(toolArgs, svc);
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
    return { jsonrpc: '2.0', id, result: {} };
  }

  return makeError(id, -32601, `Method not found: ${method}`);
}

// ── Express Middleware ──

export function mountMCP(
  app: { post: (path: string, ...handlers: Array<(req: Request, res: Response) => void>) => void },
  services: OikosServices,
): void {
  app.post('/mcp', async (req: Request, res: Response) => {
    const body = req.body as MCPRequest;
    if (!body || body.jsonrpc !== '2.0' || !body.method) {
      res.status(400).json(makeError(body?.id ?? 0, -32600, 'Invalid JSON-RPC request'));
      return;
    }
    const response = await handleRequest(body, services);
    res.json(response);
  });

  console.error('[mcp] MCP endpoint mounted at POST /mcp');
}
