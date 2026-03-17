---
name: oikos-fiat-moonpay
description: "MoonPay fiat on-ramp and off-ramp. Use when the human user needs to buy crypto with fiat or sell crypto for fiat. Generates widget URLs only — actual purchase happens in MoonPay."
metadata:
  author: reshimu-labs
  version: "0.1.0"
---

# MOONPAY FIAT ON/OFF-RAMP — Oikos Policy Engine Skill

## IDENTITY
- **WDK Package:** `@tetherto/wdk-protocol-fiat-moonpay`
- **Actions:** GET_BUY_QUOTE, GET_SELL_QUOTE, GET_BUY_URL, GET_SELL_URL, GET_FIAT_TX_STATUS, GET_SUPPORTED_ASSETS, GET_SUPPORTED_FIAT, GET_SUPPORTED_COUNTRIES
- **Confirmation Tier:** All actions = Tier 0 (URL generation only — actual purchase happens in MoonPay's widget, outside Oikos)

## WHAT IT DOES
Integrates MoonPay's fiat on-ramp (buy crypto with fiat) and off-ramp (sell crypto for fiat) into the Oikos wallet. Generates signed widget URLs that the user opens to complete purchases via credit card, bank transfer, Apple Pay, Google Pay, or local payment methods. Provides price quotes before the user commits. Can also track transaction status after initiation.

## WHAT IT DOES NOT DO
- Does NOT process payments directly — MoonPay handles all KYC, payment processing, and compliance
- Does NOT hold or custody fiat funds at any point
- Does NOT bypass MoonPay's KYC requirements (the user completes these in the widget)
- Does NOT guarantee exchange rates — quotes are indicative, final rate is set at payment confirmation
- Does NOT support all countries or all payment methods everywhere (availability varies by jurisdiction)
- Does NOT allow the agent to initiate a purchase without the user physically completing the MoonPay widget flow
- Does NOT work without a MoonPay API key (requires developer account at dashboard.moonpay.com)

## WHY THIS IS TIER 0 (NO CONFIRMATION FROM THE ENGINE)

Unlike swaps, bridges, and sends — which execute irreversible on-chain transactions — MoonPay actions only produce a URL. The actual financial commitment happens when the user completes the MoonPay widget flow (enters card details, passes KYC, clicks "Buy"). The engine has no control over that flow. Therefore, the engine's role is strictly: validate parameters, generate URL, present to user.

The user's own interaction with the MoonPay widget IS the confirmation.

## PREREQUISITES

```
MoonPay Developer Account:
  - API Key (public): pk_live_xxxxx or pk_test_xxxxx
  - Secret Key (private): sk_live_xxxxx or sk_test_xxxxx
  - The secret key is used to sign widget URLs (prevents tampering)
  - NEVER expose the secret key to the agent or to the user
  - Store in environment variables or secure secret manager

Configuration:
  apiKey: string    — MoonPay publishable key
  secretKey: string — MoonPay secret key (for URL signing)
```

## SUPPORTED PAYMENT METHODS (varies by region)
- Credit/debit cards (Visa, Mastercard)
- Bank transfers (ACH in US, SEPA in EU, Faster Payments in UK)
- Apple Pay, Google Pay
- Local payment methods (PIX in Brazil, iDEAL in Netherlands, etc.)

## SUPPORTED CRYPTOCURRENCIES (via WDK wallet modules)
- Ethereum + EVM tokens (ETH, USDT, USDC, etc.)
- Bitcoin (BTC)
- Solana (SOL, USDT on Solana)
- TRON (TRX, USDT on TRON)
- TON

## ACTION SCHEMAS

### GET_BUY_QUOTE (Tier 0)

```json
{
  "action": "GET_BUY_QUOTE",
  "module": "fiat-moonpay",
  "params": {
    "crypto_asset": "eth",
    "fiat_currency": "usd",
    "fiat_amount_cents": 10000
  }
}
```

**Result:**

```json
{
  "crypto_amount": "0.0308",
  "crypto_asset": "ETH",
  "fiat_amount": "100.00",
  "fiat_currency": "USD",
  "fee_fiat": "4.50",
  "fee_display": "$4.50",
  "exchange_rate": "3,245.12",
  "rate_display": "1 ETH = $3,245.12"
}
```

> Note: `fiat_amount_cents` uses integer cents to avoid float precision issues (10000 = $100.00). Alternatively, specify by crypto amount.

### GET_BUY_URL (Tier 0)

```json
{
  "action": "GET_BUY_URL",
  "module": "fiat-moonpay",
  "params": {
    "crypto_asset": "eth",
    "fiat_currency": "usd",
    "fiat_amount_cents": 10000,
    "chain": "ethereum",
    "account_index": 0,
    "widget_config": {
      "theme": "dark",
      "language": "en",
      "lock_amount": false
    }
  }
}
```

**Result:**

```json
{
  "buy_url": "https://buy.moonpay.com/?apiKey=pk_live_...&currencyCode=eth&baseCurrencyAmount=100...",
  "recipient_address": "0xABC...123",
  "expires_in_seconds": 600
}
```

### GET_SELL_URL (Tier 0)

```json
{
  "action": "GET_SELL_URL",
  "module": "fiat-moonpay",
  "params": {
    "crypto_asset": "eth",
    "fiat_currency": "usd",
    "crypto_amount": "500000000000000000",
    "chain": "ethereum",
    "account_index": 0,
    "refund_address": null
  }
}
```

### GET_FIAT_TX_STATUS (Tier 0)

```json
{
  "action": "GET_FIAT_TX_STATUS",
  "module": "fiat-moonpay",
  "params": {
    "transaction_id": "tx_abc123",
    "type": "buy"
  }
}
```

**Status values:** `"pending"`, `"waiting_payment"`, `"in_progress"`, `"completed"`, `"failed"`

## DETERMINISTIC FLOW — GET_BUY_URL

```
1. VALIDATE schema (crypto_asset is a supported MoonPay asset code)
2. CHECK chain is registered in wallet (to derive the recipient address)
3. DERIVE recipient address via wallet module: getAddress(chain, account_index)
4. BUILD MoonPay widget URL with parameters:
   - apiKey (from config)
   - currencyCode (crypto_asset)
   - baseCurrencyCode (fiat_currency)
   - baseCurrencyAmount (fiat_amount_cents / 100)
   - walletAddress (derived address)
   - colorCode, theme, language (from widget_config)
   - lockAmount (from widget_config)
5. SIGN the URL using the MoonPay secret key (HMAC-SHA256)
6. RETURN { buy_url, recipient_address }
```

## CRITICAL: WHAT THE AGENT MUST COMMUNICATE

```
For BUY operations:
  1. Show the quote first (fee breakdown, exchange rate)
  2. Present the URL as a link/button for the user to open
  3. Explain: "You'll complete the purchase in MoonPay's secure widget.
     Crypto will be sent to your wallet address {address_short}."
  4. NEVER claim the purchase is complete until GET_FIAT_TX_STATUS confirms it

For SELL operations:
  1. Show the quote (how much fiat they'll receive)
  2. Explain: "You'll need to send {crypto_amount} {asset} to MoonPay's address
     in the widget. If the sale fails, funds return to {refund_address_short}."
  3. WARN: Selling requires sending crypto OUT of the wallet — this is an on-chain tx
     with its own gas fees, separate from MoonPay's fees.
```

## AGENT-SPECIFIC CONSIDERATIONS FOR OIKOS

```
IMPORTANT: MoonPay requires KYC. Autonomous agents CANNOT complete KYC.
Therefore, MoonPay is exclusively a HUMAN-FACING feature.

In the Oikos context:
- The agent can GENERATE the URL and present it to the human owner
- The agent CANNOT open the widget or complete the purchase on behalf of the human
- The agent CAN poll GET_FIAT_TX_STATUS to inform the human when crypto arrives
- The agent CAN then use the received crypto in subsequent wallet/DeFi operations

For P2P marketplace scenarios:
- A buyer agent can suggest "Fund your wallet via MoonPay" if balance is insufficient
- The agent presents the URL, waits for the human to complete, then resumes the trade flow
```

## ERROR CODES

```
ERROR_MOONPAY_API_KEY_MISSING — "MoonPay API key not configured. Set apiKey and secretKey in fiat module config."
ERROR_MOONPAY_ASSET_UNSUPPORTED — "MoonPay does not support buying/selling {crypto_asset} on {network}."
ERROR_MOONPAY_COUNTRY_RESTRICTED — "MoonPay is not available in {country} for {buy/sell} operations."
ERROR_MOONPAY_FIAT_UNSUPPORTED — "MoonPay does not support {fiat_currency}. Supported: {supported_list}."
ERROR_MOONPAY_AMOUNT_BELOW_MINIMUM — "Minimum {buy/sell} amount is {min_amount} {fiat_currency}."
ERROR_MOONPAY_AMOUNT_ABOVE_MAXIMUM — "Maximum {buy/sell} amount is {max_amount} {fiat_currency}."
ERROR_MOONPAY_TX_NOT_FOUND — "MoonPay transaction {transaction_id} not found."
ERROR_CHAIN_NOT_REGISTERED — "Chain '{chain}' is not registered. Cannot derive recipient address."
```

## RESPONSE TEMPLATES

```
BUY_QUOTE:
  "Buying {crypto_amount} {crypto_asset} for {fiat_amount} {fiat_currency}. MoonPay fee: {fee_display}. Rate: {rate_display}."

BUY_URL_READY:
  "Ready to buy {crypto_asset} with {fiat_currency}. Open this link to complete your purchase: {buy_url}
   Crypto will arrive at your {chain} address: {address_short}."

SELL_QUOTE:
  "Selling {crypto_amount} {crypto_asset} for ~{fiat_amount} {fiat_currency}. MoonPay fee: {fee_display}."

SELL_URL_READY:
  "Ready to sell {crypto_asset}. Open this link to start the process: {sell_url}
   If the sale doesn't complete, your crypto returns to: {refund_address_short}."

TX_STATUS:
  "MoonPay transaction: {status}. {details_if_completed_or_failed}."

BALANCE_TOO_LOW_SUGGEST_BUY:
  "Your {chain} balance is insufficient for this operation. Would you like to buy {suggested_asset} via MoonPay?"
```

## EXAMPLES

```
User: "I want to buy $200 of ETH"
→ Engine: Runs GET_BUY_QUOTE (crypto_asset: "eth", fiat_currency: "usd", fiat_amount_cents: 20000)
→ Agent: "Buying ~0.0616 ETH for $200.00 USD. MoonPay fee: $8.90. Rate: 1 ETH = $3,245.12."
→ Agent: "Want me to generate the purchase link?"
→ Human: "yes"
→ Engine: Runs GET_BUY_URL with widget config
→ Agent: "Open this link to complete your purchase: [MoonPay link]. ETH will arrive at your Ethereum address: 0xABC...123."

User: "I want to sell 0.5 ETH"
→ Engine: Runs GET_SELL_QUOTE
→ Agent: "Selling 0.5 ETH for ~$1,598.40 USD. MoonPay fee: $6.20. Want me to generate the sell link?"
```

## INTEGRATION WITH OTHER MODULES

```
COMMON FLOW: User wants to supply USDT to Aave but has no crypto
1. Agent detects insufficient balance for SUPPLY action
2. Agent suggests: "Your USDT balance is $0. Buy USDT via MoonPay?"
3. Human agrees → GET_BUY_URL for USDT
4. Human completes MoonPay widget
5. Agent polls GET_FIAT_TX_STATUS until "completed"
6. Agent detects new USDT balance
7. Agent resumes the original SUPPLY flow

The engine can chain this as a multi-step plan, but each step requires
its own validation and (where applicable) confirmation.
```
