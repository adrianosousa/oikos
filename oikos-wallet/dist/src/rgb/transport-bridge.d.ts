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
import { type Server } from 'http';
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
export declare function startTransportBridge(port: number, options?: {
    mock?: boolean;
}): {
    server: Server;
    stop: () => void;
};
//# sourceMappingURL=transport-bridge.d.ts.map