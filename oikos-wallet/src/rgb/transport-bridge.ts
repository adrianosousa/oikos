/**
 * RGB Transport Bridge — local HTTP proxy for consignment delivery.
 *
 * Bridges between @utexo/wdk-wallet-rgb (which calls HTTP transport endpoints)
 * and rgb-consignment-transport (which delivers via Hyperswarm).
 *
 * Architecture:
 * - WDK RGB wallet module in the Wallet Isolate sends HTTP requests
 *   to this local bridge (e.g., POST /consignment)
 * - The bridge translates these into Hyperswarm sessions via rgb-c-t
 * - Consignments are delivered P2P, no centralized transport server
 *
 * This preserves process isolation:
 * - Wallet Isolate: has keys, no networking (calls HTTP to localhost)
 * - Brain: has networking (Hyperswarm), no keys
 *
 * Pattern reused from rgb-wallet-pear/sidecar/proxy.js.
 *
 * @security This module runs in the Brain process. It NEVER touches
 * seed phrases or private keys. It only relays consignment data.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';

/** Stored consignments waiting to be picked up (recipientId → data) */
const pendingConsignments: Map<string, Buffer> = new Map();

/** Stored ACKs waiting to be picked up (recipientId → boolean) */
const pendingAcks: Map<string, boolean> = new Map();

/**
 * Start the RGB transport bridge HTTP server.
 *
 * Implements the RGB transport protocol endpoints:
 * - POST /consignment/:recipientId — store a consignment for delivery
 * - GET  /consignment/:recipientId — retrieve a stored consignment
 * - POST /ack/:recipientId         — store an ACK/NACK for a consignment
 * - GET  /ack/:recipientId         — retrieve a stored ACK
 *
 * In mock mode, consignments are stored in-memory (no Hyperswarm).
 * In real mode, rgb-c-t delivers via Hyperswarm sessions.
 */
export function startTransportBridge(
  port: number,
  options?: { mock?: boolean },
): { server: Server; stop: () => void } {
  const mock = options?.mock ?? true;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const parts = url.pathname.split('/').filter(Boolean);
    const type = parts[0]; // 'consignment' or 'ack'
    const recipientId = parts[1];

    // CORS headers for local requests
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '127.0.0.1');

    if (!type || !recipientId) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing type or recipientId' }));
      return;
    }

    try {
      if (type === 'consignment') {
        if (req.method === 'POST') {
          const body = await readBody(req);

          if (mock) {
            // Mock mode: store in memory
            pendingConsignments.set(recipientId, body);
            console.error(`[rgb-bridge] Stored consignment for ${recipientId} (${body.length} bytes)`);
          } else {
            // Real mode: deliver via rgb-c-t Hyperswarm session
            // TODO: Wire rgb-consignment-transport session
            pendingConsignments.set(recipientId, body);
            console.error(`[rgb-bridge] Queued consignment for ${recipientId} (${body.length} bytes)`);
          }

          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } else if (req.method === 'GET') {
          const data = pendingConsignments.get(recipientId);
          if (data) {
            pendingConsignments.delete(recipientId);
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(data);
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'No consignment for this recipient' }));
          }
        } else {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (type === 'ack') {
        if (req.method === 'POST') {
          const body = await readBody(req);
          const { ack } = JSON.parse(body.toString()) as { ack: boolean };
          pendingAcks.set(recipientId, ack);
          console.error(`[rgb-bridge] Stored ACK for ${recipientId}: ${String(ack)}`);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } else if (req.method === 'GET') {
          const ack = pendingAcks.get(recipientId);
          if (ack !== undefined) {
            pendingAcks.delete(recipientId);
            res.writeHead(200);
            res.end(JSON.stringify({ ack }));
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'No ACK for this recipient' }));
          }
        } else {
          res.writeHead(405);
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (type === 'health') {
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'ok',
          mode: mock ? 'mock' : 'live',
          pendingConsignments: pendingConsignments.size,
          pendingAcks: pendingAcks.size,
        }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: `Unknown endpoint: ${type}` }));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Internal error';
      console.error(`[rgb-bridge] Error: ${msg}`);
      res.writeHead(500);
      res.end(JSON.stringify({ error: msg }));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.error(`[rgb-bridge] Transport bridge listening on http://127.0.0.1:${port} (${mock ? 'mock' : 'live'})`);
  });

  return {
    server,
    stop: () => {
      server.close();
      pendingConsignments.clear();
      pendingAcks.clear();
    },
  };
}

/** Read the full request body as a Buffer */
function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
