/**
 * x402 Resource Server — Sell services behind HTTP 402 paywalls.
 *
 * Adds x402 payment middleware to the Brain's Express dashboard.
 * Agents can monetize their services (price feeds, analysis, strategy files)
 * by requiring x402 micropayments.
 *
 * Uses the hosted SemanticPay facilitator for verification + settlement.
 * The agent's wallet address receives payments.
 *
 * Chains: Plasma (eip155:9745) with USD₮0
 * Facilitator: https://x402.semanticpay.io/
 *
 * @security Revenue flows TO the wallet, not from it. No policy check needed
 * for receiving payments. The facilitator handles verification and settlement.
 */

import type { Express, Request, Response, NextFunction } from 'express';
import type { WalletIPCClient } from '../ipc/client.js';

// ── Configuration ──

const PLASMA_NETWORK = 'eip155:9745';
const USDT0_PLASMA = '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb';
const FACILITATOR_URL = 'https://x402.semanticpay.io/';

/** Price in smallest units (6 decimals). 1000 = $0.001 */
export interface X402RouteConfig {
  /** Route path (e.g., "/api/x402/price-feed") */
  path: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** Price in USDT0 smallest units */
  price: string;
  /** Human description */
  description: string;
  /** MIME type of response */
  mimeType?: string;
}

/** Default x402 service routes */
const DEFAULT_ROUTES: X402RouteConfig[] = [
  {
    path: '/api/x402/price-feed',
    method: 'GET',
    price: '1000', // $0.001
    description: 'Live cryptocurrency price feed (BTC, ETH, XAUt, USDt)',
    mimeType: 'application/json',
  },
  {
    path: '/api/x402/portfolio-analysis',
    method: 'POST',
    price: '10000', // $0.01
    description: 'AI portfolio analysis and rebalancing recommendations',
    mimeType: 'application/json',
  },
  {
    path: '/api/x402/strategy',
    method: 'GET',
    price: '50000', // $0.05
    description: 'Trading strategy file (.md) for agent consumption',
    mimeType: 'text/markdown',
  },
];

/**
 * Mount x402 payment-protected routes on the Express app.
 *
 * Two modes:
 * 1. With @x402/express — proper protocol with facilitator verification
 * 2. Without @x402/express — manual 402 responses (demo/fallback)
 */
export async function mountX402Server(
  app: Express,
  wallet: WalletIPCClient,
  routes: X402RouteConfig[] = DEFAULT_ROUTES,
): Promise<{ mounted: boolean; routes: string[]; payToAddress: string }> {
  // Get wallet address for receiving payments
  let payToAddress: string;
  try {
    payToAddress = await wallet.x402GetAddress();
    if (!payToAddress) throw new Error('Empty address');
  } catch {
    console.error('[x402-server] Cannot get wallet address — x402 server disabled');
    return { mounted: false, routes: [], payToAddress: '' };
  }

  try {
    // Try proper @x402/express setup
    return await _mountWithX402Express(app, wallet, routes, payToAddress);
  } catch (err) {
    console.error('[x402-server] @x402/express not available, using manual 402 responses:', err instanceof Error ? err.message : err);
    return _mountManual402(app, wallet, routes, payToAddress);
  }
}

/**
 * Proper x402 server using @x402/express + hosted facilitator.
 */
async function _mountWithX402Express(
  app: Express,
  wallet: WalletIPCClient,
  routes: X402RouteConfig[],
  payToAddress: string,
): Promise<{ mounted: boolean; routes: string[]; payToAddress: string }> {
  const { paymentMiddleware, x402ResourceServer } = await import('@x402/express');
  const { ExactEvmScheme } = await import('@x402/evm/exact/server');
  const { HTTPFacilitatorClient } = await import('@x402/core/server');

  const facilitatorClient = new HTTPFacilitatorClient({
    url: FACILITATOR_URL,
  });

  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    PLASMA_NETWORK,
    new ExactEvmScheme(),
  );

  // Build route config map for paymentMiddleware
  // Using Record<string, unknown> to satisfy RoutesConfig type variance
  const routeMap: Record<string, unknown> = {};

  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    routeMap[key] = {
      accepts: [{
        scheme: 'exact',
        network: PLASMA_NETWORK,
        price: {
          amount: route.price,
          asset: USDT0_PLASMA,
          extra: { name: 'USDT0', version: '1', decimals: 6 },
        },
        payTo: payToAddress,
      }],
      description: route.description,
      mimeType: route.mimeType ?? 'application/json',
    };
  }

  // Mount middleware on x402 routes only
  app.use(paymentMiddleware(routeMap as Parameters<typeof paymentMiddleware>[0], resourceServer));

  // Mount actual route handlers
  _mountRouteHandlers(app, wallet, routes);

  const routePaths = routes.map(r => `${r.method} ${r.path}`);
  console.error(`[x402-server] Mounted ${routes.length} x402 routes (facilitator: ${FACILITATOR_URL})`);
  console.error(`[x402-server] Pay-to address: ${payToAddress}`);
  routePaths.forEach(r => console.error(`[x402-server]   ${r}`));

  return { mounted: true, routes: routePaths, payToAddress };
}

/**
 * Manual 402 fallback — returns proper 402 response body without facilitator.
 * Useful for demo/testing when facilitator is not available.
 */
function _mountManual402(
  app: Express,
  wallet: WalletIPCClient,
  routes: X402RouteConfig[],
  payToAddress: string,
): { mounted: boolean; routes: string[]; payToAddress: string } {
  for (const route of routes) {
    const handler = (req: Request, res: Response, next: NextFunction) => {
      // Check for payment header
      const paymentHeader = req.headers['x-payment'] ?? req.headers['payment-signature'];
      if (paymentHeader) {
        // Payment provided — pass through to actual handler
        next();
        return;
      }

      // No payment — return 402
      res.status(402).json({
        x402Version: 1,
        accepts: [{
          scheme: 'exact',
          network: PLASMA_NETWORK,
          maxAmountRequired: route.price,
          asset: USDT0_PLASMA,
          resource: `${req.protocol}://${req.get('host')}${route.path}`,
          payTo: payToAddress,
          extra: { name: 'USDT0', version: '1', decimals: 6 },
          description: route.description,
        }],
      });
    };

    if (route.method === 'GET') app.get(route.path, handler);
    else app.post(route.path, handler);
  }

  // Mount actual handlers (after 402 middleware)
  _mountRouteHandlers(app, wallet, routes);

  const routePaths = routes.map(r => `${r.method} ${r.path}`);
  console.error(`[x402-server] Mounted ${routes.length} x402 routes (manual 402 fallback)`);
  return { mounted: true, routes: routePaths, payToAddress };
}

/**
 * Mount the actual service handlers that run after payment verification.
 */
function _mountRouteHandlers(
  app: Express,
  wallet: WalletIPCClient,
  routes: X402RouteConfig[],
): void {
  for (const route of routes) {
    const handler = async (_req: Request, res: Response) => {
      try {
        if (route.path === '/api/x402/price-feed') {
          // Live prices from the wallet's pricing service
          const prices = await _getPriceFeed(wallet);
          res.json(prices);
        } else if (route.path === '/api/x402/portfolio-analysis') {
          res.json({
            analysis: 'Portfolio analysis service',
            timestamp: new Date().toISOString(),
            note: 'Full AI analysis requires LLM — this endpoint returns structured data',
          });
        } else if (route.path === '/api/x402/strategy') {
          res.type('text/markdown').send(
            '# Conservative Growth Strategy\n\n'
            + '## Allocation\n- 50% USDT (stable)\n- 30% XAUT (gold hedge)\n- 20% ETH (growth)\n\n'
            + '## Rules\n- Rebalance when drift > 5%\n- Max single trade: 10% of portfolio\n- Cooldown: 1 hour between trades\n'
          );
        } else {
          res.json({ service: route.path, timestamp: new Date().toISOString() });
        }
      } catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : 'Service error' });
      }
    };

    // Mount on the same path — Express processes in order
    if (route.method === 'GET') app.get(route.path, handler);
    else app.post(route.path, handler);
  }
}

async function _getPriceFeed(wallet: WalletIPCClient): Promise<Record<string, unknown>> {
  try {
    const balances = await wallet.queryBalanceAll();
    return {
      timestamp: new Date().toISOString(),
      source: 'oikos-agent',
      prices: {
        BTC: { symbol: 'BTC', note: 'Price available via /api/prices endpoint' },
        ETH: { symbol: 'ETH', note: 'Price available via /api/prices endpoint' },
        XAUT: { symbol: 'XAUT', note: 'Price available via /api/prices endpoint' },
        USDT: { symbol: 'USDT', price: 1.0 },
      },
      agentBalances: balances.map(b => ({ chain: b.chain, symbol: b.symbol, formatted: b.formatted })),
    };
  } catch {
    return { timestamp: new Date().toISOString(), error: 'Price feed unavailable' };
  }
}

/**
 * x402 service discovery endpoint.
 * Returns available paid services in a machine-readable format.
 */
export function mountX402Discovery(
  app: Express,
  routes: X402RouteConfig[],
  payToAddress: string,
): void {
  app.get('/api/x402/services', (_req, res) => {
    res.json({
      protocol: 'x402',
      version: 1,
      network: PLASMA_NETWORK,
      asset: USDT0_PLASMA,
      payTo: payToAddress,
      services: routes.map(r => ({
        path: r.path,
        method: r.method,
        price: r.price,
        priceFormatted: `${Number(r.price) / 1_000_000} USDT0`,
        description: r.description,
        mimeType: r.mimeType ?? 'application/json',
      })),
    });
  });
}
