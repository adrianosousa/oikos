/**
 * Wallet Isolate — Entry Point
 *
 * Boots the isolated wallet process:
 * 1. Load policy config (immutable)
 * 2. Initialize WDK with seed
 * 3. Start IPC listener on stdin
 * 4. Process requests, write responses to stdout
 *
 * This process runs on Bare Runtime. It has:
 * - Access to blockchain RPC nodes
 * - Access to private keys (via WDK)
 * - NO internet access beyond chain nodes
 * - NO LLM access
 * - NO way to modify its own policies
 *
 * @security The seed phrase is read from env ONCE at startup
 * and passed to WalletManager. It is never stored, logged, or
 * transmitted after that point.
 */

import { IPCListener } from './ipc/listener.js';
import { IPCResponder } from './ipc/responder.js';
import type {
  IPCRequest,
  IPCResponse,
  ProposalCommon,
  BalanceQuery,
  AddressQuery,
  AuditQuery,
} from './ipc/types.js';
import { PolicyEngine } from './policies/engine.js';
import type { PolicyConfig } from './policies/types.js';
import { ProposalExecutor } from './executor/executor.js';
import { AuditLog } from './audit/log.js';
import { WalletManager, MockWalletManager } from './wallet/manager.js';
import type { WalletOperations } from './wallet/types.js';
import { TESTNET_CHAINS } from './wallet/chains.js';
import { DEMO } from './policies/presets.js';
import { readFileSync, appendFileSync } from './compat/fs.js';
import { proc } from './compat/process.js';

// ── Configuration ──

function getEnv(key: string, fallback?: string): string {
  const value = proc.env[key];
  if (value !== undefined && value !== '') return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

function loadPolicies(): PolicyConfig {
  const policyFile = getEnv('POLICY_FILE', '');
  if (policyFile === '') {
    // Default to demo preset
    return DEMO;
  }

  try {
    const raw = readFileSync(policyFile, 'utf-8');
    return JSON.parse(raw) as PolicyConfig;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[wallet-isolate] Failed to load policies from ${policyFile}: ${msg}`);
    console.error('[wallet-isolate] Falling back to DEMO preset');
    return DEMO;
  }
}

// ── Audit log file writer ──

function createAuditAppender(): (line: string) => void {
  const auditPath = getEnv('AUDIT_LOG_PATH', 'audit.jsonl');
  return (line: string) => {
    try {
      appendFileSync(auditPath, line + '\n');
    } catch {
      // If we can't write audit, log to stderr but don't crash
      console.error(`[wallet-isolate] AUDIT WRITE FAILED: ${line}`);
    }
  };
}

// ── Proposal type mapping (IPC request type → executor proposal type) ──

const PROPOSAL_TYPE_MAP: Record<string, string> = {
  'propose_payment': 'payment',
  'propose_swap': 'swap',
  'propose_bridge': 'bridge',
  'propose_yield': 'yield',
};

// ── Request Handler ──

async function handleRequest(
  request: IPCRequest,
  executor: ProposalExecutor,
  wallet: WalletOperations,
  policy: PolicyEngine,
  audit: AuditLog,
  responder: IPCResponder
): Promise<void> {
  let response: IPCResponse;

  try {
    // Check if this is a proposal type
    const proposalType = PROPOSAL_TYPE_MAP[request.type];

    if (proposalType !== undefined) {
      // All proposal types go through the executor
      const result = await executor.execute(
        proposalType,
        request.payload as ProposalCommon,
        request.source
      );
      response = { id: request.id, type: 'execution_result', payload: result };
    } else {
      // Query types
      switch (request.type) {
        case 'query_balance': {
          const query = request.payload as BalanceQuery;
          const balance = await wallet.getBalance(query.chain, query.symbol);
          response = {
            id: request.id,
            type: 'balance',
            payload: {
              chain: balance.chain,
              symbol: balance.symbol,
              balance: balance.raw.toString(),
              formatted: balance.formatted
            }
          };
          break;
        }

        case 'query_balance_all': {
          const balances = await wallet.getBalances();
          const payload = balances.map(b => ({
            chain: b.chain,
            symbol: b.symbol,
            balance: b.raw.toString(),
            formatted: b.formatted
          }));
          response = {
            id: request.id,
            type: 'balance_all',
            payload
          };
          break;
        }

        case 'query_address': {
          const query = request.payload as AddressQuery;
          const address = await wallet.getAddress(query.chain);
          response = {
            id: request.id,
            type: 'address',
            payload: { chain: query.chain, address }
          };
          break;
        }

        case 'query_policy': {
          response = {
            id: request.id,
            type: 'policy_status',
            payload: { policies: policy.getStatus() }
          };
          break;
        }

        case 'query_audit': {
          const query = request.payload as AuditQuery;
          const entries = audit.getEntries(query.limit, query.since);
          response = {
            id: request.id,
            type: 'audit_entries',
            payload: { entries }
          };
          break;
        }

        default: {
          response = {
            id: request.id,
            type: 'error',
            payload: { message: `Unknown request type` }
          };
        }
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    response = {
      id: request.id,
      type: 'error',
      payload: { message }
    };
  }

  responder.send(response);
}

// ── Boot ──

async function main(): Promise<void> {
  console.error('[wallet-isolate] Starting...');

  // 1. Load policies (immutable)
  const policyConfig = loadPolicies();
  const policy = new PolicyEngine(policyConfig);
  console.error(`[wallet-isolate] Loaded ${policyConfig.policies.length} policy(ies)`);

  // 2. Initialize audit log
  const auditAppend = createAuditAppender();
  const audit = new AuditLog(auditAppend);

  // 3. Initialize wallet
  const useMock = getEnv('MOCK_WALLET', 'true') === 'true';
  let wallet: WalletOperations;

  if (useMock) {
    console.error('[wallet-isolate] Using MOCK wallet (no real blockchain)');
    wallet = new MockWalletManager();
    await wallet.initialize('mock-seed-not-real', TESTNET_CHAINS);
  } else {
    console.error('[wallet-isolate] Initializing REAL WDK wallet');
    const seed = getEnv('WALLET_SEED');
    wallet = new WalletManager();
    await wallet.initialize(seed, TESTNET_CHAINS);
  }

  // 4. Create executor (the single code path that moves funds)
  const executor = new ProposalExecutor(policy, wallet, audit);

  // 5. Set up IPC
  const responder = new IPCResponder((data: string) => {
    proc.stdout.write(data);
  });

  const listener = new IPCListener(
    (request: IPCRequest) => {
      void handleRequest(request, executor, wallet, policy, audit, responder);
    },
    (line: string, error: string) => {
      audit.logMalformedMessage(line, error);
    }
  );

  // 6. Read stdin
  proc.stdin.setEncoding('utf-8');
  proc.stdin.on('data', (chunk: string) => {
    listener.feed(chunk);
  });

  proc.stdin.on('end', () => {
    console.error('[wallet-isolate] stdin closed, shutting down');
    proc.exit(0);
  });

  // 7. Graceful shutdown
  const shutdown = (): void => {
    console.error('[wallet-isolate] Shutting down...');
    proc.exit(0);
  };

  proc.on('SIGTERM', shutdown);
  proc.on('SIGINT', shutdown);

  console.error('[wallet-isolate] Ready. Listening for IPC messages on stdin.');
}

main().catch((err: unknown) => {
  console.error('[wallet-isolate] FATAL:', err);
  proc.exit(1);
});
