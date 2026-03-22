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

import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  {
    name: 'swarm_deliver_result',
    description: 'Deliver task result or file content to a room after bid acceptance. Used by sellers to deliver strategy files, reports, or service output. Content is sent inline via the encrypted room channel.',
    inputSchema: {
      type: 'object',
      properties: {
        announcementId: { type: 'string', description: 'The announcement ID to deliver results for' },
        result: { type: 'string', description: 'The result content (text, markdown, or base64-encoded file)' },
        filename: { type: 'string', description: 'Optional filename hint (e.g. "yield-strategy-v2.md")' },
        contentType: { type: 'string', description: 'MIME type (default: text/markdown)' },
      },
      required: ['announcementId', 'result'],
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
  // ── x402 Machine Payments ──
  {
    name: 'x402_fetch',
    description: 'Make an HTTP request to an x402-enabled endpoint. Auto-detects 402 Payment Required, signs EIP-3009 authorization via wallet, and retries with payment. Uses USDT0 on Plasma/Stable chains.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch (must be x402-enabled)' },
        method: { type: 'string', enum: ['GET', 'POST'], description: 'HTTP method (default: GET)' },
        maxPaymentUsd: { type: 'number', description: 'Maximum payment in USD (default: 1.00)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'x402_status',
    description: 'Get x402 machine payment economics: total spent, total earned, requests completed/failed, services used.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  // ── Spark / Lightning ──
  {
    name: 'spark_balance',
    description: 'Get Spark (Bitcoin Lightning L2) wallet balance in satoshis. Instant, fee-free transfers.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'spark_address',
    description: 'Get a Spark deposit address for receiving Bitcoin from L1 or other Spark wallets.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['single-use', 'static'], description: 'Address type (default: static)' },
      },
      required: [],
    },
  },
  {
    name: 'spark_send',
    description: 'Send satoshis to a Spark address. Instant, zero-fee. Goes through PolicyEngine.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient Spark address (spark1...)' },
        amountSats: { type: 'number', description: 'Amount in satoshis' },
        reason: { type: 'string', description: 'Why this payment is being made' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['to', 'amountSats', 'reason', 'confidence'],
    },
  },
  {
    name: 'spark_create_invoice',
    description: 'Create a Lightning Network invoice for receiving payments. Compatible with any Lightning wallet.',
    inputSchema: {
      type: 'object',
      properties: {
        amountSats: { type: 'number', description: 'Amount in satoshis (optional for "any amount" invoice)' },
        memo: { type: 'string', description: 'Invoice memo/description' },
      },
      required: [],
    },
  },
  {
    name: 'spark_pay_invoice',
    description: 'Pay a Lightning Network invoice. Goes through PolicyEngine for spending limits.',
    inputSchema: {
      type: 'object',
      properties: {
        invoice: { type: 'string', description: 'BOLT11 Lightning invoice string (lnbc...)' },
        maxFeeSats: { type: 'number', description: 'Maximum fee in satoshis (default: 100)' },
        reason: { type: 'string', description: 'Why this payment is being made' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['invoice', 'reason', 'confidence'],
    },
  },
  {
    name: 'spark_get_transfers',
    description: 'Get Spark transfer history. Shows incoming and outgoing transfers.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['incoming', 'outgoing', 'all'], description: 'Filter by direction (default: all)' },
        limit: { type: 'number', description: 'Max transfers to return (default: 10)' },
      },
      required: [],
    },
  },
  // ── Strategy Management ──
  {
    name: 'get_active_strategies',
    description: 'Get all active strategy files. Returns parsed YAML frontmatter + markdown body for each enabled strategy. Use this before making financial decisions to get current behavioral guidance.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'save_strategy',
    description: 'Save a new strategy file or update an existing one. Strategy files are YAML-frontmatter + markdown defining behavioral guidance (portfolio targets, swarm rules, DeFi triggers, risk limits). Strategies authored by agents are time-boxed (expires_at) and flagged with source: agent.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Strategy filename without extension (e.g., "yield-optimizer"). Alphanumeric + dashes only.' },
        content: { type: 'string', description: 'Full strategy content: YAML frontmatter (---\\nenabled: true\\nsource: agent\\n---) followed by markdown body.' },
      },
      required: ['filename', 'content'],
    },
  },
  {
    name: 'toggle_strategy',
    description: 'Enable or disable a strategy by filename. Toggles the "enabled:" field in the YAML frontmatter.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Strategy filename without extension (e.g., "conservative-portfolio")' },
        enabled: { type: 'boolean', description: 'true to enable, false to disable' },
      },
      required: ['filename', 'enabled'],
    },
  },
  {
    name: 'companion_read',
    description: 'Read pending instructions from the Oikos App (companion). Returns queued messages from the human owner sent via the Pear app P2P channel. Call this to check if your owner sent you any instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        clear: { type: 'boolean', description: 'If true, clear the queue after reading (default: true)' },
      },
      required: [],
    },
  },
  {
    name: 'companion_reply',
    description: 'Send a reply to the Oikos App (companion). The reply is delivered via the P2P protomux channel to the human owner\'s Pear app.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Reply text to send to the companion app' },
        brainName: { type: 'string', description: 'Your agent name (e.g., "ludwig")' },
      },
      required: ['text'],
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
      reason: params['reason'] as string, confidence: (params['confidence'] as number) ?? 1.0,
      strategy: 'mcp-tool', timestamp: Date.now(),
    };
    const result = await svc.wallet.proposePayment(proposal, 'mcp');
    if (svc.companion && result) svc.companion.notifyExecution(result as import('../ipc/types.js').ExecutionResult);
    return result;
  },
  async propose_swap(params, svc) {
    const symbol = params['symbol'] as TokenSymbol;
    const proposal: SwapProposal = {
      amount: toSmallestUnit(params['amount'] as string, symbol),
      symbol, toSymbol: params['toSymbol'] as TokenSymbol, chain: params['chain'] as Chain,
      reason: params['reason'] as string, confidence: (params['confidence'] as number) ?? 1.0,
      strategy: 'mcp-tool', timestamp: Date.now(),
    };
    const result = await svc.wallet.proposeSwap(proposal, 'mcp');
    if (svc.companion && result) svc.companion.notifyExecution(result as import('../ipc/types.js').ExecutionResult);
    return result;
  },
  async propose_bridge(params, svc) {
    const symbol = params['symbol'] as TokenSymbol;
    const proposal: BridgeProposal = {
      amount: toSmallestUnit(params['amount'] as string, symbol),
      symbol, chain: params['fromChain'] as Chain,
      fromChain: params['fromChain'] as Chain, toChain: params['toChain'] as Chain,
      reason: params['reason'] as string, confidence: (params['confidence'] as number) ?? 1.0,
      strategy: 'mcp-tool', timestamp: Date.now(),
    };
    const result = await svc.wallet.proposeBridge(proposal, 'mcp');
    if (svc.companion && result) svc.companion.notifyExecution(result as import('../ipc/types.js').ExecutionResult);
    return result;
  },
  async propose_yield(params, svc) {
    const symbol = params['symbol'] as TokenSymbol;
    const proposal: YieldProposal = {
      amount: toSmallestUnit(params['amount'] as string, symbol),
      symbol, chain: params['chain'] as Chain,
      protocol: params['protocol'] as string, action: params['action'] as 'deposit' | 'withdraw',
      reason: params['reason'] as string, confidence: (params['confidence'] as number) ?? 1.0,
      strategy: 'mcp-tool', timestamp: Date.now(),
    };
    const result = await svc.wallet.proposeYield(proposal, 'mcp');
    if (svc.companion && result) svc.companion.notifyExecution(result as import('../ipc/types.js').ExecutionResult);
    return result;
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
  async swarm_deliver_result(params, svc) {
    if (!svc.swarm) return { error: 'Swarm not enabled' };
    if (!svc.swarm.deliverTaskResult) return { error: 'Delivery not supported' };
    const delivered = svc.swarm.deliverTaskResult(
      params['announcementId'] as string,
      params['result'] as string,
      {
        filename: params['filename'] as string | undefined,
        contentType: (params['contentType'] as string) || 'text/markdown',
        deliveryMethod: 'inline',
      },
    );
    if (!delivered) return { delivered: false, reason: 'Room not found or not in accepted state' };
    return { delivered: true, announcementId: params['announcementId'], filename: params['filename'] || null };
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
      reason: params['reason'] as string, confidence: (params['confidence'] as number) ?? 1.0,
      strategy: 'mcp-tool', timestamp: Date.now(),
    };
    return svc.wallet.proposeRGBIssue(proposal, 'mcp');
  },
  async rgb_transfer(params, svc) {
    const proposal: RGBTransferProposal = {
      invoice: params['invoice'] as string,
      amount: toSmallestUnit(params['amount'] as string, 'RGB' as TokenSymbol),
      symbol: (params['symbol'] ?? 'RGB') as TokenSymbol, chain: 'rgb' as Chain,
      reason: params['reason'] as string, confidence: (params['confidence'] as number) ?? 1.0,
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
      reason: 'dry-run simulation', confidence: (params['confidence'] as number) ?? 1.0,
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
  // ── x402 Machine Payments ──
  async x402_fetch(params, svc) {
    if (!svc.x402) return { error: 'x402 client not enabled. Set X402_ENABLED=true.' };
    const url = params['url'] as string;
    const method = (params['method'] as string) || 'GET';
    const maxPaymentUsd = (params['maxPaymentUsd'] as number) || 1.0;
    const result = await svc.x402.fetch(url, { method }, maxPaymentUsd);
    return result;
  },
  async x402_status(_params, svc) {
    if (!svc.x402) return { enabled: false, economics: null };
    return { enabled: true, economics: svc.x402.getEconomics(), services: svc.x402.getServices() };
  },
  // ── Spark / Lightning ──
  async spark_balance(_params, svc) {
    if (!svc.sparkEnabled) return { enabled: false, error: 'Spark wallet not enabled' };
    const result = await svc.wallet.querySparkBalance();
    return result;
  },
  async spark_address(params, svc) {
    if (!svc.sparkEnabled) return { enabled: false, error: 'Spark wallet not enabled' };
    const type = (params['type'] as string) || 'static';
    const result = await svc.wallet.querySparkAddress(type);
    return result;
  },
  async spark_send(params, svc) {
    if (!svc.sparkEnabled) return { enabled: false, error: 'Spark wallet not enabled' };
    const result = await svc.wallet.proposeSparkSend({
      to: params['to'] as string,
      amountSats: params['amountSats'] as number,
      reason: params['reason'] as string,
      confidence: (params['confidence'] as number) ?? 1.0,
      amount: String(params['amountSats']),
      symbol: 'BTC' as TokenSymbol,
      chain: 'spark' as Chain,
      strategy: 'mcp-tool',
      timestamp: Date.now(),
    }, 'mcp');
    if (svc.companion && result) svc.companion.notifyExecution(result as import('../ipc/types.js').ExecutionResult);
    return result;
  },
  async spark_create_invoice(params, svc) {
    if (!svc.sparkEnabled) return { enabled: false, error: 'Spark wallet not enabled' };
    const result = await svc.wallet.querySparkCreateInvoice(
      params['amountSats'] as number | undefined,
      params['memo'] as string | undefined,
    );
    return result;
  },
  async spark_pay_invoice(params, svc) {
    if (!svc.sparkEnabled) return { enabled: false, error: 'Spark wallet not enabled' };
    const result = await svc.wallet.proposeSparkPayInvoice({
      invoice: params['invoice'] as string,
      maxFeeSats: (params['maxFeeSats'] as number) || 100,
      reason: params['reason'] as string,
      confidence: (params['confidence'] as number) ?? 1.0,
      amount: '0', // Amount determined by invoice
      symbol: 'BTC' as TokenSymbol,
      chain: 'spark' as Chain,
      strategy: 'mcp-tool',
      timestamp: Date.now(),
    }, 'mcp');
    return result;
  },

  async spark_get_transfers(params, svc) {
    if (!svc.sparkEnabled) return { enabled: false, error: 'Spark wallet not enabled' };
    const transfers = await svc.wallet.querySparkTransfers(
      params['direction'] as 'incoming' | 'outgoing' | 'all' | undefined,
      params['limit'] as number | undefined,
    );
    return { transfers };
  },

  // ── Strategy Management Handlers ──

  async get_active_strategies() {
    const mcpDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = join(mcpDir, '..', '..', '..');
    const candidates = [
      join(repoRoot, 'strategies'),
      join(process.cwd(), 'strategies'),
      join(process.cwd(), '..', 'strategies'),
    ];
    const strategiesDir = candidates.find(d => existsSync(d));
    if (!strategiesDir) return { strategies: [], count: 0 };

    const files = readdirSync(strategiesDir).filter(f => f.endsWith('.md'));
    const strategies = files.map(file => {
      const raw = readFileSync(join(strategiesDir, file), 'utf-8');
      // Parse YAML frontmatter
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      const frontmatter: Record<string, string> = {};
      let body = raw;
      if (fmMatch?.[1] && fmMatch[2] !== undefined) {
        body = fmMatch[2];
        for (const line of fmMatch[1].split('\n')) {
          const [k, ...rest] = line.split(':');
          if (k && rest.length) frontmatter[k.trim()] = rest.join(':').trim();
        }
      }
      // Also detect simple "enabled: true" outside frontmatter
      const enabledMatch = raw.match(/enabled:\s*(true|false)/i);
      const enabled = enabledMatch?.[1] ? enabledMatch[1] === 'true' : true;
      const nameMatch = raw.match(/^#\s+(.+)$/m);

      return {
        id: file.replace('.md', ''),
        filename: file,
        name: nameMatch?.[1] ?? file.replace('.md', ''),
        enabled,
        source: frontmatter['source'] ?? (raw.includes('[Agent]') ? 'agent' : 'human'),
        expires_at: frontmatter['expires_at'] ?? null,
        tags: frontmatter['tags'] ?? null,
        confidence: frontmatter['confidence'] ?? null,
        body,
      };
    });

    const active = strategies.filter(s => s.enabled);
    return { strategies: active, all: strategies, count: active.length };
  },

  async save_strategy(params) {
    const filename = params['filename'] as string | undefined;
    const content = params['content'] as string | undefined;
    if (!filename || !content) return { error: 'filename and content required' };

    const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, '') + '.md';
    const mcpDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = join(mcpDir, '..', '..', '..');
    const candidates = [
      join(repoRoot, 'strategies'),
      join(process.cwd(), 'strategies'),
      join(process.cwd(), '..', 'strategies'),
    ];
    const strategiesDir = candidates.find(d => existsSync(d)) ?? candidates[0] as string;
    if (!existsSync(strategiesDir)) mkdirSync(strategiesDir, { recursive: true });

    // Guard: agent/purchased strategies are always saved disabled — only human approval can enable
    let finalContent = content;
    const isAgentAuthored = /source:\s*(agent|purchased)/i.test(content);
    let requiresApproval = false;
    if (isAgentAuthored) {
      finalContent = finalContent.replace(/enabled:\s*true/gi, 'enabled: false');
      // Inject enabled: false if the field is missing entirely
      if (!/enabled:/i.test(finalContent)) {
        finalContent = finalContent.replace(/^---\n/, '---\nenabled: false\n');
      }
      requiresApproval = true;
      console.error(`[strategies] Agent-authored strategy forced to enabled: false (requires human approval)`);
    }

    const exists = existsSync(join(strategiesDir, safeName));
    writeFileSync(join(strategiesDir, safeName), finalContent);
    console.error(`[strategies] ${exists ? 'Updated' : 'Created'} strategy: ${safeName}`);
    return { success: true, filename: safeName, action: exists ? 'updated' : 'created', requiresApproval };
  },

  async toggle_strategy(params) {
    const filename = params['filename'] as string | undefined;
    const enabled = params['enabled'] as boolean | undefined;
    if (!filename || enabled === undefined) return { error: 'filename and enabled required' };

    const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, '') + '.md';
    const mcpDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = join(mcpDir, '..', '..', '..');
    const candidates = [
      join(repoRoot, 'strategies'),
      join(process.cwd(), 'strategies'),
      join(process.cwd(), '..', 'strategies'),
    ];
    const strategiesDir = candidates.find(d => existsSync(d));
    if (!strategiesDir) return { error: 'No strategies directory found' };

    const filePath = join(strategiesDir, safeName);
    if (!existsSync(filePath)) return { error: `Strategy not found: ${safeName}` };

    let content = readFileSync(filePath, 'utf-8');
    const enabledRegex = /enabled:\s*(true|false)/i;
    if (enabledRegex.test(content)) {
      content = content.replace(enabledRegex, `enabled: ${enabled}`);
    } else {
      // Insert at top if no enabled field exists
      content = `enabled: ${enabled}\n` + content;
    }
    writeFileSync(filePath, content);
    console.error(`[strategies] ${enabled ? 'Enabled' : 'Disabled'} strategy: ${safeName}`);
    return { success: true, filename: safeName, enabled };
  },

  async companion_read(params, svc) {
    const clear = params['clear'] !== false; // default true
    const instructions = [...svc.instructions];
    if (clear && instructions.length > 0) {
      svc.instructions.splice(0, svc.instructions.length);
    }
    return {
      instructions,
      count: instructions.length,
      companionConnected: svc.companionConnected,
    };
  },

  async companion_reply(params, svc) {
    const text = String(params['text'] ?? '').trim();
    if (!text) return { error: 'text required' };
    const brainName = String(params['brainName'] ?? 'agent');

    if (!svc.companion || !svc.companion.isConnected()) {
      return { sent: false, reason: 'Companion not connected' };
    }

    const sent = svc.companion.send({
      type: 'chat_reply' as const,
      text,
      brainName,
      timestamp: Date.now(),
    });

    // Also store in chat history so dashboard sees it
    svc.chatMessages.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      from: 'agent',
      timestamp: Date.now(),
    });

    return { sent, brainName };
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

// ── Express Middleware (local JSON-RPC) ──

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

// ── Streamable HTTP Transport (MCP 2025-03-26 spec) ──
// For Claude iOS/web custom connectors and any remote MCP client.

/** Active sessions — maps session ID to creation timestamp */
const sessions = new Map<string, number>();

/** Session TTL: 30 minutes */
const SESSION_TTL_MS = 30 * 60 * 1000;

/** Cleanup expired sessions (called on each request) */
function cleanSessions(): void {
  const now = Date.now();
  for (const [id, created] of sessions) {
    if (now - created > SESSION_TTL_MS) sessions.delete(id);
  }
}

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
export function mountRemoteMCP(
  app: {
    post: (path: string, ...handlers: Array<(req: Request, res: Response) => void>) => void;
    get: (path: string, ...handlers: Array<(req: Request, res: Response) => void>) => void;
    delete: (path: string, ...handlers: Array<(req: Request, res: Response) => void>) => void;
    options: (path: string, ...handlers: Array<(req: Request, res: Response) => void>) => void;
  },
  services: OikosServices,
  authToken?: string,
): void {
  const MCP_PATH = '/mcp/remote';

  // ── Auth middleware ──
  function checkAuth(req: Request, res: Response): boolean {
    // CORS preflight always passes
    if (req.method === 'OPTIONS') return true;

    if (!authToken) return true; // authless mode

    const auth = req.headers['authorization'];
    if (!auth || auth !== `Bearer ${authToken}`) {
      res.status(401).json({ jsonrpc: '2.0', id: 0, error: { code: -32000, message: 'Unauthorized' } });
      return false;
    }
    return true;
  }

  // ── Session validation ──
  function validateSession(req: Request, res: Response, method: string): boolean {
    // initialize doesn't need a session
    if (method === 'initialize') return true;

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && !sessions.has(sessionId)) {
      res.status(404).json({ jsonrpc: '2.0', id: 0, error: { code: -32000, message: 'Session expired' } });
      return false;
    }
    return true;
  }

  // ── CORS for remote clients ──
  app.options(MCP_PATH, (_req: Request, res: Response) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Mcp-Session-Id',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id',
      'Access-Control-Max-Age': '86400',
    });
    res.status(204).end();
  });

  // ── POST: Client sends JSON-RPC messages ──
  app.post(MCP_PATH, async (req: Request, res: Response) => {
    if (!checkAuth(req, res)) return;
    cleanSessions();

    // Set CORS headers on all responses
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    });

    const body = req.body;

    // Handle batch (array) or single message
    const messages: MCPRequest[] = Array.isArray(body) ? body : [body];

    // Separate requests from notifications/responses
    const requests: MCPRequest[] = [];
    const notificationsAndResponses: MCPRequest[] = [];

    for (const msg of messages) {
      if (!msg || msg.jsonrpc !== '2.0') {
        res.status(400).json(makeError(0, -32600, 'Invalid JSON-RPC request'));
        return;
      }
      // Requests have an id and a method
      if (msg.id !== undefined && msg.id !== null && msg.method) {
        if (!validateSession(req, res, msg.method)) return;
        requests.push(msg);
      } else {
        notificationsAndResponses.push(msg);
      }
    }

    // If only notifications/responses, acknowledge with 202
    if (requests.length === 0) {
      // Process notifications silently (e.g., notifications/initialized)
      for (const msg of notificationsAndResponses) {
        if (msg.method) {
          await handleRequest(msg, services).catch(() => { /* ignore */ });
        }
      }
      res.status(202).end();
      return;
    }

    // Process all requests
    const responses: MCPResponse[] = [];
    for (const request of requests) {
      const response = await handleRequest(request, services);

      // If this is an initialize response, create a session
      if (request.method === 'initialize' && response.result) {
        const sessionId = randomUUID();
        sessions.set(sessionId, Date.now());
        res.set('Mcp-Session-Id', sessionId);
      }

      responses.push(response);
    }

    // Check Accept header to decide response format
    const accept = req.headers['accept'] ?? '';

    if (accept.includes('text/event-stream')) {
      // SSE response — stream each response as an event
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // nginx: disable buffering
      });
      res.flushHeaders();

      for (const response of responses) {
        const eventId = randomUUID();
        res.write(`id: ${eventId}\n`);
        res.write(`event: message\n`);
        res.write(`data: ${JSON.stringify(response)}\n\n`);
      }

      // Close the stream after all responses sent
      res.end();
    } else {
      // Plain JSON response
      res.set('Content-Type', 'application/json');
      if (responses.length === 1) {
        res.json(responses[0]);
      } else {
        res.json(responses);
      }
    }
  });

  // ── GET: Server-initiated SSE stream ──
  app.get(MCP_PATH, (req: Request, res: Response) => {
    if (!checkAuth(req, res)) return;

    const accept = req.headers['accept'] ?? '';
    if (!accept.includes('text/event-stream')) {
      res.status(405).json({ error: 'Method Not Allowed. Use Accept: text/event-stream' });
      return;
    }

    // Validate session
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && !sessions.has(sessionId)) {
      res.status(404).json({ jsonrpc: '2.0', id: 0, error: { code: -32000, message: 'Session expired' } });
      return;
    }

    // Open SSE stream for server-initiated messages
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    // Keep-alive ping every 30s to prevent proxy timeouts
    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });

    // For now, we don't push server-initiated messages.
    // The stream stays open for future use (notifications, etc.)
  });

  // ── DELETE: Session termination ──
  app.delete(MCP_PATH, (req: Request, res: Response) => {
    if (!checkAuth(req, res)) return;

    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    });

    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      sessions.delete(sessionId);
      res.status(200).json({ ok: true });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  const authMode = authToken ? 'Bearer token' : 'authless';
  console.error(`[mcp] Remote MCP endpoint mounted at ${MCP_PATH} (${authMode})`);
  console.error(`[mcp] Claude iOS: Add as custom connector → https://<your-domain>${MCP_PATH}`);
}
