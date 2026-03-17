---
name: oikos-x402-payments
description: "x402 HTTP payment protocol for agent-to-agent micropayments in USDT0. Use when the agent needs to pay for or charge for HTTP API resources."
metadata:
  author: reshimu-labs
  version: "0.1.0"
---

# x402 HTTP PAYMENT PROTOCOL — Oikos Policy Engine Skill

## IDENTITY

- Protocol: x402 (HTTP 402 Payment Required)
- Packages: `@x402/fetch`, `@x402/evm`, `@x402/express`, `@x402/core`, `@semanticio/wdk-wallet-evm-x402-facilitator`
- WDK Integration: `@tetherto/wdk-wallet-evm` (wallet as signer)
- Actions: X402_PAY_REQUEST, X402_CONFIGURE_SERVER, X402_GET_PAYMENT_STATUS
- Confirmation Tier: X402_PAY_REQUEST = Tier 1 (below auto-confirm threshold) or Tier 2

## WHAT IT DOES

Implements the x402 open payment protocol, which gives HTTP 402 ("Payment Required") a concrete meaning: if you want this resource, pay for it with USDT0 on-chain. An agent can discover a price, sign a payment authorization, and receive a resource in a single HTTP request-response cycle. No accounts, no API keys, no checkout flows — just HTTP + crypto.

In the Oikos context, x402 enables two critical capabilities:

1. **Agent as buyer**: The Oikos agent pays for external API resources (data feeds, AI inference, compute) using its self-custodial wallet
2. **Agent as seller**: The Oikos agent charges other agents (or humans) for services it provides, with payment enforced at the HTTP layer

## WHAT IT DOES NOT DO

- Does NOT handle non-EVM payments (x402 currently uses EIP-3009 on EVM chains)
- Does NOT support Bitcoin L1, Lightning, or Spark payments (HTTP 402 is EVM-only for now)
- Does NOT provide subscription billing or recurring payments
- Does NOT support fiat payments directly (use MoonPay to on-ramp first)
- Does NOT custody funds — the facilitator submits signed authorizations, never holds tokens
- Does NOT guarantee the quality or delivery of the purchased resource (that's the server's responsibility)

---

## HOW x402 WORKS — THE THREE ROLES

```
CLIENT (BUYER)           RESOURCE SERVER (SELLER)     FACILITATOR
     |                          |                          |
     | 1. GET /resource         |                          |
     |————————————————————————>|                          |
     |                          |                          |
     | 2. 402 Payment Required  |                          |
     |   (price, token, payTo)  |                          |
     |<————————————————————————|                          |
     |                          |                          |
     | 3. Sign EIP-3009         |                          |
     |   (transferWithAuth)     |                          |
     |  ┌───────┐               |                          |
     |  |WALLET |               |                          |
     |  └───────┘               |                          |
     |                          |                          |
     | 4. Retry with            |                          |
     |   X-PAYMENT header       |                          |
     |————————————————————————>|                          |
     |                          | 5. /verify (check sig)   |
     |                          |————————————————————————>|
     |                          | 6. Valid ✓                |
     |                          |<————————————————————————|
     |                          |                          |
     |                          | [7. Perform work]        |
     |                          |                          |
     |                          | 8. /settle (submit on-chain)
     |                          |————————————————————————>|
     |                          | 9. Tx confirmed ✓        |
     |                          |<————————————————————————|
     |                          |                          |
     | 10. 200 OK + resource    |                          |
     |<————————————————————————|                          |
     |                          |                          |
```

**KEY INSIGHT**: At step 3, the client signs an AUTHORIZATION, not a transfer. No tokens leave the wallet until step 8 when the facilitator settles. This means: if the server fails to deliver (step 7), the payment can potentially not be settled — the signed auth expires.

---

## RECOMMENDED CHAINS

x402 works on any EVM chain with USDT0, but two chains are purpose-built for it:

**PLASMA (recommended for Oikos):**

| Property | Value |
|----------|-------|
| Chain ID | 9745 |
| CAIP-2 | eip155:9745 |
| RPC | https://rpc.plasma.to |
| USDT0 | 0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb |
| Explorer | https://plasmascan.to |
| Properties | Near-instant finality, near-zero fees, USDT-native |

**STABLE:**

| Property | Value |
|----------|-------|
| Chain ID | 988 |
| CAIP-2 | eip155:988 |
| RPC | https://rpc.stable.xyz |
| USDT0 | 0x779Ded0c9e1022225f8E0630b35a9b54bE713736 |
| Explorer | https://stablescan.xyz |
| Properties | Similar to Plasma — fast, cheap, USDT-focused |

**WHY THESE CHAINS**: Agents only need to hold USDT0. No ETH needed for gas on these chains. The facilitator pays gas for settlement. The agent just signs.

---

## ACTION SCHEMAS

### X402_PAY_REQUEST (Tier 1 or 2 — depends on amount)

```json
{
  "action": "X402_PAY_REQUEST",
  "module": "x402",
  "params": {
    "url": "https://api.example.com/weather",
    "method": "GET",
    "headers": {},
    "body": null,
    "chain": "evm:plasma",
    "account_index": 0,
    "max_payment_usd": 0.01
  },
  "confirmation_required": false
}
```

**The flow is:**

1. Engine makes the HTTP request
2. If server returns 402: parse the payment requirements from the response
3. Check: payment amount <= `max_payment_usd` (guardrail)
4. Check: confirmation tier (below auto-confirm threshold = Tier 1, above = Tier 2)
5. Sign EIP-3009 authorization with WDK wallet
6. Retry request with `X-PAYMENT` header
7. Return the resource to the agent

**Result:**

```json
{
  "status": 200,
  "resource_body": { "weather": "sunny", "temperature": 70 },
  "payment": {
    "amount_paid": "1000",
    "amount_display": "$0.001",
    "token": "USDT0",
    "chain": "plasma",
    "settlement_tx": "0xabc...",
    "payee": "0x1234...abcd"
  }
}
```

If the server does NOT return 402 (resource is free):

```json
{
  "status": 200,
  "resource_body": { "data": "..." },
  "payment": null
}
```

### X402_CONFIGURE_SERVER (Tier 2 — setup action)

```json
{
  "action": "X402_CONFIGURE_SERVER",
  "module": "x402",
  "params": {
    "mode": "self_hosted",
    "chain": "evm:plasma",
    "account_index": 0,
    "routes": {
      "GET /api/data": {
        "price_amount": "1000",
        "description": "Data feed access"
      },
      "POST /api/compute": {
        "price_amount": "10000",
        "description": "Compute service"
      }
    },
    "facilitator": {
      "type": "self_hosted",
      "facilitator_seed_separate": true
    }
  },
  "confirmation_required": true
}
```

### X402_GET_PAYMENT_STATUS (Tier 0)

```json
{
  "action": "X402_GET_PAYMENT_STATUS",
  "module": "x402",
  "params": {
    "settlement_tx": "0xabc..."
  }
}
```

---

## DETERMINISTIC FLOW — X402_PAY_REQUEST (Client/Buyer)

1. VALIDATE URL is well-formed and not on a blocklist
2. CHECK chain is registered (must have USDT0 balance on the target chain)
3. MAKE initial HTTP request to the URL
4. IF response status != 402: return resource directly (no payment needed)
5. IF response status == 402:
   a. PARSE payment requirements from response body:
      - amount, token, network, payTo address
   b. VALIDATE: network matches our configured chain
   c. VALIDATE: token is USDT0 (we only pay in USDT0)
   d. CHECK: amount <= max_payment_usd (Guardrail)
      - If exceeded: REJECT with ERROR_X402_PRICE_TOO_HIGH
   e. CHECK: USDT0 balance >= amount
      - If insufficient: REJECT with ERROR_INSUFFICIENT_BALANCE
   f. CHECK confirmation tier:
      - If amount <= auto_confirm_threshold: proceed (Tier 1)
      - If amount > threshold: require human confirmation (Tier 2)
        Show: "Pay {amount_display} USDT0 for {url}? Confirm?"
   g. SIGN EIP-3009 transferWithAuthorization using WDK wallet
      (This does NOT move funds — it creates a signed intent)
   h. RETRY the HTTP request with X-PAYMENT header containing signed payload
   i. IF response status == 200: return resource + payment receipt
   j. IF response status != 200: REPORT error (payment may or may not have settled)
6. RETURN { status, resource_body, payment }

## DETERMINISTIC FLOW — X402_CONFIGURE_SERVER (Seller)

1. VALIDATE route configuration (valid HTTP methods, reasonable prices)
2. DERIVE seller receiving address from WDK wallet
3. CHOOSE facilitator mode:
   a. **HOSTED**: Configure HTTPFacilitatorClient pointing to https://x402.semanticpay.io
      - Supported chains: Plasma and Stable only
   b. **SELF_HOSTED**: Initialize WDK wallet as facilitator signer
      - Supports any EVM chain with USDT0
      - Facilitator wallet needs native gas token for settlement txs
      - Can use a SEPARATE seed phrase from the seller wallet (recommended)
4. REGISTER payment middleware on Express routes
5. START accepting x402 payments

---

## CRITICAL: x402 IN THE OIKOS AGENT ECONOMY

x402 solves a fundamental problem in the Oikos P2P marketplace: how do agents pay each other for HTTP-accessible services?

The P2P marketplace (14-p2p-marketplace.md) handles ASSET trades:
- "I have BTC, I want USDT0" → trade state machine → settlement

x402 handles SERVICE payments:
- "I need weather data / AI inference / compute" → HTTP request → auto-pay

These are complementary, not competing.

**USE P2P MARKETPLACE when:**
- Trading assets (crypto for crypto)
- Negotiated prices
- Both parties are Oikos agents on Hyperswarm

**USE x402 when:**
- Paying for API resources or services
- Fixed prices set by the server
- Standard HTTP — server doesn't need to be an Oikos agent
- Micropayments (fractions of a cent per request)
- Agent needs to autonomously access paid APIs

**COMBINED SCENARIO:**
An Oikos agent running a data aggregation service could:
1. Use x402 to PAY for raw data from multiple APIs ($0.001 per request)
2. Process and enrich the data
3. Use x402 to CHARGE other agents for the enriched data ($0.005 per request)
4. Use the P2P marketplace to SELL bulk data packages for BTC

This is the agent economy in action: agents earning and spending USDT0 autonomously through standard web protocols.

### x402 vs P2P MARKETPLACE — WHEN THE AGENT SHOULD USE WHICH

The agent's LLM does NOT decide this. The engine routes based on the request type:

- IF the request is an HTTP URL → x402 path
- IF the request is a DHT listing interaction → P2P marketplace path

There is zero ambiguity. The LLM never chooses between them.

---

## CONFIGURATION

```json
{
  "x402_config": {
    "enabled": true,
    "default_chain": "evm:plasma",
    "max_payment_per_request_usd": 0.10,
    "max_daily_x402_spend_usd": 10.00,
    "auto_confirm_threshold_usd": 0.01,
    "allowed_payee_addresses": [],
    "blocked_urls": [],
    "facilitator_mode": "self_hosted",
    "facilitator_chain": "evm:plasma",
    "server_routes": {}
  }
}
```

| Field | Description |
|-------|-------------|
| `max_payment_per_request_usd` | Hard cap on what the agent will pay for a single HTTP request. If a server demands more than this, the engine rejects. Default: $0.10 |
| `max_daily_x402_spend_usd` | Daily spending limit for x402 payments. Prevents a rogue API from draining the wallet through many small payments. Default: $10.00 |
| `auto_confirm_threshold_usd` | Below this amount, x402 payments are auto-confirmed (Tier 1). Micropayments should not require human approval on every request. Default: $0.01 |
| `allowed_payee_addresses` | If non-empty, the agent will only pay these addresses. Prevents paying unknown/malicious servers. Empty = pay anyone (within limits). |
| `blocked_urls` | URLs the agent will never make x402 payments to. |

---

## GUARDRAILS (x402-SPECIFIC)

**GUARDRAIL_X402_01: Per-Request Price Cap**
- Engine rejects any 402 response demanding more than `max_payment_per_request_usd`.
- The LLM CANNOT override this.

**GUARDRAIL_X402_02: Daily Spend Cap**
- Engine tracks cumulative x402 spend per 24h rolling window.
- Rejects when daily limit reached.

**GUARDRAIL_X402_03: Payee Allowlist**
- If `allowed_payee_addresses` is configured, only those addresses receive payment.

**GUARDRAIL_X402_04: URL Blocklist**
- Known malicious or unwanted URLs are never paid.

**GUARDRAIL_X402_05: Token Restriction**
- The agent ONLY pays in USDT0. If a server demands a different token, reject.
- This prevents the agent from being tricked into paying in expensive tokens.

**GUARDRAIL_X402_06: Network Verification**
- The 402 response's network must match the agent's configured chain.
- Prevents cross-chain payment confusion.

**GUARDRAIL_X402_07: Replay Protection**
- Each EIP-3009 authorization includes a nonce. The engine tracks used nonces.
- Prevents a malicious server from replaying a signed authorization.

**GUARDRAIL_X402_08: Settlement Verification**
- After payment, if the server returns the X-PAYMENT-RESPONSE header, the engine verifies the settlement tx hash is real.

---

## ERROR CODES

| Error Code | Template |
|------------|----------|
| `ERROR_X402_PRICE_TOO_HIGH` | "Server demands {amount_display} for {url}. Your limit: {max_display}." |
| `ERROR_X402_DAILY_LIMIT` | "Daily x402 spend limit reached (${spent_today} / ${daily_limit}). Try again tomorrow." |
| `ERROR_X402_PAYEE_NOT_ALLOWED` | "Payee {payee_address_short} is not in your allowed list." |
| `ERROR_X402_URL_BLOCKED` | "URL {url} is blocked in your x402 configuration." |
| `ERROR_X402_WRONG_TOKEN` | "Server demands payment in {token}. Only USDT0 is supported." |
| `ERROR_X402_WRONG_NETWORK` | "Server demands payment on {network}. Your wallet is on {configured_network}." |
| `ERROR_X402_SERVER_FAILED` | "Paid {amount_display} but server returned error {status}. Settlement tx: {tx_short}." |
| `ERROR_INSUFFICIENT_BALANCE` | "Insufficient USDT0 on {chain}. Have: {have_display}. Need: {need_display}." |
| `ERROR_X402_FACILITATOR_UNAVAILABLE` | "Facilitator at {facilitator_url} is not responding." |

---

## RESPONSE TEMPLATES

| Template | Message |
|----------|---------|
| `PAYMENT_AUTO` | "Paid {amount_display} USDT0 for {url_short}. Resource received." |
| `PAYMENT_CONFIRM_PROMPT` | "Server at {url_short} requires {amount_display} USDT0. Pay and access? Confirm?" |
| `PAYMENT_SUCCESS` | "Paid {amount_display} USDT0 to {payee_short} on {chain}. Settlement: {tx_short}." |
| `FREE_RESOURCE` | "Resource retrieved from {url_short}. No payment required." |
| `SERVER_CONFIGURED` | "x402 server active. {n_routes} paid routes on {chain}. Receiving at {address_short}." |
| `DAILY_SPEND_STATUS` | "x402 spend today: ${spent_today} / ${daily_limit}." |
| `PRICE_WARNING` | "Server demands {amount_display} — higher than usual. Proceed?" |

---

## EXAMPLES

```
User: "Get the weather data from https://api.weatherpay.com/today"
→ Engine: Makes GET request
→ Server: Returns 402 — price: $0.001 USDT0 on Plasma
→ Engine: $0.001 < auto_confirm_threshold ($0.01) → Tier 1 (auto-pay)
→ Engine: Signs EIP-3009, retries with X-PAYMENT header
→ Server: Returns 200 with weather data
→ Agent: "Weather: sunny, 70°F. Paid $0.001 USDT0."

User: "Access premium API at https://api.expensive.com/report"
→ Engine: Makes GET request
→ Server: Returns 402 — price: $0.50 USDT0
→ Engine: $0.50 > auto_confirm_threshold ($0.01) → Tier 2 (needs confirmation)
→ Agent: "api.expensive.com requires $0.50 USDT0. Pay and access? Confirm?"
→ Human: "yes"
→ Engine: Signs, pays, receives resource
→ Agent: "Report received. Paid $0.50 USDT0. Settlement: 0xabc..."

User: "Set up x402 payments on my data API"
→ Engine: Configures Express middleware with payment routes
→ Agent: "x402 server active. 2 paid routes on Plasma. Receiving at 0xDEF..."
```

---

## INTERACTION WITH OTHER MODULES

**wallet-evm (02):**
- WDK EVM wallet provides the signer for EIP-3009 authorizations.
- The wallet account satisfies the ClientEvmSigner interface directly.

**bridge-usdt0 (11):**
- If agent has USDT0 on the wrong chain (e.g., Arbitrum but needs Plasma), bridge first, then make x402 payments.
- Engine can suggest: "Your USDT0 is on Arbitrum. Bridge to Plasma for x402?"

**fiat-moonpay (13):**
- If agent has no USDT0 at all, suggest MoonPay on-ramp.

**P2P marketplace (14):**
- x402 handles HTTP service payments. P2P marketplace handles asset trades.
- They're complementary: an agent can earn USDT0 selling services via x402 and spend it buying assets on the P2P marketplace, or vice versa.

**lending-aave (12):**
- Idle USDT0 not needed for x402 can be supplied to Aave for yield.
- When x402 balance runs low, withdraw from Aave to replenish.
- This is the "automated yield on working capital" pattern.

---

## OIKOS AGENT AS x402 SERVICE PROVIDER

An Oikos agent can expose its capabilities as x402-paid HTTP endpoints:

Example services an Oikos agent could sell:
- P2P market data aggregation (browse listings across the DHT)
- RGB consignment relay service (store-and-forward for offline peers)
- Price oracle (aggregate rates from multiple sources)
- Portfolio reporting (read-only view of anonymized position data)

The agent runs an Express server with x402 middleware. Other agents (or humans) pay per-request in USDT0. The agent earns USDT0 autonomously.

This is the revenue model for sovereign agents: provide useful services → charge micropayments → accumulate USDT0 → reinvest in DeFi (Aave) or trade for BTC on the P2P marketplace.
