/**
 * Dashboard Server — monitoring UI + REST API + public board.
 *
 * Serves a static HTML dashboard and REST API for wallet state.
 * Uses OikosServices for direct access to all infrastructure.
 *
 * Bind modes:
 * - DASHBOARD_HOST=127.0.0.1 (default) — localhost only, private dashboard
 * - DASHBOARD_HOST=0.0.0.0 — public access. /board and /api/board are
 *   unauthenticated (public discovery data). All other /api/* endpoints
 *   still require Bearer token when SESSION_TOKEN is set.
 *
 * Auth: Optional Bearer token (SESSION_TOKEN env). If set,
 * all /api/* endpoints require Authorization header
 * (except /api/health and /api/board).
 * Pattern from rgb-wallet-pear.
 *
 * @security All proposals flow through the Wallet Isolate's PolicyEngine.
 */
import type { OikosServices } from '../types.js';
export declare function createDashboard(services: OikosServices, port: number, host?: string): void;
//# sourceMappingURL=server.d.ts.map