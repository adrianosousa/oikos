# WDK Wallet — Full API Reference

All MCP tools are called via JSON-RPC 2.0 POST to `http://127.0.0.1:3420/mcp`.

## MCP Tool Template

```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"TOOL_NAME","arguments":{ARGS}}}'
```

## Query Tools

### wallet_balance_all
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wallet_balance_all","arguments":{}}}'
```

### wallet_balance
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wallet_balance","arguments":{"chain":"ethereum","symbol":"USDT"}}}'
```
- `chain`: "ethereum" | "polygon" | "bitcoin" | "arbitrum"
- `symbol`: "USDT" | "XAUT" | "USAT" | "BTC" | "ETH"

### wallet_address
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wallet_address","arguments":{"chain":"ethereum"}}}'
```

### policy_status
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"policy_status","arguments":{}}}'
```

### audit_log
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"audit_log","arguments":{"limit":10}}}}'
```

### agent_state
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"agent_state","arguments":{}}}'
```

### swarm_state
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"swarm_state","arguments":{}}}'
```

### identity_state
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"identity_state","arguments":{}}}'
```

### query_reputation
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"query_reputation","arguments":{"agentId":"1"}}}'
```

## Proposal Tools

Amounts use **human-readable units** (e.g., `"1.5"` = 1.5 USDT). The gateway converts to smallest units automatically.

| Symbol | Decimals | Example: `"1.5"` → smallest unit |
|--------|----------|----------------------------------|
| USDT | 6 | `"1500000"` |
| XAUT | 6 | `"1500000"` |
| USAT | 6 | `"1500000"` |
| BTC | 8 | `"150000000"` |
| ETH | 18 | `"1500000000000000000"` |

### propose_payment
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"propose_payment","arguments":{"amount":"1.5","symbol":"USDT","chain":"ethereum","to":"0xRecipientAddress","reason":"Why this payment","confidence":0.85}}}'
```

### propose_swap
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"propose_swap","arguments":{"amount":"5","symbol":"USDT","toSymbol":"XAUT","chain":"ethereum","reason":"Portfolio rebalance","confidence":0.85}}}'
```

### propose_bridge
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"propose_bridge","arguments":{"amount":"1","symbol":"USDT","fromChain":"ethereum","toChain":"arbitrum","reason":"Lower gas fees","confidence":0.9}}}'
```

### propose_yield
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"propose_yield","arguments":{"amount":"2","symbol":"USDT","chain":"ethereum","protocol":"aave-v3","action":"deposit","reason":"Earn yield on idle USDT","confidence":0.8}}}'
```

### swarm_announce
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"swarm_announce","arguments":{"category":"service","title":"Data Feed","description":"Live price data","minPrice":"0.1","maxPrice":"0.5","symbol":"USDT"}}}'
```

## RGB Asset Tools

### rgb_issue
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"rgb_issue","arguments":{"ticker":"OTKN","name":"Oikos Token","amount":"1000000","precision":6,"reason":"Issue governance token","confidence":0.9}}}'
```

### rgb_transfer
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"rgb_transfer","arguments":{"invoice":"rgb:invoice:...","amount":"100","symbol":"RGB","reason":"Payment for service","confidence":0.85}}}'
```

### rgb_assets
```bash
curl -s -X POST http://127.0.0.1:3420/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"rgb_assets","arguments":{}}}'
```

## REST API Endpoints

All GET requests to `http://127.0.0.1:3420`:

| Endpoint | Description |
|----------|-------------|
| `/api/health` | Health check |
| `/api/balances` | All balances |
| `/api/addresses` | Wallet addresses |
| `/api/state` | Agent brain state |
| `/api/policies` | Policy status |
| `/api/audit?limit=20` | Audit log |
| `/api/swarm` | Swarm state |
| `/api/economics` | Revenue/costs/sustainability |
| `/api/prices` | Live asset prices |
| `/api/valuation` | Portfolio USD valuation |
| `/api/identity` | ERC-8004 identity |
| `/api/reputation/onchain` | On-chain reputation |
| `/api/rgb/assets` | RGB assets and balances |
| `/agent-card.json` | ERC-8004 agent card |

Example: `curl -s http://127.0.0.1:3420/api/balances | jq .`
