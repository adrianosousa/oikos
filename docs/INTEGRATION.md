# Oikos Protocol -- Integration Guide

Five integration surfaces for connecting any agent framework to the Oikos wallet.

## 1. OpenClaw Skill

The simplest integration. Drop the skill directory into any OpenClaw agent's skills folder.

**Setup:**

```bash
cp -r skills/wdk-wallet/ ~/.openclaw/skills/wdk-wallet/
```

The skill file (`SKILL.md`) contains YAML frontmatter and structured markdown that teaches
any OpenClaw agent how to use the wallet. The agent learns:

- Supported assets (USDT, XAUT, USAT, BTC, ETH) and chains
- How to propose payments, swaps, bridges, and yield operations
- The decision output format (JSON with `shouldPay`, `confidence`, `amount`, etc.)
- Policy rules and how to handle rejections
- ERC-8004 identity and swarm trading capabilities
- Security constraints (what the agent cannot do)

**Decision output format:**

```json
{
  "shouldPay": true,
  "reason": "Payment for data feed service",
  "confidence": 0.85,
  "amount": "2000000",
  "symbol": "USDT",
  "chain": "ethereum",
  "to": "0xRecipientAddress",
  "strategy": "direct-payment",
  "operationType": "payment"
}
```

Compatible with the `tetherto/wdk-agent-skills` AgentSkills specification.

## 2. MCP Server

Model Context Protocol server exposing 14 tools via JSON-RPC 2.0. Any MCP-compatible agent
(Claude, etc.) can discover and use wallet capabilities.

**Endpoint:** `POST /mcp` on the dashboard server (default `http://localhost:3420/mcp`).

**Lifecycle:**

```bash
# 1. Initialize
curl -X POST http://localhost:3420/mcp -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}
}'
# Response: { protocolVersion, capabilities, serverInfo }

# 2. Discover tools
curl -X POST http://localhost:3420/mcp -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}
}'
# Response: { tools: [...14 tool definitions...] }

# 3. Call a tool
curl -X POST http://localhost:3420/mcp -H "Content-Type: application/json" -d '{
  "jsonrpc": "2.0", "id": 3, "method": "tools/call",
  "params": { "name": "wallet_balance_all", "arguments": {} }
}'
```

**Available tools:**

| Tool | Description |
|------|-------------|
| `wallet_balance_all` | All balances across all chains and assets |
| `wallet_balance` | Balance for specific chain + symbol |
| `wallet_address` | Wallet address for a specific chain |
| `propose_payment` | Propose a token transfer (goes through PolicyEngine) |
| `propose_swap` | Propose a token swap (e.g., USDT to XAUT) |
| `propose_bridge` | Propose a cross-chain bridge |
| `propose_yield` | Propose yield deposit/withdrawal |
| `policy_status` | Current policy state: budgets, cooldowns |
| `audit_log` | Query the audit trail |
| `agent_state` | Agent brain status, reasoning, portfolio |
| `swarm_state` | Connected peers, active rooms, economics |
| `swarm_announce` | Post announcement to the swarm board |
| `identity_state` | ERC-8004 on-chain identity status |
| `query_reputation` | On-chain reputation from ERC-8004 registry |

All proposal tools flow through the Wallet Isolate's PolicyEngine. The MCP server never signs
transactions or handles keys.

## 3. Direct IPC

For custom agents that can spawn a child process. Communication is via newline-delimited JSON
over stdin/stdout.

**Spawn the Wallet Isolate:**

```javascript
import { spawn } from 'child_process';

const wallet = spawn('node', ['wallet-isolate/dist/src/main.js'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: {
    ...process.env,
    WALLET_PASSPHRASE: 'your-passphrase-min-12-chars',
    WALLET_SEED_FILE: './data/seed.enc.json',
    POLICIES_PATH: './policies.json',
  }
});
```

**Send a request:**

```javascript
const request = {
  id: crypto.randomUUID(),
  type: 'propose_payment',
  source: 'llm',
  payload: {
    amount: '2000000',
    symbol: 'USDT',
    chain: 'ethereum',
    to: '0xRecipientAddress',
    reason: 'Payment for service',
    confidence: 0.85,
    strategy: 'direct-payment',
    timestamp: Date.now()
  }
};
wallet.stdin.write(JSON.stringify(request) + '\n');
```

**Read the response:**

```javascript
let buffer = '';
wallet.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop();  // Keep incomplete line in buffer
  for (const line of lines) {
    if (!line.trim()) continue;
    const response = JSON.parse(line);
    // response.id matches request.id
    // response.type: 'execution_result' | 'balance' | 'address' | ...
    // response.payload: result data
  }
});
```

**Request types:** `propose_payment`, `propose_swap`, `propose_bridge`, `propose_yield`,
`propose_feedback`, `identity_register`, `identity_set_wallet`, `query_balance`,
`query_balance_all`, `query_address`, `query_policy`, `query_audit`, `query_reputation`.

## 4. x402 Machine Payments

HTTP 402 protocol for commodity machine-to-machine payments. The agent can both buy and sell services.

### Agent as Client (buy services)

When the agent's HTTP request gets a 402 response, the x402 client automatically:

1. Parses the 402 response for price, asset, network, and payTo address.
2. Creates a `PaymentProposal` and sends it to the Wallet via IPC.
3. Wallet evaluates policy and signs an EIP-3009 `transferWithAuthorization`.
4. Agent retries the request with the signed authorization in the `X-PAYMENT` header.
5. The resource server's facilitator verifies and settles the payment on-chain.

```
Agent --> GET /price-feed --> 402 { price, asset, network, payTo }
Agent --> IPC propose_payment --> Wallet evaluates + signs
Agent --> GET /price-feed + X-PAYMENT: {signed auth} --> 200 { data }
```

x402 payments flow through the same PolicyEngine as all other payment types.
They are not a bypass channel.

### Agent as Server (sell services)

The agent can serve its own capabilities (price feeds, analysis, compute) behind 402 paywalls
using Express middleware:

```javascript
import { paymentMiddleware } from '@x402/express';

app.get('/price-feed', paymentMiddleware({
  price: '100000',    // 0.1 USDT
  asset: 'USDT',
  network: 'eip155:9745',  // Plasma
}), (req, res) => {
  res.json({ symbol: 'XAUT', price: 2415.30 });
});
```

Revenue and costs are tracked in the self-sustaining economics dashboard.

## 5. Hyperswarm P2P

Agent-to-agent coordination over Hyperswarm DHT with Noise-encrypted channels.

**Join the swarm:**

```javascript
import { SwarmCoordinator } from './agent-brain/src/swarm/coordinator.js';

const swarm = new SwarmCoordinator(walletClient, {
  swarmId: 'oikos-mainnet',
  agentName: 'my-agent',
  capabilities: ['price-feed', 'yield-optimizer'],
  keypairPath: './data/agent-keypair.json',
});

await swarm.start();
```

**Post an announcement:**

```javascript
const announcementId = swarm.postAnnouncement({
  category: 'service',
  title: 'Real-time XAUt price feed',
  description: 'Sub-second gold price updates from aggregated sources',
  priceRange: { min: '100000', max: '500000', symbol: 'USDT' },
});
```

**Bid on a peer's offer:**

```javascript
await swarm.bidOnAnnouncement(
  announcementId,
  '200000',  // 0.2 USDT
  'USDT',
  'Need reliable gold prices for portfolio rebalancing'
);
```

**Handle events:**

```javascript
swarm.onEvent((event) => {
  switch (event.kind) {
    case 'peer_connected': /* new peer on board */ break;
    case 'board_message':  /* announcement or heartbeat */ break;
    case 'room_message':   /* bid, counter-offer, accept, payment */ break;
    case 'settlement_completed': /* deal settled on-chain */ break;
  }
});
```

All swarm payments go through the PolicyEngine. The swarm coordinator sends payment proposals
to the Brain, which forwards them to the Wallet via IPC. Negotiation happens over Hyperswarm.
Signing happens in the Wallet Isolate. These two processes never overlap.
