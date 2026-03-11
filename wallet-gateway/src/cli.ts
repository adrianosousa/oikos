#!/usr/bin/env node
/**
 * Oikos CLI — thin wrapper around the Wallet Gateway REST API.
 *
 * Usage:
 *   oikos balance                          All balances
 *   oikos balance USDT                     Filter by symbol
 *   oikos address [chain]                  Wallet addresses
 *   oikos pay <amt> <sym> to <addr>        Send tokens
 *   oikos swap <amt> <sym> to <toSym>      Swap tokens
 *   oikos bridge <amt> <sym> from <fc> to <tc>  Bridge cross-chain
 *   oikos yield deposit|withdraw <amt> <sym>    Yield ops
 *   oikos status                           Policy budgets
 *   oikos audit [--limit N]                Transaction history
 *   oikos health                           Gateway health
 *   oikos swarm                            Swarm peers
 *   oikos identity                         ERC-8004 identity
 *   oikos prices                           Asset prices
 *   oikos rgb assets                       RGB assets
 *   oikos rgb issue <t> <n> <s>            Issue RGB asset
 *   oikos rgb transfer <inv> <amt>         Transfer RGB asset
 *
 * Flags: --port 3420, --json, --reason "...", --confidence 0.85
 */

// ── Arg parsing ──

const argv = process.argv.slice(2);

function flag(name: string): string | undefined {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const val = argv[idx + 1];
  argv.splice(idx, 2);
  return val;
}

function hasFlag(name: string): boolean {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1) return false;
  argv.splice(idx, 1);
  return true;
}

const port = flag('port') ?? '3420';
const jsonOutput = hasFlag('json');
const reason = flag('reason') ?? 'CLI operation';
const confidence = parseFloat(flag('confidence') ?? '0.85');
const protocol = flag('protocol') ?? 'aave-v3';
const limit = flag('limit') ?? '20';

const BASE = `http://127.0.0.1:${port}`;
const cmd = argv[0] ?? '';

// ── Helpers ──

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function post(path: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

async function mcpCall(tool: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json() as { result?: { content?: Array<{ text?: string }> }; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);

  // MCP wraps results in { content: [{ type: "text", text: "..." }] }
  const text = data.result?.content?.[0]?.text;
  if (text) {
    try { return JSON.parse(text); } catch { return text; }
  }
  return data.result;
}

function formatResult(result: unknown): void {
  const r = result as Record<string, unknown>;
  if (!r || typeof r !== 'object') { out(result); return; }

  const status = r['status'] as string;
  const statusColor = status === 'executed' ? GREEN : status === 'rejected' ? YELLOW : RED;
  console.log(`${BOLD}Status${RESET}: ${statusColor}${status}${RESET}`);

  if (r['txHash']) console.log(`${BOLD}TxHash${RESET}: ${String(r['txHash'])}`);

  const violations = r['violations'] as string[];
  if (violations?.length) {
    for (const v of violations) {
      console.log(`${YELLOW}  ! ${v}${RESET}`);
    }
  }

  if (r['error']) console.log(`${RED}Error: ${String(r['error'])}${RESET}`);
}

function out(data: unknown): void {
  if (jsonOutput) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  // Formatted output handled per command
  console.log(JSON.stringify(data, null, 2));
}

// ── Commands ──

async function cmdBalance(): Promise<void> {
  const data = await get('/api/balances') as { balances: Array<{ chain: string; symbol: string; formatted: string; balance: string }> };
  const filterSymbol = argv[1]?.toUpperCase();
  const filterChain = argv[2]?.toLowerCase();

  let balances = data.balances ?? [];
  if (filterSymbol) balances = balances.filter(b => b.symbol === filterSymbol);
  if (filterChain) balances = balances.filter(b => b.chain === filterChain);

  if (jsonOutput) { out(balances); return; }

  if (balances.length === 0) {
    console.log(`${DIM}No balances found.${RESET}`);
    return;
  }

  console.log(`${BOLD}Chain          Symbol   Balance${RESET}`);
  console.log('─'.repeat(42));
  for (const b of balances) {
    const chain = b.chain.padEnd(14);
    const sym = b.symbol.padEnd(8);
    console.log(`${chain} ${CYAN}${sym}${RESET} ${b.formatted}`);
  }
}

async function cmdAddress(): Promise<void> {
  const data = await get('/api/addresses') as { addresses: Array<{ chain: string; address: string }> };
  const filterChain = argv[1]?.toLowerCase();
  let addresses = data.addresses ?? [];
  if (filterChain) addresses = addresses.filter(a => a.chain === filterChain);

  if (jsonOutput) { out(addresses); return; }

  for (const a of addresses) {
    console.log(`${BOLD}${a.chain}${RESET}: ${a.address}`);
  }
}

async function cmdPay(): Promise<void> {
  // oikos pay 1.5 USDT to 0xAddr
  const amount = argv[1];
  const symbol = argv[2]?.toUpperCase();
  const toIdx = argv.indexOf('to');
  const to = toIdx !== -1 ? argv[toIdx + 1] : undefined;

  if (!amount || !symbol || !to) {
    console.error(`${RED}Usage: oikos pay <amount> <symbol> to <address> [--reason "..."]${RESET}`);
    process.exit(1);
  }

  const result = await mcpCall('propose_payment', {
    amount, symbol, chain: 'ethereum', to, reason, confidence,
  });
  if (jsonOutput) { out(result); } else { formatResult(result); }
}

async function cmdSwap(): Promise<void> {
  // oikos swap 5 USDT to XAUT
  const amount = argv[1];
  const symbol = argv[2]?.toUpperCase();
  const toIdx = argv.indexOf('to');
  const toSymbol = toIdx !== -1 ? argv[toIdx + 1]?.toUpperCase() : undefined;

  if (!amount || !symbol || !toSymbol) {
    console.error(`${RED}Usage: oikos swap <amount> <symbol> to <toSymbol> [--reason "..."]${RESET}`);
    process.exit(1);
  }

  const result = await mcpCall('propose_swap', {
    amount, symbol, toSymbol, chain: 'ethereum', reason, confidence,
  });
  if (jsonOutput) { out(result); } else { formatResult(result); }
}

async function cmdBridge(): Promise<void> {
  // oikos bridge 1 USDT from ethereum to arbitrum
  const amount = argv[1];
  const symbol = argv[2]?.toUpperCase();
  const fromIdx = argv.indexOf('from');
  const toIdx = argv.indexOf('to');
  const fromChain = fromIdx !== -1 ? argv[fromIdx + 1]?.toLowerCase() : undefined;
  const toChain = toIdx !== -1 ? argv[toIdx + 1]?.toLowerCase() : undefined;

  if (!amount || !symbol || !fromChain || !toChain) {
    console.error(`${RED}Usage: oikos bridge <amount> <symbol> from <chain> to <chain> [--reason "..."]${RESET}`);
    process.exit(1);
  }

  const result = await mcpCall('propose_bridge', {
    amount, symbol, fromChain, toChain, reason, confidence,
  });
  if (jsonOutput) { out(result); } else { formatResult(result); }
}

async function cmdYield(): Promise<void> {
  // oikos yield deposit 2 USDT
  const action = argv[1];
  const amount = argv[2];
  const symbol = argv[3]?.toUpperCase();

  if (!action || !amount || !symbol || !['deposit', 'withdraw'].includes(action)) {
    console.error(`${RED}Usage: oikos yield <deposit|withdraw> <amount> <symbol> [--protocol aave-v3]${RESET}`);
    process.exit(1);
  }

  const result = await mcpCall('propose_yield', {
    amount, symbol, chain: 'ethereum', protocol, action, reason, confidence,
  });
  if (jsonOutput) { out(result); } else { formatResult(result); }
}

async function cmdStatus(): Promise<void> {
  const data = await get('/api/policies') as { policies: Array<{ name: string; state: { sessionTotals: Record<string, string>; lastTransactionTime: number } }> };
  if (jsonOutput) { out(data); return; }

  const policies = data.policies ?? [];
  if (policies.length === 0) {
    console.log(`${DIM}No active policies.${RESET}`);
    return;
  }

  for (const p of policies) {
    console.log(`${BOLD}${p.name}${RESET}`);
    const totals = Object.entries(p.state.sessionTotals);
    if (totals.length === 0) {
      console.log(`  ${DIM}No session spending${RESET}`);
    } else {
      for (const [k, v] of totals) {
        console.log(`  ${k}: ${YELLOW}${v}${RESET}`);
      }
    }
    if (p.state.lastTransactionTime) {
      const ago = Math.round((Date.now() - p.state.lastTransactionTime) / 1000);
      console.log(`  ${DIM}Last tx: ${ago}s ago${RESET}`);
    }
  }
}

async function cmdAudit(): Promise<void> {
  const data = await get(`/api/audit?limit=${limit}`) as { entries: unknown[] };
  out(data.entries ?? data);
}

async function cmdHealth(): Promise<void> {
  const data = await get('/api/health') as Record<string, unknown>;
  if (jsonOutput) { out(data); return; }

  const status = data['status'] === 'ok' ? `${GREEN}ok${RESET}` : `${RED}${String(data['status'])}${RESET}`;
  const wallet = data['walletConnected'] ? `${GREEN}connected${RESET}` : `${RED}disconnected${RESET}`;
  const brain = data['brainConnected'] ? `${GREEN}connected${RESET}` : `${DIM}not connected${RESET}`;
  const swarm = data['swarmEnabled'] ? `${GREEN}enabled${RESET}` : `${DIM}disabled${RESET}`;

  console.log(`${BOLD}Status${RESET}:  ${status}`);
  console.log(`${BOLD}Wallet${RESET}:  ${wallet}`);
  console.log(`${BOLD}Brain${RESET}:   ${brain}`);
  console.log(`${BOLD}Swarm${RESET}:   ${swarm}`);
}

async function cmdSwarm(): Promise<void> {
  const data = await get('/api/swarm') as Record<string, unknown>;
  out(data);
}

async function cmdIdentity(): Promise<void> {
  const data = await get('/api/identity') as Record<string, unknown>;
  out(data);
}

async function cmdPrices(): Promise<void> {
  const data = await get('/api/prices') as { prices?: Array<{ symbol: string; priceUsd: number; source: string }> };
  if (jsonOutput) { out(data); return; }

  const prices = data.prices ?? [];
  if (prices.length === 0) {
    console.log(`${DIM}No prices available.${RESET}`);
    return;
  }

  console.log(`${BOLD}Symbol   Price (USD)      Source${RESET}`);
  console.log('─'.repeat(42));
  for (const p of prices) {
    const sym = p.symbol.padEnd(8);
    const price = `$${p.priceUsd.toLocaleString()}`.padEnd(16);
    console.log(`${CYAN}${sym}${RESET} ${price} ${DIM}${p.source}${RESET}`);
  }
}

// ── RGB Commands ──

async function cmdRgb(): Promise<void> {
  const sub = argv[1];

  switch (sub) {
    case 'assets': case 'list': {
      const data = await get('/api/rgb/assets') as { assets: Array<{ assetId: string; ticker: string; name: string; precision: number; balance: string }> };
      if (jsonOutput) { out(data); return; }

      const assets = data.assets ?? [];
      if (assets.length === 0) {
        console.log(`${DIM}No RGB assets.${RESET}`);
        return;
      }

      console.log(`${BOLD}Ticker   Name                 Balance          Asset ID${RESET}`);
      console.log('─'.repeat(72));
      for (const a of assets) {
        const ticker = a.ticker.padEnd(8);
        const name = a.name.padEnd(20);
        const bal = a.balance.padEnd(16);
        console.log(`${CYAN}${ticker}${RESET} ${name} ${bal} ${DIM}${a.assetId}${RESET}`);
      }
      break;
    }

    case 'issue': {
      // oikos rgb issue OTKN "Oikos Token" 1000000 [--precision 6]
      const ticker = argv[2];
      const name = argv[3];
      const supply = argv[4];
      const precision = parseInt(flag('precision') ?? '6', 10);

      if (!ticker || !name || !supply) {
        console.error(`${RED}Usage: oikos rgb issue <ticker> <name> <supply> [--precision 6]${RESET}`);
        process.exit(1);
      }

      const result = await mcpCall('rgb_issue', {
        ticker, name, amount: supply, precision, reason, confidence,
      });
      if (jsonOutput) { out(result); } else { formatResult(result); }
      break;
    }

    case 'transfer': case 'send': {
      // oikos rgb transfer <invoice> <amount> [--symbol RGB]
      const invoice = argv[2];
      const amount = argv[3];
      const symbol = argv[4] ?? 'RGB';

      if (!invoice || !amount) {
        console.error(`${RED}Usage: oikos rgb transfer <invoice> <amount> [symbol]${RESET}`);
        process.exit(1);
      }

      const result = await mcpCall('rgb_transfer', {
        invoice, amount, symbol, reason, confidence,
      });
      if (jsonOutput) { out(result); } else { formatResult(result); }
      break;
    }

    default:
      console.error(`${RED}Unknown rgb subcommand: ${sub ?? '(none)'}${RESET}`);
      console.error(`Usage: oikos rgb <assets|issue|transfer>`);
      process.exit(1);
  }
}

async function cmdSimulate(): Promise<void> {
  // oikos simulate <type> <amount> <symbol> [--to addr] [--toSymbol SYM]
  const simType = argv[1] ?? '';
  const simAmount = argv[2] ?? '1';
  const simSymbol = argv[3] ?? 'USDT';
  const simChain = flag('--chain') ?? 'ethereum';
  const simTo = flag('--to') ?? '';
  const simToSymbol = flag('--toSymbol') ?? '';

  if (!['payment', 'swap', 'bridge', 'yield'].includes(simType)) {
    console.error(`${RED}Usage: oikos simulate <payment|swap|bridge|yield> <amount> <symbol>${RESET}`);
    console.error(`  --chain ethereum   Chain (default: ethereum)`);
    console.error(`  --to 0x...         Recipient (for payment)`);
    console.error(`  --toSymbol XAUT    Target symbol (for swap)`);
    process.exit(1);
  }

  const body: Record<string, unknown> = {
    amount: simAmount,
    symbol: simSymbol.toUpperCase(),
    chain: simChain,
    confidence,
    reason: 'dry-run simulation',
    strategy: 'cli-simulate',
  };
  if (simTo) body['to'] = simTo;
  if (simToSymbol) body['toSymbol'] = simToSymbol.toUpperCase();

  const result = await post('/api/simulate', body);

  if (jsonOutput) {
    out(result);
  } else {
    const r = result as { wouldApprove?: boolean; violations?: string[]; policyId?: string };
    const approved = r.wouldApprove ?? false;
    const icon = approved ? `${GREEN}✓ WOULD APPROVE${RESET}` : `${RED}✗ WOULD REJECT${RESET}`;
    console.log(`\n${BOLD}Policy Dry-Run${RESET}  ${icon}`);
    console.log(`  Type:       ${simType}`);
    console.log(`  Amount:     ${simAmount} ${simSymbol.toUpperCase()}`);
    console.log(`  Chain:      ${simChain}`);
    console.log(`  Confidence: ${confidence}`);
    if (r.violations && r.violations.length > 0) {
      console.log(`\n${BOLD}Violations:${RESET}`);
      for (const v of r.violations) {
        console.log(`  ${RED}• ${v}${RESET}`);
      }
    }
    console.log();
  }
}

function showHelp(): void {
  console.log(`${BOLD}oikos${RESET} — Oikos Wallet CLI

${BOLD}Read commands:${RESET}
  oikos balance [symbol] [chain]        All balances (optional filter)
  oikos address [chain]                 Wallet addresses
  oikos status                          Policy budgets & cooldowns
  oikos audit [--limit N]               Transaction history
  oikos health                          Gateway health check
  oikos swarm                           P2P swarm state
  oikos identity                        ERC-8004 identity
  oikos prices                          Asset prices

${BOLD}Write commands:${RESET}
  oikos pay <amount> <symbol> to <address>          Send tokens
  oikos swap <amount> <symbol> to <toSymbol>        Swap tokens
  oikos bridge <amount> <symbol> from <chain> to <chain>  Bridge cross-chain
  oikos yield deposit|withdraw <amount> <symbol>    Yield operations

${BOLD}Simulation:${RESET}
  oikos simulate <type> <amount> <symbol>           Dry-run policy check (no execution)
    types: payment, swap, bridge, yield
    flags: --to <addr>, --toSymbol <SYM>, --chain <chain>

${BOLD}RGB commands:${RESET}
  oikos rgb assets                                  List RGB assets
  oikos rgb issue <ticker> <name> <supply>          Issue new RGB asset
  oikos rgb transfer <invoice> <amount> [symbol]    Transfer via invoice

${BOLD}Flags:${RESET}
  --port 3420         Gateway port (default: 3420)
  --json              Raw JSON output
  --reason "..."      Reason for write ops (default: "CLI operation")
  --confidence 0.85   Confidence score (default: 0.85)
  --protocol aave-v3  Yield protocol (default: aave-v3)
  --limit 20          Audit entry limit (default: 20)
`);
}

// ── Router ──

async function main(): Promise<void> {
  try {
    switch (cmd) {
      case 'balance': case 'bal': case 'b': await cmdBalance(); break;
      case 'address': case 'addr': case 'a': await cmdAddress(); break;
      case 'pay': case 'send': await cmdPay(); break;
      case 'swap': await cmdSwap(); break;
      case 'bridge': await cmdBridge(); break;
      case 'yield': await cmdYield(); break;
      case 'status': case 'policies': await cmdStatus(); break;
      case 'audit': case 'log': await cmdAudit(); break;
      case 'health': await cmdHealth(); break;
      case 'swarm': await cmdSwarm(); break;
      case 'identity': case 'id': await cmdIdentity(); break;
      case 'prices': await cmdPrices(); break;
      case 'rgb': await cmdRgb(); break;
      case 'simulate': case 'sim': case 'dryrun': case 'dry-run': await cmdSimulate(); break;
      case 'help': case '--help': case '-h': showHelp(); break;
      case '': showHelp(); break;
      default:
        console.error(`${RED}Unknown command: ${cmd}${RESET}`);
        console.error(`Run ${BOLD}oikos help${RESET} for usage.`);
        process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      console.error(`${RED}Cannot connect to gateway at ${BASE}${RESET}`);
      console.error(`Is the gateway running? Start with: ${BOLD}npm run demo${RESET} or ${BOLD}npm run start:gateway${RESET}`);
    } else {
      console.error(`${RED}Error: ${msg}${RESET}`);
    }
    process.exit(1);
  }
}

main();
