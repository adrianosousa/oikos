/**
 * Brain Adapter — Agent-Agnostic Chat Bridge.
 *
 * Oikos defines the contract: send a message, get a reply.
 * Any agent framework implements the adapter:
 *   - OpenClaw → channel plugin behind an HTTP endpoint
 *   - Direct Ollama → local LLM with wallet context
 *   - Claude Code → local HTTP server piping to API
 *   - Custom → anything that speaks { message } → { reply }
 *
 * "Swap the brain, keep the wallet."
 *
 * @security Chat messages stay on loopback (127.0.0.1) or Noise-encrypted P2P.
 * No message content ever leaves the machine unencrypted.
 */
// ── Ollama Adapter (default — sovereign, local) ──
/**
 * Compact system prompt — optimized for 8B models.
 * Every token counts. No markdown headers, no verbose explanations.
 * The Modelfile (oikos-wallet/Modelfile) bakes in the core identity;
 * this prompt covers tools + rules only when using the stock model.
 */
const WALLET_SYSTEM_PROMPT = `You are the Oikos Agent managing a self-custodial crypto wallet.

TO EXECUTE A TOOL, output an ACTION line with valid JSON. The system will parse and execute it automatically.

FORMAT (one action per line, must be valid JSON):
ACTION: {"tool": "TOOL_NAME", "args": {ARGS}}

EXAMPLES:
User: "sell 0.1 XAUT on arbitrum for best offer"
ACTION: {"tool": "swarm_announce", "args": {"category": "seller", "title": "Sell 0.1 XAUT", "description": "Selling 0.1 XAUT on Arbitrum for best offer", "minPrice": "0", "maxPrice": "10000", "symbol": "USDT", "tags": ["XAUT", "Arbitrum"]}}

User: "send 10 USDT to 0xABC on ethereum"
ACTION: {"tool": "propose_payment", "args": {"amount": "10", "symbol": "USDT", "chain": "ethereum", "to": "0xABC", "reason": "user requested", "confidence": 0.9}}

User: "swap 50 USDT to XAUT"
ACTION: {"tool": "propose_swap", "args": {"amount": "50", "symbol": "USDT", "toSymbol": "XAUT", "chain": "ethereum", "reason": "user requested", "confidence": 0.9}}

User: "check balances"
ACTION: {"tool": "wallet_balance_all", "args": {}}

AVAILABLE TOOLS:
Wallet: propose_payment, propose_swap, propose_bridge, propose_yield, wallet_balance_all, wallet_address, policy_status
Swarm: swarm_announce, swarm_remove_announcement(announcementId), swarm_bid, swarm_accept_bid, swarm_submit_payment, swarm_cancel_room, swarm_room_state, swarm_state
Read: audit_log, agent_state

RULES:
- When the user gives a COMMAND (send, swap, sell, buy, bridge, deposit, announce, remove), output an ACTION line immediately.
- When the user asks a QUESTION (what strategy, should I, how, why, explain), ANSWER with advice. Do NOT execute actions unless explicitly told "do it".
- You can include a brief explanation before or after an ACTION line.
- All writes go through PolicyEngine. If rejected, explain the violation.
- Be concise. You manage real value.
- You NEVER have access to seed phrases or private keys.`;
/** Max conversation history turns to include (user+assistant pairs) */
const MAX_HISTORY_TURNS = 8;
export class OllamaBrainAdapter {
    name = 'ollama';
    baseUrl;
    model;
    constructor(baseUrl = 'http://127.0.0.1:11434', model = 'oikos-agent') {
        // Normalize URL: strip /v1 suffix if present (we use native /api/chat endpoint)
        this.baseUrl = baseUrl.replace(/\/v1\/?$/, '');
        this.model = model;
    }
    async chat(message, context, history) {
        const contextBlock = this._buildContext(context);
        const systemPrompt = `${WALLET_SYSTEM_PROMPT}\n\nSTATE:\n${contextBlock}`;
        // Build message array: system + recent history + current user message.
        // History gives the model conversational memory across turns.
        const messages = [
            { role: 'system', content: systemPrompt },
        ];
        // Inject recent conversation history (last N turns).
        // Each turn = one human msg + one agent msg. Trim to save context.
        if (history && history.length > 0) {
            const recentPairs = this._trimHistory(history, MAX_HISTORY_TURNS);
            for (const msg of recentPairs) {
                messages.push({
                    role: msg.from === 'human' ? 'user' : 'assistant',
                    content: msg.text,
                });
            }
        }
        // Current user message
        messages.push({ role: 'user', content: message });
        try {
            // Use Ollama native API (not OpenAI-compat) for think:false support.
            // The /v1/chat/completions endpoint doesn't support disabling Qwen thinking.
            const res = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    messages,
                    stream: false,
                    // Disable Qwen3 thinking mode — saves ~200-500 tokens per response.
                    // Without this, the model burns output budget on internal reasoning.
                    think: false,
                    options: {
                        temperature: 0.3,
                        num_predict: 512,
                        // Extended context window — overrides Ollama default (2048).
                        num_ctx: 8192,
                    },
                }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`);
            }
            const data = await res.json();
            const reply = data.message?.content ?? '';
            if (!reply)
                throw new Error('Empty response from Ollama');
            // Strip <think> blocks if present (Qwen reasoning mode fallback)
            return reply.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[brain:ollama] Error: ${msg}`);
            throw err;
        }
    }
    /**
     * Trim history to last N user+assistant turn pairs.
     * Skips error messages and very long messages (>300 chars get truncated).
     */
    _trimHistory(history, maxTurns) {
        // Filter out error messages
        const clean = history.filter(m => !m.text.startsWith('[Brain error:'));
        // Take last maxTurns * 2 messages (each turn = user + assistant)
        const recent = clean.slice(-(maxTurns * 2));
        // Truncate very long messages to save context tokens
        return recent.map(m => ({
            ...m,
            text: m.text.length > 400 ? m.text.slice(0, 380) + '...[truncated]' : m.text,
        }));
    }
    /** Build compact wallet state block — minimal tokens, max info density */
    _buildContext(ctx) {
        const lines = [];
        // Live prices — the model MUST have these to calculate USD values
        if (ctx.prices.length > 0) {
            lines.push('Live Prices: ' + ctx.prices.map(p => `${p.symbol}=$${p.priceUsd}`).join(', '));
        }
        // Portfolio valuation — pre-calculated so model doesn't need to do math
        if (ctx.portfolio.totalUsd > 0) {
            lines.push(`Portfolio: $${ctx.portfolio.totalUsd.toFixed(2)} USD`);
            lines.push('Holdings: ' + ctx.portfolio.assets.map(a => `${a.symbol}: ${a.humanBalance.toFixed(a.symbol === 'BTC' ? 6 : 2)} ($${a.usdValue.toFixed(0)}, ${a.pct.toFixed(1)}%)`).join(', '));
        }
        // Raw balances per chain (for chain-specific queries)
        if (ctx.balances.length > 0) {
            lines.push('Balances by chain: ' + ctx.balances.map(b => `${b.symbol}/${b.chain}=${b.formatted}`).join(', '));
        }
        else {
            lines.push('Balances: none loaded');
        }
        // Policies — compact
        if (ctx.policies.length > 0) {
            lines.push('Policies: ' + ctx.policies.map(p => `${p.rule}:${p.remaining ?? p.status ?? 'ok'}`).join(', '));
        }
        // Identity
        if (ctx.identity.registered) {
            lines.push(`Identity: ERC-8004 agentId=${ctx.identity.agentId}`);
        }
        // Swarm — compact
        if (ctx.swarmPeers > 0 || ctx.swarmAnnouncements.length > 0) {
            lines.push(`Swarm: ${ctx.swarmPeers} peers`);
            if (ctx.swarmAnnouncements.length > 0) {
                lines.push('Board:');
                for (const a of ctx.swarmAnnouncements.slice(0, 8)) {
                    const price = a.priceRange ? `${a.priceRange.min}-${a.priceRange.max}${a.priceRange.symbol}` : '?';
                    lines.push(` [${a.id.slice(0, 8)}] ${a.category} "${a.title}" by ${a.agentName} (${price})`);
                }
            }
            if (ctx.swarmRooms.length > 0) {
                lines.push('Rooms:');
                for (const r of ctx.swarmRooms.slice(0, 5)) {
                    lines.push(` [${r.announcementId.slice(0, 8)}] ${r.status} ${r.bids}bids`);
                }
            }
        }
        // Active strategies — injected as behavioral guidance
        if (ctx.activeStrategies.length > 0) {
            lines.push('Active Strategies:');
            for (const s of ctx.activeStrategies) {
                // Include strategy content (already truncated to 500 chars in buildWalletContext)
                lines.push(`[${s.name}] ${s.content.replace(/\n/g, ' ').replace(/#+\s*/g, '').slice(0, 300)}`);
            }
        }
        return lines.join('\n');
    }
}
// ── HTTP Adapter (agent-agnostic — OpenClaw, custom brains) ──
export class HttpBrainAdapter {
    name;
    url;
    timeoutMs;
    constructor(url, name = 'http', timeoutMs = 60000) {
        this.url = url;
        this.name = name;
        this.timeoutMs = timeoutMs;
    }
    async chat(message, context) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const res = await fetch(this.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, context, from: 'companion' }),
                signal: controller.signal,
            });
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`Brain HTTP ${res.status}: ${text.slice(0, 200)}`);
            }
            const data = await res.json();
            const reply = data.reply ?? data.text ?? data.message ?? '';
            if (!reply)
                throw new Error('Empty reply from brain');
            return reply;
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[brain:${this.name}] Error: ${msg}`);
            throw err;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
// ── Mock Adapter (for demo/testing) ──
export class MockBrainAdapter {
    name = 'mock';
    async chat(message, context) {
        const lower = message.toLowerCase();
        if (lower.includes('balance') || lower.includes('portfolio')) {
            if (context.balances.length === 0) {
                return 'No balances loaded yet. The wallet is initializing.';
            }
            const lines = context.balances.map(b => `${b.symbol} (${b.chain}): ${b.formatted}`);
            return `Current portfolio:\n${lines.join('\n')}`;
        }
        if (lower.includes('swap') || lower.includes('trade')) {
            return 'I can propose a swap for you. What token pair and amount? For example: "swap 10 USDT to XAUT"';
        }
        if (lower.includes('send') || lower.includes('pay') || lower.includes('transfer')) {
            return 'I can propose a payment. Please specify: amount, token, and recipient address.';
        }
        if (lower.includes('policy') || lower.includes('limit') || lower.includes('budget')) {
            if (context.policies.length === 0)
                return 'No policy data available.';
            const lines = context.policies.map(p => `${p.rule}: ${p.remaining ?? p.status ?? 'active'}`);
            return `Policy status:\n${lines.join('\n')}`;
        }
        if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
            return `Hello! I'm your Oikos agent. I manage a multi-chain wallet with ${context.balances.length} asset(s) and ${context.swarmPeers} swarm peer(s). How can I help?`;
        }
        return `Understood: "${message}". I'm monitoring the wallet and swarm. Ask me about balances, swaps, payments, or policy status.`;
    }
}
export function createBrainAdapter(config) {
    switch (config.type) {
        case 'ollama':
            return new OllamaBrainAdapter(config.chatUrl || 'http://127.0.0.1:11434', config.model || 'oikos-agent');
        case 'http':
            return new HttpBrainAdapter(config.chatUrl, 'external');
        case 'mock':
            return new MockBrainAdapter();
        default:
            console.error(`[brain] Unknown type "${config.type}", falling back to mock`);
            return new MockBrainAdapter();
    }
}
/** Build wallet context from services (for injection into brain calls) */
export async function buildWalletContext(services) {
    const [balances, policies, audit] = await Promise.all([
        services.wallet.queryBalanceAll().catch(() => []),
        services.wallet.queryPolicy().catch(() => []),
        services.wallet.queryAudit(5).catch(() => []),
    ]);
    const swarmState = services.swarm?.getState();
    // Load active strategies from disk
    const activeStrategies = [];
    try {
        const { existsSync, readdirSync, readFileSync } = await import('fs');
        const { join, dirname } = await import('path');
        const { fileURLToPath } = await import('url');
        const scriptDir = dirname(fileURLToPath(import.meta.url));
        const repoRoot = join(scriptDir, '..', '..', '..');
        const stratDirs = [
            join(repoRoot, 'strategies'),
            join(process.cwd(), '..', 'strategies'),
            join(process.cwd(), 'strategies'),
        ];
        for (const dir of stratDirs) {
            if (!existsSync(dir))
                continue;
            const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
            for (const file of files) {
                const content = readFileSync(join(dir, file), 'utf-8');
                // Skip disabled strategies
                if (/enabled:\s*false/i.test(content))
                    continue;
                const nameMatch = content.match(/^#\s+(.+)$/m);
                activeStrategies.push({
                    name: nameMatch?.[1] ?? file.replace('.md', ''),
                    content: content.slice(0, 500), // Truncate to save context tokens
                });
            }
            break; // Use first found directory
        }
    }
    catch { /* strategies dir doesn't exist yet — fine */ }
    // Fetch live prices from pricing service
    const prices = [];
    if (services.pricing) {
        try {
            const priceData = await services.pricing.getAllPrices();
            if (priceData && Array.isArray(priceData)) {
                for (const p of priceData) {
                    if (p.symbol && p.priceUsd)
                        prices.push({ symbol: p.symbol, priceUsd: p.priceUsd, source: p.source || 'live' });
                }
            }
        }
        catch { /* pricing not available */ }
    }
    // Calculate portfolio valuation using live prices
    const priceMap = { USDT: 1, USAT: 1 };
    for (const p of prices)
        priceMap[p.symbol] = p.priceUsd;
    const assetTotals = {};
    const typedBalances = balances;
    for (const b of typedBalances) {
        const human = parseFloat(b.formatted) || 0;
        const price = priceMap[b.symbol] || 0;
        if (!assetTotals[b.symbol])
            assetTotals[b.symbol] = { humanBalance: 0, usdValue: 0 };
        const entry = assetTotals[b.symbol];
        if (entry) {
            entry.humanBalance += human;
            entry.usdValue += human * price;
        }
    }
    const totalUsd = Object.values(assetTotals).reduce((s, a) => s + a.usdValue, 0);
    const portfolioAssets = Object.entries(assetTotals)
        .map(([symbol, data]) => ({
        symbol,
        humanBalance: data.humanBalance,
        usdValue: data.usdValue,
        pct: totalUsd > 0 ? (data.usdValue / totalUsd) * 100 : 0,
    }))
        .sort((a, b) => b.usdValue - a.usdValue);
    return {
        balances: typedBalances,
        policies: policies,
        recentAudit: audit,
        identity: services.identity,
        prices,
        portfolio: { totalUsd, assets: portfolioAssets },
        swarmPeers: swarmState?.boardPeers?.length ?? 0,
        swarmAnnouncements: (swarmState?.announcements ?? []).map(a => ({
            id: a.id, title: a.title, category: a.category, agentName: a.agentName, priceRange: a.priceRange,
        })),
        swarmRooms: (swarmState?.rooms ?? []).map(r => ({
            announcementId: r.announcementId, status: r.status, bids: r.bids?.length ?? 0,
        })),
        activeStrategies,
    };
}
//# sourceMappingURL=adapter.js.map