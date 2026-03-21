/**
 * IPC Client — Gateway's interface to the Wallet Isolate.
 *
 * Spawns the wallet-isolate as a child process (via Bare Runtime)
 * and communicates over stdin/stdout JSON-lines.
 *
 * @security The Gateway NEVER sees seed phrases. It sends structured
 * requests and receives structured responses. Period.
 */

import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import type {
  IPCRequest,
  IPCResponse,
  PaymentProposal,
  SwapProposal,
  BridgeProposal,
  YieldProposal,
  FeedbackProposal,
  RGBIssueProposal,
  RGBTransferProposal,
  RGBAssetInfo,
  ProposalCommon,
  ProposalSource,
  BalanceQuery,
  AddressQuery,
  AuditQuery,
  ExecutionResult,
  BalanceResponse,
  AddressResponse,
  PolicyStatus,
  PolicyCheckResult,
  IdentityRegisterRequest,
  IdentitySetWalletRequest,
  ReputationQuery,
  IdentityResult,
  ReputationResult,
} from './types.js';

/** Pending request waiting for a response */
interface PendingRequest {
  resolve: (response: IPCResponse) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Spawns and manages IPC communication with the wallet-isolate process.
 */
export class WalletIPCClient {
  private child: ChildProcess | null = null;
  private pending: Map<string, PendingRequest> = new Map();
  private buffer = '';
  private running = false;

  /** Timeout for IPC requests in ms */
  private readonly requestTimeoutMs = 30_000;

  /** Event listeners for connection state */
  private onDisconnectHandler: ((error?: string) => void) | null = null;

  /**
   * Spawn the wallet-isolate process.
   *
   * @param entryPath Path to the wallet-isolate dist/src/main.js
   * @param runtime 'bare' for Bare Runtime, 'node' for Node.js (testing)
   * @param env Environment variables to pass to the child process
   */
  start(entryPath: string, runtime: 'bare' | 'node', env: Record<string, string>): void {
    if (this.running) {
      throw new Error('WalletIPCClient already running');
    }

    const command = runtime === 'bare' ? 'bare' : 'node';

    this.child = spawn(command, [entryPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });

    this.running = true;

    // Read stdout (IPC responses)
    this.child.stdout?.setEncoding('utf-8');
    this.child.stdout?.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.processBuffer();
    });

    // Read stderr (wallet-isolate logs)
    this.child.stderr?.setEncoding('utf-8');
    this.child.stderr?.on('data', (chunk: string) => {
      for (const line of chunk.split('\n')) {
        if (line.trim()) {
          console.error(`[wallet] ${line}`);
        }
      }
    });

    // Handle process exit
    this.child.on('exit', (code, signal) => {
      this.running = false;
      const reason = signal ? `signal ${signal}` : `code ${String(code)}`;
      console.error(`[gateway] Wallet isolate exited: ${reason}`);

      for (const [id, request] of this.pending) {
        clearTimeout(request.timeout);
        request.reject(new Error(`Wallet isolate exited: ${reason}`));
        this.pending.delete(id);
      }

      if (this.onDisconnectHandler) {
        this.onDisconnectHandler(reason);
      }
    });

    this.child.on('error', (err) => {
      console.error(`[gateway] Wallet isolate spawn error: ${err.message}`);
      this.running = false;
    });
  }

  /** Register a disconnect handler */
  onDisconnect(handler: (error?: string) => void): void {
    this.onDisconnectHandler = handler;
  }

  /** Check if the wallet process is running */
  isRunning(): boolean {
    return this.running;
  }

  /** Stop the wallet process */
  stop(): void {
    if (this.child) {
      this.child.stdin?.end();
      this.child.kill('SIGTERM');
      this.child = null;
      this.running = false;
    }
  }

  // ── Proposal API ──

  /** Propose a payment to the wallet for policy evaluation and execution */
  async proposePayment(proposal: PaymentProposal, source?: ProposalSource): Promise<ExecutionResult> {
    const response = await this.send('propose_payment', proposal, source);
    return response.payload as ExecutionResult;
  }

  /** Propose a token swap (e.g., USDT → XAUT) */
  async proposeSwap(proposal: SwapProposal, source?: ProposalSource): Promise<ExecutionResult> {
    const response = await this.send('propose_swap', proposal, source);
    return response.payload as ExecutionResult;
  }

  /** Propose a cross-chain bridge (e.g., Ethereum → Arbitrum) */
  async proposeBridge(proposal: BridgeProposal, source?: ProposalSource): Promise<ExecutionResult> {
    const response = await this.send('propose_bridge', proposal, source);
    return response.payload as ExecutionResult;
  }

  /** Propose a yield deposit or withdrawal */
  async proposeYield(proposal: YieldProposal, source?: ProposalSource): Promise<ExecutionResult> {
    const response = await this.send('propose_yield', proposal, source);
    return response.payload as ExecutionResult;
  }

  /**
   * Universal entry point for external proposal sources.
   * Routes to the appropriate propose method with source attribution.
   * Used by x402 client, companion channel, and swarm negotiation.
   */
  async proposalFromExternal(
    source: ProposalSource,
    type: 'payment' | 'swap' | 'bridge' | 'yield' | 'feedback',
    proposal: ProposalCommon
  ): Promise<ExecutionResult> {
    switch (type) {
      case 'payment':
        return this.proposePayment(proposal as PaymentProposal, source);
      case 'swap':
        return this.proposeSwap(proposal as SwapProposal, source);
      case 'bridge':
        return this.proposeBridge(proposal as BridgeProposal, source);
      case 'yield':
        return this.proposeYield(proposal as YieldProposal, source);
      case 'feedback':
        return this.proposeFeedback(proposal as FeedbackProposal, source);
    }
  }

  // ── Query API ──

  /** Query balance for a specific chain and token */
  async queryBalance(chain: string, symbol: string): Promise<BalanceResponse> {
    const query: BalanceQuery = { chain: chain as BalanceQuery['chain'], symbol: symbol as BalanceQuery['symbol'] };
    const response = await this.send('query_balance', query);
    return response.payload as BalanceResponse;
  }

  /** Query all balances across all chains and assets */
  async queryBalanceAll(): Promise<BalanceResponse[]> {
    const response = await this.send('query_balance_all', {});
    return response.payload as BalanceResponse[];
  }

  /** Query wallet address for a specific chain */
  async queryAddress(chain: string): Promise<AddressResponse> {
    const query: AddressQuery = { chain: chain as AddressQuery['chain'] };
    const response = await this.send('query_address', query);
    return response.payload as AddressResponse;
  }

  /** Query current policy status */
  async queryPolicy(): Promise<PolicyStatus[]> {
    const response = await this.send('query_policy', {});
    const payload = response.payload as { policies: PolicyStatus[] };
    return payload.policies;
  }

  /** Query audit log entries */
  async queryAudit(limit?: number, since?: string): Promise<unknown[]> {
    const query: AuditQuery = { limit, since };
    const response = await this.send('query_audit', query);
    const payload = response.payload as { entries: unknown[] };
    return payload.entries;
  }

  // ── ERC-8004 Identity & Reputation ──

  /** Register an on-chain ERC-8004 identity (mints ERC-721 NFT). */
  async registerIdentity(agentURI: string, chain = 'ethereum' as const): Promise<IdentityResult> {
    const payload: IdentityRegisterRequest = { agentURI, chain };
    const response = await this.send('identity_register', payload);
    return response.payload as IdentityResult;
  }

  /** Set the agent's wallet address on the IdentityRegistry (EIP-712 signed). */
  async setAgentWallet(agentId: string, deadline: number, chain = 'ethereum' as const): Promise<IdentityResult> {
    const payload: IdentitySetWalletRequest = { agentId, deadline, chain };
    const response = await this.send('identity_set_wallet', payload);
    return response.payload as IdentityResult;
  }

  /** Submit on-chain reputation feedback for a peer agent. */
  async proposeFeedback(proposal: FeedbackProposal, source?: ProposalSource): Promise<ExecutionResult> {
    const response = await this.send('propose_feedback', proposal, source);
    return response.payload as ExecutionResult;
  }

  /** Query on-chain reputation from ERC-8004 ReputationRegistry. */
  async queryReputation(agentId: string, chain = 'ethereum' as const): Promise<ReputationResult> {
    const payload: ReputationQuery = { agentId, chain };
    const response = await this.send('query_reputation', payload);
    return response.payload as ReputationResult;
  }

  // ── Dry-Run Policy Check ──

  /** Simulate a proposal against the policy engine without executing or burning cooldown. */
  async simulateProposal(proposal: ProposalCommon): Promise<PolicyCheckResult> {
    const response = await this.send('query_policy_check', proposal);
    return response.payload as PolicyCheckResult;
  }

  // ── RGB Asset Operations ──

  /** Propose issuing a new RGB asset. */
  async proposeRGBIssue(proposal: RGBIssueProposal, source?: ProposalSource): Promise<ExecutionResult> {
    const response = await this.send('propose_rgb_issue', proposal, source);
    return response.payload as ExecutionResult;
  }

  /** Propose transferring an RGB asset via invoice. */
  async proposeRGBTransfer(proposal: RGBTransferProposal, source?: ProposalSource): Promise<ExecutionResult> {
    const response = await this.send('propose_rgb_transfer', proposal, source);
    return response.payload as ExecutionResult;
  }

  /** Query all RGB assets with balances. */
  async queryRGBAssets(): Promise<RGBAssetInfo[]> {
    const response = await this.send('query_rgb_assets', {});
    return response.payload as RGBAssetInfo[];
  }

  // ── Spark / Lightning ──

  /** Query Spark wallet balance in satoshis. */
  async querySparkBalance(): Promise<{ chain: string; symbol: string; balanceSats: number; formatted: string }> {
    try {
      // Route through standard query_balance with chain='spark'
      const response = await this.send('query_balance', { chain: 'spark', symbol: 'BTC' } as unknown as IPCRequest['payload']);
      const p = response.payload as unknown as { chain: string; symbol: string; balance: string; formatted: string };
      return { chain: 'spark', symbol: 'BTC', balanceSats: Number(p.balance || 0), formatted: p.formatted || '0' };
    } catch {
      return { chain: 'spark', symbol: 'BTC', balanceSats: 0, formatted: '0.00000000' };
    }
  }

  /** Query Spark address — routes through standard query_address with chain='spark'. */
  async querySparkAddress(type = 'static'): Promise<{ chain: string; address: string; type: string }> {
    try {
      if (type === 'deposit') {
        // Use dedicated spark_deposit_address for L1 deposit address
        const response = await this.send('spark_deposit_address' as IPCRequest['type'], {} as unknown as IPCRequest['payload']);
        const p = response.payload as unknown as { address: string };
        return { chain: 'spark', address: p.address, type: 'deposit' };
      }
      // Standard Spark address
      const response = await this.send('query_address', { chain: 'spark' } as unknown as IPCRequest['payload']);
      const p = response.payload as unknown as { chain: string; address: string };
      return { chain: 'spark', address: p.address, type };
    } catch {
      return { chain: 'spark', address: 'spark-not-available', type };
    }
  }

  /** Propose sending sats via Spark. Routes through standard propose_payment with chain='spark'. */
  async proposeSparkSend(proposal: Record<string, unknown>, source?: ProposalSource): Promise<ExecutionResult> {
    try {
      // Route through standard propose_payment — PolicyEngine evaluates the same way
      const response = await this.send('propose_payment', proposal as unknown as IPCRequest['payload'], source);
      return response.payload as ExecutionResult;
    } catch (err) {
      return { status: 'failed', proposalType: 'payment', proposal: proposal as unknown as ProposalCommon, error: err instanceof Error ? err.message : 'Spark send failed', violations: [], timestamp: Date.now() } as unknown as ExecutionResult;
    }
  }

  /** Create a Lightning invoice for receiving — uses dedicated IPC message. */
  async querySparkCreateInvoice(amountSats?: number, memo?: string): Promise<{ invoice: string; id: string; amountSats: number; memo?: string }> {
    try {
      const response = await this.send('spark_create_invoice' as IPCRequest['type'], { amountSats, memo } as unknown as IPCRequest['payload']);
      const p = response.payload as unknown as Record<string, unknown>;
      // Normalize: Lightning invoice may be nested
      let invoice = '';
      if (typeof p.invoice === 'string') invoice = p.invoice;
      else if (p.invoice && typeof (p.invoice as Record<string, unknown>).encodedInvoice === 'string') invoice = (p.invoice as Record<string, unknown>).encodedInvoice as string;
      return { invoice, id: String(p.id || ''), amountSats: Number(p.amountSats || amountSats || 0), memo };
    } catch {
      return { invoice: '', id: '', amountSats: amountSats || 0, memo };
    }
  }

  /** Pay a Lightning invoice via Spark — uses dedicated IPC message. */
  async proposeSparkPayInvoice(proposal: Record<string, unknown>, _source?: ProposalSource): Promise<ExecutionResult> {
    try {
      const response = await this.send('spark_pay_invoice' as IPCRequest['type'], {
        encodedInvoice: proposal.invoice as string,
        maxFeeSats: (proposal.maxFeeSats as number) || 100,
      } as unknown as IPCRequest['payload']);
      const p = response.payload as unknown as { success: boolean; txHash?: string; error?: string };
      return {
        status: p.success ? 'executed' : 'failed',
        proposalType: 'spark_pay_invoice',
        proposal: proposal as unknown as ProposalCommon,
        txHash: p.txHash,
        error: p.error,
        violations: [],
        timestamp: Date.now(),
      } as unknown as ExecutionResult;
    } catch (err) {
      return { status: 'failed', proposalType: 'spark_pay_invoice', proposal: proposal as unknown as ProposalCommon, error: err instanceof Error ? err.message : 'Lightning payment failed', violations: [], timestamp: Date.now() } as unknown as ExecutionResult;
    }
  }

  /** Query Spark transfer history. */
  async querySparkTransfers(direction?: 'incoming' | 'outgoing' | 'all', limit?: number): Promise<unknown[]> {
    try {
      const response = await this.send('spark_get_transfers' as IPCRequest['type'], { direction, limit } as unknown as IPCRequest['payload']);
      const p = response.payload as unknown as { transfers: unknown[] };
      return p.transfers || [];
    } catch {
      return [];
    }
  }

  // ── x402 EIP-712 Signing (IPC-bridged) ──

  /**
   * Sign EIP-712 typed data for x402 (transferWithAuthorization).
   * Policy-enforced: the Wallet Isolate evaluates the payment amount before signing.
   */
  async x402Sign(request: {
    domain: Record<string, unknown>;
    types: Record<string, Array<{ name: string; type: string }>>;
    message: Record<string, unknown>;
    policyAmount: string;
    policyRecipient: string;
    policyChain: string;
    policySymbol: string;
  }): Promise<{ signature: string; approved: boolean; error?: string }> {
    try {
      const response = await this.send('x402_sign' as IPCRequest['type'], request as unknown as IPCRequest['payload'], 'x402');
      const p = response.payload as unknown as { signature: string; approved: boolean; error?: string };
      return p;
    } catch (err) {
      return { signature: '', approved: false, error: err instanceof Error ? err.message : 'x402 sign failed' };
    }
  }

  /** Get the EVM wallet address for x402 client identity */
  async x402GetAddress(): Promise<string> {
    try {
      const response = await this.send('x402_get_address' as IPCRequest['type'], {} as unknown as IPCRequest['payload']);
      const p = response.payload as unknown as { address: string };
      return p.address;
    } catch {
      return '';
    }
  }

  // ── Internal ──

  private send(type: IPCRequest['type'], payload: IPCRequest['payload'], source?: ProposalSource): Promise<IPCResponse> {
    return new Promise<IPCResponse>((resolve, reject) => {
      if (!this.running || !this.child?.stdin) {
        reject(new Error('Wallet isolate not running'));
        return;
      }

      const id = randomUUID();
      const request: IPCRequest = { id, type, payload };
      if (source) {
        request.source = source;
      }

      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`IPC request ${id} timed out after ${this.requestTimeoutMs}ms`));
      }, this.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timeout });

      const line = JSON.stringify(request) + '\n';
      this.child.stdin.write(line);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response = JSON.parse(line) as IPCResponse;
        const pending = this.pending.get(response.id);

        if (pending) {
          clearTimeout(pending.timeout);
          this.pending.delete(response.id);
          pending.resolve(response);
        } else {
          console.error(`[gateway] Received response for unknown request: ${response.id}`);
        }
      } catch {
        console.error(`[gateway] Failed to parse wallet response: ${line.slice(0, 200)}`);
      }
    }
  }
}
