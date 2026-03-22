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
  IdentityRegisterRequest,
  IdentitySetWalletRequest,
  ReputationQuery,
  FeedbackReadQuery,
  ClientsQuery,
  AppendResponseRequest,
  SetMetadataRequest,
  SparkInvoiceRequest,
  SparkPayInvoiceRequest,
  X402SignRequest,
} from './ipc/types.js';

/** BigInt-safe JSON serializer — WDK Spark returns BigInt values that break JSON.stringify */
function jsonSafe(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) return obj.map(jsonSafe);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = jsonSafe(value);
    }
    return result;
  }
  return obj;
}
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
import { resolveSeed } from './secret/manager.js';

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
  'propose_feedback': 'feedback',
  'propose_rgb_issue': 'rgb_issue',
  'propose_rgb_transfer': 'rgb_transfer',
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

        // ── ERC-8004 Identity & Reputation (bypass PolicyEngine) ──

        case 'identity_register': {
          const req = request.payload as IdentityRegisterRequest;
          const result = await wallet.registerIdentity(req.chain, req.agentURI);
          audit.logIdentityOperation('identity_register', result);
          response = {
            id: request.id,
            type: 'identity_result',
            payload: { status: result.success ? 'registered' : 'failed', agentId: result.agentId, txHash: result.txHash, error: result.error }
          };
          break;
        }

        case 'identity_set_wallet': {
          const req = request.payload as IdentitySetWalletRequest;
          const result = await wallet.setAgentWallet(req.chain, req.agentId, req.deadline);
          audit.logIdentityOperation('identity_set_wallet', result);
          response = {
            id: request.id,
            type: 'identity_result',
            payload: { status: result.success ? 'wallet_set' : 'failed', txHash: result.txHash, error: result.error }
          };
          break;
        }

        case 'query_reputation': {
          const req = request.payload as ReputationQuery;
          const rep = await wallet.getOnChainReputation(req.chain, req.agentId, {
            clients: req.clientAddresses,
            tag1: req.tag1,
            tag2: req.tag2,
          });
          response = {
            id: request.id,
            type: 'reputation_result',
            payload: { agentId: req.agentId, feedbackCount: rep.feedbackCount, totalValue: rep.totalValue, valueDecimals: rep.valueDecimals }
          };
          break;
        }

        case 'query_feedback': {
          const req = request.payload as FeedbackReadQuery;
          const fb = await wallet.readFeedback(req.chain, req.agentId, req.clientAddress, req.feedbackIndex);
          response = {
            id: request.id,
            type: 'feedback_read',
            payload: { agentId: req.agentId, clientAddress: req.clientAddress, feedbackIndex: req.feedbackIndex, ...fb },
          };
          break;
        }

        case 'query_clients': {
          const req = request.payload as ClientsQuery;
          const clients = await wallet.getClients(req.chain, req.agentId);
          response = {
            id: request.id,
            type: 'clients_result',
            payload: { agentId: req.agentId, clients },
          };
          break;
        }

        case 'identity_append_response': {
          const req = request.payload as AppendResponseRequest;
          const result = await wallet.appendResponse(req.chain, req.agentId, req.clientAddress, req.feedbackIndex, req.responseURI, req.responseHash);
          audit.logIdentityOperation('identity_append_response', result);
          response = {
            id: request.id,
            type: 'identity_result',
            payload: { status: result.success ? 'registered' : 'failed', txHash: result.txHash, error: result.error },
          };
          break;
        }

        case 'identity_set_metadata': {
          const req = request.payload as SetMetadataRequest;
          const result = await wallet.setIdentityMetadata(req.chain, req.agentId, req.key, req.valueHex);
          audit.logIdentityOperation('identity_set_metadata', result);
          response = {
            id: request.id,
            type: 'identity_result',
            payload: { status: result.success ? 'registered' : 'failed', txHash: result.txHash, error: result.error },
          };
          break;
        }

        // ── Dry-Run Policy Check (no execution, no audit, no cooldown burn) ──

        case 'query_policy_check': {
          const proposal = request.payload as ProposalCommon;
          const check = policy.evaluate(proposal);
          // Do NOT call policy.recordExecution() — this is a dry run
          response = {
            id: request.id,
            type: 'policy_check',
            payload: {
              wouldApprove: check.approved,
              violations: check.violations,
              policyId: check.policyId,
            },
          };
          break;
        }

        // ── RGB Asset Queries ──

        case 'query_rgb_assets': {
          const assets = await wallet.rgbListAssets();
          response = {
            id: request.id,
            type: 'rgb_assets',
            payload: assets,
          };
          break;
        }

        // ── Spark/Lightning Operations ──

        case 'spark_create_invoice': {
          const req = request.payload as SparkInvoiceRequest;
          const mgr = wallet as WalletManager;
          if (typeof mgr.sparkCreateInvoice !== 'function') {
            response = { id: request.id, type: 'error', payload: { message: 'Spark wallet not available' } };
            break;
          }
          const invoice = await mgr.sparkCreateInvoice(req.amountSats, req.memo);
          response = {
            id: request.id,
            type: 'spark_invoice',
            payload: jsonSafe(invoice) as Record<string, unknown>,
          };
          break;
        }

        case 'spark_pay_invoice': {
          const req = request.payload as SparkPayInvoiceRequest;
          const mgr = wallet as WalletManager;
          if (typeof mgr.sparkPayInvoice !== 'function') {
            response = { id: request.id, type: 'error', payload: { message: 'Spark wallet not available' } };
            break;
          }
          const result = await mgr.sparkPayInvoice(req.encodedInvoice, req.maxFeeSats);
          response = {
            id: request.id,
            type: 'spark_pay_result',
            payload: jsonSafe(result) as Record<string, unknown>,
          };
          break;
        }

        case 'spark_deposit_address': {
          const mgr = wallet as WalletManager;
          if (typeof mgr.sparkGetDepositAddress !== 'function') {
            response = { id: request.id, type: 'error', payload: { message: 'Spark wallet not available' } };
            break;
          }
          const addr = await mgr.sparkGetDepositAddress();
          response = {
            id: request.id,
            type: 'spark_deposit',
            payload: { address: typeof addr === 'string' ? addr : String(addr) },
          };
          break;
        }

        case 'spark_get_transfers': {
          const mgr = wallet as WalletManager;
          if (typeof mgr.sparkGetTransfers !== 'function') {
            response = { id: request.id, type: 'error', payload: { message: 'Spark wallet not available' } };
            break;
          }
          const dir = (request.payload as Record<string, unknown>)?.direction as string | undefined;
          const lim = (request.payload as Record<string, unknown>)?.limit as number | undefined;
          const transfers = await mgr.sparkGetTransfers(
            dir as 'incoming' | 'outgoing' | 'all' | undefined,
            lim
          );
          response = {
            id: request.id,
            type: 'spark_transfers',
            payload: { transfers },
          };
          break;
        }

        // ── x402 EIP-712 Signing (policy-enforced) ──

        case 'x402_sign': {
          const req = request.payload as X402SignRequest;

          // Policy check: treat x402 signing as a payment proposal
          const fakeProposal: ProposalCommon = {
            amount: req.policyAmount,
            symbol: req.policySymbol,
            chain: req.policyChain,
            reason: `x402 EIP-3009 authorization to ${req.policyRecipient}`,
            confidence: 0.95,
            strategy: 'x402-auto-pay',
            timestamp: Date.now(),
          };

          const policyResult = policy.evaluate(fakeProposal);
          if (!policyResult.approved) {
            audit.logPolicyEnforcement(fakeProposal, policyResult.violations, 'x402_sign', 'x402');
            response = {
              id: request.id,
              type: 'x402_signature',
              payload: { signature: '', error: `Policy rejected: ${policyResult.violations.join(', ')}`, approved: false },
            };
            break;
          }

          // Sign the typed data with WDK
          const mgr = wallet as WalletManager;
          if (typeof mgr.signTypedData !== 'function') {
            response = { id: request.id, type: 'error', payload: { message: 'EVM typed data signing not available (mock wallet)' } };
            break;
          }

          try {
            const signature = await mgr.signTypedData({
              domain: req.domain,
              types: req.types,
              message: req.message,
            });

            // Record execution in policy state + audit
            policy.recordExecution(fakeProposal);
            audit.logExecutionSuccess(fakeProposal, `sig:${signature.slice(0, 16)}...`, 'x402_sign', 'x402');

            response = {
              id: request.id,
              type: 'x402_signature',
              payload: { signature, approved: true },
            };
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Signing failed';
            audit.logExecutionFailure(fakeProposal, message, 'x402_sign', 'x402');
            response = {
              id: request.id,
              type: 'x402_signature',
              payload: { signature: '', error: message, approved: false },
            };
          }
          break;
        }

        case 'x402_get_address': {
          const address = await wallet.getAddress('ethereum');
          response = {
            id: request.id,
            type: 'x402_address',
            payload: { address },
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

  // 2. Initialize audit log (hydrate from disk to survive restarts)
  const auditPath = getEnv('AUDIT_LOG_PATH', 'audit.jsonl');
  const auditAppend = createAuditAppender();
  const audit = new AuditLog(auditAppend);
  try {
    const existing = readFileSync(auditPath, 'utf-8');
    if (existing) audit.hydrate(existing.split('\n'));
  } catch {
    // No existing file — first run, nothing to hydrate
  }

  // 3. Initialize wallet
  const useMock = getEnv('MOCK_WALLET', 'true') === 'true';
  let wallet: WalletOperations;

  if (useMock) {
    console.error('[wallet-isolate] Using MOCK wallet (no real blockchain)');
    wallet = new MockWalletManager();
    await wallet.initialize('mock-seed-not-real', TESTNET_CHAINS);
  } else {
    console.error('[wallet-isolate] Initializing REAL WDK wallet');

    // Resolve seed: env var > encrypted file > generate new
    const passphrase = getEnv('WALLET_PASSPHRASE', '');
    const seedFilePath = getEnv('WALLET_SEED_FILE', '.oikos-seed.enc.json');
    const existingSeed = proc.env['WALLET_SEED'] ?? '';

    let seed: string;
    if (existingSeed) {
      seed = existingSeed;
      console.error('[wallet-isolate] Using seed from WALLET_SEED env');
    } else if (passphrase) {
      const result = await resolveSeed({ passphrase, seedFilePath });
      seed = result.seedPhrase;
      console.error(`[wallet-isolate] Seed source: ${result.source}`);
    } else {
      throw new Error('REAL wallet requires WALLET_SEED or WALLET_PASSPHRASE');
    }

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

  // 7. Incoming Spark transfer poller
  if (!useMock && typeof (wallet as WalletManager).sparkGetTransfers === 'function') {
    const POLL_INTERVAL_MS = 30_000;
    const seenTransferIds = new Set<string>();
    let initialPollDone = false;

    const pollIncomingTransfers = async (): Promise<void> => {
      try {
        const mgr = wallet as WalletManager;
        const transfers = await mgr.sparkGetTransfers('incoming', 50);
        if (!Array.isArray(transfers)) return;

        for (const t of transfers) {
          const tid = (t as Record<string, unknown>)['id'] as string | undefined;
          if (!tid || seenTransferIds.has(tid)) continue;
          seenTransferIds.add(tid);

          // Skip logging on first poll (seed the set with existing transfers)
          if (!initialPollDone) continue;

          const totalValue = (t as Record<string, unknown>)['totalValue'] as number ?? 0;
          const senderPub = (t as Record<string, unknown>)['senderIdentityPublicKey'] as string | undefined;
          const tType = (t as Record<string, unknown>)['type'] as string | undefined;

          audit.logIncomingTransfer({
            id: tid,
            senderPublicKey: senderPub,
            totalValue,
            transferType: tType,
          });
          console.error(`[wallet-isolate] Incoming Spark transfer: ${totalValue} sats (${tid.slice(0, 8)}...)`);
        }
        initialPollDone = true;
      } catch (err) {
        // Silently continue — polling failure shouldn't crash the isolate
        console.error('[wallet-isolate] Spark poll error:', (err as Error).message);
      }
    };

    // Initial poll to seed known transfers, then start interval
    void pollIncomingTransfers();
    setInterval(() => void pollIncomingTransfers(), POLL_INTERVAL_MS);
    console.error(`[wallet-isolate] Spark incoming transfer poller active (${POLL_INTERVAL_MS / 1000}s interval)`);
  }

  // 8. Graceful shutdown
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
