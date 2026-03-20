/**
 * IPC Client — Gateway's interface to the Wallet Isolate.
 *
 * Spawns the wallet-isolate as a child process (via Bare Runtime)
 * and communicates over stdin/stdout JSON-lines.
 *
 * @security The Gateway NEVER sees seed phrases. It sends structured
 * requests and receives structured responses. Period.
 */
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
/**
 * Spawns and manages IPC communication with the wallet-isolate process.
 */
export class WalletIPCClient {
    child = null;
    pending = new Map();
    buffer = '';
    running = false;
    /** Timeout for IPC requests in ms */
    requestTimeoutMs = 30_000;
    /** Event listeners for connection state */
    onDisconnectHandler = null;
    /**
     * Spawn the wallet-isolate process.
     *
     * @param entryPath Path to the wallet-isolate dist/src/main.js
     * @param runtime 'bare' for Bare Runtime, 'node' for Node.js (testing)
     * @param env Environment variables to pass to the child process
     */
    start(entryPath, runtime, env) {
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
        this.child.stdout?.on('data', (chunk) => {
            this.buffer += chunk;
            this.processBuffer();
        });
        // Read stderr (wallet-isolate logs)
        this.child.stderr?.setEncoding('utf-8');
        this.child.stderr?.on('data', (chunk) => {
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
    onDisconnect(handler) {
        this.onDisconnectHandler = handler;
    }
    /** Check if the wallet process is running */
    isRunning() {
        return this.running;
    }
    /** Stop the wallet process */
    stop() {
        if (this.child) {
            this.child.stdin?.end();
            this.child.kill('SIGTERM');
            this.child = null;
            this.running = false;
        }
    }
    // ── Proposal API ──
    /** Propose a payment to the wallet for policy evaluation and execution */
    async proposePayment(proposal, source) {
        const response = await this.send('propose_payment', proposal, source);
        return response.payload;
    }
    /** Propose a token swap (e.g., USDT → XAUT) */
    async proposeSwap(proposal, source) {
        const response = await this.send('propose_swap', proposal, source);
        return response.payload;
    }
    /** Propose a cross-chain bridge (e.g., Ethereum → Arbitrum) */
    async proposeBridge(proposal, source) {
        const response = await this.send('propose_bridge', proposal, source);
        return response.payload;
    }
    /** Propose a yield deposit or withdrawal */
    async proposeYield(proposal, source) {
        const response = await this.send('propose_yield', proposal, source);
        return response.payload;
    }
    /**
     * Universal entry point for external proposal sources.
     * Routes to the appropriate propose method with source attribution.
     * Used by x402 client, companion channel, and swarm negotiation.
     */
    async proposalFromExternal(source, type, proposal) {
        switch (type) {
            case 'payment':
                return this.proposePayment(proposal, source);
            case 'swap':
                return this.proposeSwap(proposal, source);
            case 'bridge':
                return this.proposeBridge(proposal, source);
            case 'yield':
                return this.proposeYield(proposal, source);
            case 'feedback':
                return this.proposeFeedback(proposal, source);
        }
    }
    // ── Query API ──
    /** Query balance for a specific chain and token */
    async queryBalance(chain, symbol) {
        const query = { chain: chain, symbol: symbol };
        const response = await this.send('query_balance', query);
        return response.payload;
    }
    /** Query all balances across all chains and assets */
    async queryBalanceAll() {
        const response = await this.send('query_balance_all', {});
        return response.payload;
    }
    /** Query wallet address for a specific chain */
    async queryAddress(chain) {
        const query = { chain: chain };
        const response = await this.send('query_address', query);
        return response.payload;
    }
    /** Query current policy status */
    async queryPolicy() {
        const response = await this.send('query_policy', {});
        const payload = response.payload;
        return payload.policies;
    }
    /** Query audit log entries */
    async queryAudit(limit, since) {
        const query = { limit, since };
        const response = await this.send('query_audit', query);
        const payload = response.payload;
        return payload.entries;
    }
    // ── ERC-8004 Identity & Reputation ──
    /** Register an on-chain ERC-8004 identity (mints ERC-721 NFT). */
    async registerIdentity(agentURI, chain = 'ethereum') {
        const payload = { agentURI, chain };
        const response = await this.send('identity_register', payload);
        return response.payload;
    }
    /** Set the agent's wallet address on the IdentityRegistry (EIP-712 signed). */
    async setAgentWallet(agentId, deadline, chain = 'ethereum') {
        const payload = { agentId, deadline, chain };
        const response = await this.send('identity_set_wallet', payload);
        return response.payload;
    }
    /** Submit on-chain reputation feedback for a peer agent. */
    async proposeFeedback(proposal, source) {
        const response = await this.send('propose_feedback', proposal, source);
        return response.payload;
    }
    /** Query on-chain reputation from ERC-8004 ReputationRegistry. */
    async queryReputation(agentId, chain = 'ethereum') {
        const payload = { agentId, chain };
        const response = await this.send('query_reputation', payload);
        return response.payload;
    }
    // ── Dry-Run Policy Check ──
    /** Simulate a proposal against the policy engine without executing or burning cooldown. */
    async simulateProposal(proposal) {
        const response = await this.send('query_policy_check', proposal);
        return response.payload;
    }
    // ── RGB Asset Operations ──
    /** Propose issuing a new RGB asset. */
    async proposeRGBIssue(proposal, source) {
        const response = await this.send('propose_rgb_issue', proposal, source);
        return response.payload;
    }
    /** Propose transferring an RGB asset via invoice. */
    async proposeRGBTransfer(proposal, source) {
        const response = await this.send('propose_rgb_transfer', proposal, source);
        return response.payload;
    }
    /** Query all RGB assets with balances. */
    async queryRGBAssets() {
        const response = await this.send('query_rgb_assets', {});
        return response.payload;
    }
    // ── Spark / Lightning ──
    /** Query Spark wallet balance in satoshis. */
    async querySparkBalance() {
        try {
            // Route through standard query_balance with chain='spark'
            const response = await this.send('query_balance', { chain: 'spark', symbol: 'BTC' });
            const p = response.payload;
            return { chain: 'spark', symbol: 'BTC', balanceSats: Number(p.balance || 0), formatted: p.formatted || '0' };
        }
        catch {
            return { chain: 'spark', symbol: 'BTC', balanceSats: 0, formatted: '0.00000000' };
        }
    }
    /** Query Spark address — routes through standard query_address with chain='spark'. */
    async querySparkAddress(type = 'static') {
        try {
            if (type === 'deposit') {
                // Use dedicated spark_deposit_address for L1 deposit address
                const response = await this.send('spark_deposit_address', {});
                const p = response.payload;
                return { chain: 'spark', address: p.address, type: 'deposit' };
            }
            // Standard Spark address
            const response = await this.send('query_address', { chain: 'spark' });
            const p = response.payload;
            return { chain: 'spark', address: p.address, type };
        }
        catch {
            return { chain: 'spark', address: 'spark-not-available', type };
        }
    }
    /** Propose sending sats via Spark. Routes through standard propose_payment with chain='spark'. */
    async proposeSparkSend(proposal, source) {
        try {
            // Route through standard propose_payment — PolicyEngine evaluates the same way
            const response = await this.send('propose_payment', proposal, source);
            return response.payload;
        }
        catch (err) {
            return { status: 'failed', proposalType: 'payment', proposal: proposal, error: err instanceof Error ? err.message : 'Spark send failed', violations: [], timestamp: Date.now() };
        }
    }
    /** Create a Lightning invoice for receiving — uses dedicated IPC message. */
    async querySparkCreateInvoice(amountSats, memo) {
        try {
            const response = await this.send('spark_create_invoice', { amountSats, memo });
            const p = response.payload;
            // Normalize: Lightning invoice may be nested
            let invoice = '';
            if (typeof p.invoice === 'string')
                invoice = p.invoice;
            else if (p.invoice && typeof p.invoice.encodedInvoice === 'string')
                invoice = p.invoice.encodedInvoice;
            return { invoice, id: String(p.id || ''), amountSats: Number(p.amountSats || amountSats || 0), memo };
        }
        catch {
            return { invoice: '', id: '', amountSats: amountSats || 0, memo };
        }
    }
    /** Pay a Lightning invoice via Spark — uses dedicated IPC message. */
    async proposeSparkPayInvoice(proposal, _source) {
        try {
            const response = await this.send('spark_pay_invoice', {
                encodedInvoice: proposal.invoice,
                maxFeeSats: proposal.maxFeeSats || 100,
            });
            const p = response.payload;
            return {
                status: p.success ? 'executed' : 'failed',
                proposalType: 'spark_pay_invoice',
                proposal: proposal,
                txHash: p.txHash,
                error: p.error,
                violations: [],
                timestamp: Date.now(),
            };
        }
        catch (err) {
            return { status: 'failed', proposalType: 'spark_pay_invoice', proposal: proposal, error: err instanceof Error ? err.message : 'Lightning payment failed', violations: [], timestamp: Date.now() };
        }
    }
    // ── x402 EIP-712 Signing (IPC-bridged) ──
    /**
     * Sign EIP-712 typed data for x402 (transferWithAuthorization).
     * Policy-enforced: the Wallet Isolate evaluates the payment amount before signing.
     */
    async x402Sign(request) {
        try {
            const response = await this.send('x402_sign', request, 'x402');
            const p = response.payload;
            return p;
        }
        catch (err) {
            return { signature: '', approved: false, error: err instanceof Error ? err.message : 'x402 sign failed' };
        }
    }
    /** Get the EVM wallet address for x402 client identity */
    async x402GetAddress() {
        try {
            const response = await this.send('x402_get_address', {});
            const p = response.payload;
            return p.address;
        }
        catch {
            return '';
        }
    }
    // ── Internal ──
    send(type, payload, source) {
        return new Promise((resolve, reject) => {
            if (!this.running || !this.child?.stdin) {
                reject(new Error('Wallet isolate not running'));
                return;
            }
            const id = randomUUID();
            const request = { id, type, payload };
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
    processBuffer() {
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (!line.trim())
                continue;
            try {
                const response = JSON.parse(line);
                const pending = this.pending.get(response.id);
                if (pending) {
                    clearTimeout(pending.timeout);
                    this.pending.delete(response.id);
                    pending.resolve(response);
                }
                else {
                    console.error(`[gateway] Received response for unknown request: ${response.id}`);
                }
            }
            catch {
                console.error(`[gateway] Failed to parse wallet response: ${line.slice(0, 200)}`);
            }
        }
    }
}
//# sourceMappingURL=client.js.map