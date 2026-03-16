/**
 * Oikos REST Client — connects to oikos-wallet via HTTP.
 *
 * This is how any external agent talks to Oikos.
 * No workspace dependencies — just plain HTTP fetch.
 */

export interface OikosClientConfig {
  /** Base URL of the oikos-wallet dashboard (default: http://127.0.0.1:3420) */
  baseUrl: string;
}

export interface BalanceResponse {
  symbol: string;
  chain: string;
  balance: string;
  formatted: string;
}

export interface PolicyStatus {
  name: string;
  state: { sessionTotals: Record<string, string> };
}

export interface ExecutionResult {
  status: 'executed' | 'rejected' | 'failed' | 'simulated';
  txHash?: string;
  violations: string[];
  error?: string;
}

export interface StreamEvent {
  id: string;
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
}

export interface HealthResponse {
  status: string;
  wallet: string;
  eventsBuffered: number;
  companionConnected: boolean;
}

export class OikosClient {
  private baseUrl: string;

  constructor(config: OikosClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
  }

  /** Check if oikos-wallet is healthy */
  async health(): Promise<HealthResponse> {
    return this.get<HealthResponse>('/api/health');
  }

  /** Get all balances */
  async getBalances(): Promise<BalanceResponse[]> {
    const res = await this.get<{ balances: BalanceResponse[] }>('/api/balance');
    return res.balances;
  }

  /** Get policy status */
  async getPolicies(): Promise<PolicyStatus[]> {
    const res = await this.get<{ policies: PolicyStatus[] }>('/api/policy');
    return res.policies;
  }

  /** Get recent events */
  async getEvents(limit = 50): Promise<StreamEvent[]> {
    const res = await this.get<{ events: StreamEvent[] }>(`/api/events?limit=${limit}`);
    return res.events;
  }

  /** Get companion instructions */
  async getInstructions(): Promise<Array<{ text: string; timestamp: number }>> {
    const res = await this.get<{ instructions: Array<{ text: string; timestamp: number }> }>('/api/companion/instructions');
    return res.instructions;
  }

  /** Propose a payment via MCP */
  async proposePayment(params: {
    to: string;
    amount: string;
    symbol: string;
    chain?: string;
    reason: string;
    confidence: number;
  }): Promise<ExecutionResult> {
    return this.callMCPTool('propose_payment', params);
  }

  /** Propose a swap via MCP */
  async proposeSwap(params: {
    amount: string;
    symbol: string;
    toSymbol: string;
    chain?: string;
    reason: string;
    confidence: number;
  }): Promise<ExecutionResult> {
    return this.callMCPTool('propose_swap', params);
  }

  /** Propose a bridge via MCP */
  async proposeBridge(params: {
    amount: string;
    symbol: string;
    fromChain: string;
    toChain: string;
    reason: string;
    confidence: number;
  }): Promise<ExecutionResult> {
    return this.callMCPTool('propose_bridge', params);
  }

  /** Propose a yield operation via MCP */
  async proposeYield(params: {
    amount: string;
    symbol: string;
    protocol: string;
    action: 'deposit' | 'withdraw';
    chain?: string;
    reason: string;
    confidence: number;
  }): Promise<ExecutionResult> {
    return this.callMCPTool('propose_yield', params);
  }

  /** Simulate a proposal (dry-run) via MCP */
  async simulate(params: {
    type: 'payment' | 'swap' | 'bridge' | 'yield';
    amount: string;
    symbol: string;
    chain?: string;
    reason?: string;
    to?: string;
    toSymbol?: string;
    fromChain?: string;
    toChain?: string;
    protocol?: string;
    action?: string;
  }): Promise<unknown> {
    return this.callMCPTool('simulate_proposal', params);
  }

  // ── Internal ──

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new Error(`Oikos API error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  private async callMCPTool(tool: string, params: Record<string, unknown>): Promise<ExecutionResult> {
    const res = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: tool, arguments: params },
      }),
    });

    if (!res.ok) {
      throw new Error(`Oikos MCP error: ${res.status} ${res.statusText}`);
    }

    const body = await res.json() as { result?: { content?: Array<{ text?: string }> }; error?: { message: string } };
    if (body.error) {
      throw new Error(`MCP error: ${body.error.message}`);
    }

    const text = body.result?.content?.[0]?.text ?? '{}';
    return JSON.parse(text) as ExecutionResult;
  }
}
