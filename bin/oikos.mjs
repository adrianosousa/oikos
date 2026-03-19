#!/usr/bin/env node
/**
 * Oikos CLI — Terminal interface for the Oikos wallet protocol.
 *
 * Usage:
 *   oikos chat                  Interactive chat with the agent
 *   oikos balance               Portfolio overview
 *   oikos send <amt> <sym> <to> [chain]  Send payment
 *   oikos swap <amt> <from> <to> [chain] Token swap
 *   oikos swarm                 Swarm board overview
 *   oikos spark                 Spark/Lightning balance
 *   oikos policy                Policy engine status
 *   oikos audit [limit]         Audit trail
 *   oikos tools                 List all MCP tools
 *   oikos health                System health check
 *   oikos <anything>            One-shot chat message
 *
 * Options:
 *   --port <n>    Wallet port (default: 3420)
 *   --json        Output raw JSON (for scripts/agents)
 */

const PORT = process.argv.find((_, i, a) => a[i - 1] === '--port') || '3420';
const JSON_MODE = process.argv.includes('--json');
const BASE = `http://127.0.0.1:${PORT}`;
const args = process.argv.slice(2).filter(a => a !== '--json' && a !== '--port' && a !== PORT);
const cmd = args[0] || 'chat';

// ── Colors ──
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  yellow: '\x1b[33m', green: '\x1b[32m', red: '\x1b[31m',
  blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m',
  white: '\x1b[37m', gray: '\x1b[90m',
  bgYellow: '\x1b[43m', bgBlack: '\x1b[40m',
};

// ── Logo ──
function printLogo() {
  const r = c.reset, d = c.dim, y = c.yellow, b = c.bold;
  console.log('');
  console.log(`${y}${b}    ██████╗  ██╗ ██╗  ██╗  ██████╗  ███████╗${r}`);
  console.log(`${y}${b}   ██╔═══██╗ ██║ ██║ ██╔╝ ██╔═══██╗ ██╔════╝${r}`);
  console.log(`${y}${b}   ██║   ██║ ██║ █████╔╝  ██║   ██║ ███████╗${r}`);
  console.log(`${y}${b}   ██║   ██║ ██║ ██╔═██╗  ██║   ██║ ╚════██║${r}`);
  console.log(`${y}${b}   ╚██████╔╝ ██║ ██║  ██╗ ╚██████╔╝ ███████║${r}`);
  console.log(`${y}${b}    ╚═════╝  ╚═╝ ╚═╝  ╚═╝  ╚═════╝  ╚══════╝${r}`);
  console.log(`${d}   Sovereign Agent Wallet Protocol${r}`);
  console.log('');
}

// ── API helpers ──
async function api(path) {
  try {
    const r = await fetch(`${BASE}${path}`);
    return await r.json();
  } catch { return null; }
}

async function apiPost(path, body) {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch { return null; }
}

async function mcp(tool, args = {}) {
  const res = await apiPost('/mcp', {
    jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
    params: { name: tool, arguments: args },
  });
  if (!res) return null;
  const text = res.result?.content?.[0]?.text;
  return text ? JSON.parse(text) : res.error;
}

// ── Formatters ──
function fmtUsd(n) { return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtPct(n) { return `${Number(n).toFixed(1)}%`; }
function pad(s, n) { return String(s).padEnd(n); }
function rpad(s, n) { return String(s).padStart(n); }

function box(title, lines) {
  const maxW = Math.max(title.length + 4, ...lines.map(l => stripAnsi(l).length + 4));
  const w = Math.min(maxW, 70);
  console.log(`${c.dim}╭─ ${c.bold}${c.yellow}${title}${c.reset}${c.dim} ${'─'.repeat(Math.max(0, w - title.length - 4))}╮${c.reset}`);
  for (const l of lines) {
    const visible = stripAnsi(l).length;
    console.log(`${c.dim}│${c.reset} ${l}${' '.repeat(Math.max(0, w - visible - 3))}${c.dim}│${c.reset}`);
  }
  console.log(`${c.dim}╰${'─'.repeat(w - 1)}╯${c.reset}`);
}

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

// ── Commands ──

async function cmdHealth() {
  const h = await api('/api/health');
  if (!h) { console.log(`${c.red}Cannot connect to wallet at ${BASE}${c.reset}`); process.exit(1); }
  if (JSON_MODE) { console.log(JSON.stringify(h)); return; }
  const dot = (on) => on ? `${c.green}●${c.reset}` : `${c.red}●${c.reset}`;
  box('System Health', [
    `${dot(h.walletConnected)} Wallet    ${dot(h.swarmEnabled)} Swarm    ${dot(h.companionConnected)} Agent`,
    `${c.dim}Events buffered: ${h.eventsBuffered || 0}${c.reset}`,
  ]);
}

async function cmdBalance() {
  const data = await mcp('wallet_balance_all');
  if (!data) { console.log(`${c.red}Failed to get balances${c.reset}`); return; }
  if (JSON_MODE) { console.log(JSON.stringify(data)); return; }

  const prices = await api('/api/prices');
  const priceMap = {};
  if (prices?.prices) prices.prices.forEach(p => { priceMap[p.symbol] = p.priceUsd; });

  // Group by symbol
  const grouped = {};
  (data.balances || []).forEach(b => {
    if (!grouped[b.symbol]) grouped[b.symbol] = { symbol: b.symbol, chains: [], amount: 0 };
    grouped[b.symbol].chains.push(b.chain);
    grouped[b.symbol].amount += parseFloat(b.formatted);
  });

  const items = Object.values(grouped).map(g => {
    const price = priceMap[g.symbol] || 0;
    const usd = g.amount * price;
    return { ...g, price, usd };
  }).sort((a, b) => b.usd - a.usd);

  const total = items.reduce((s, i) => s + i.usd, 0);

  const lines = items.map(i => {
    const pct = total > 0 ? (i.usd / total * 100) : 0;
    const sym = `${c.bold}${pad(i.symbol, 6)}${c.reset}`;
    const amt = rpad(i.amount.toFixed(i.symbol === 'BTC' ? 6 : 2), 12);
    const usd = `${c.green}${rpad(fmtUsd(i.usd), 12)}${c.reset}`;
    const pctStr = `${c.dim}${rpad(fmtPct(pct), 6)}${c.reset}`;
    const chains = `${c.dim}${i.chains.filter((v, i, a) => a.indexOf(v) === i).join(', ')}${c.reset}`;
    return `${sym} ${amt} ${usd} ${pctStr} ${chains}`;
  });

  box(`Portfolio: ${c.green}${fmtUsd(total)}${c.reset}`, lines);
}

async function cmdSwarm() {
  const data = await mcp('swarm_state');
  if (!data || !data.enabled) { console.log(`${c.dim}Swarm not enabled${c.reset}`); return; }
  if (JSON_MODE) { console.log(JSON.stringify(data)); return; }

  const peers = data.boardPeers || [];
  const anns = data.announcements || [];

  console.log(`${c.dim}Peers: ${c.bold}${c.blue}${peers.length}${c.reset}${c.dim} | Listings: ${c.bold}${anns.length}${c.reset}`);
  console.log('');

  if (anns.length === 0) { console.log(`${c.dim}  No announcements on the board${c.reset}`); return; }

  for (const a of anns.slice(0, 15)) {
    const cat = a.category || 'seller';
    const catColor = cat === 'seller' ? c.green : cat === 'buyer' ? c.blue : c.yellow;
    const price = a.priceRange ? `${a.priceRange.min}-${a.priceRange.max} ${a.priceRange.symbol || ''}` : '';
    const rep = a.reputation ? `${(a.reputation * 100).toFixed(0)}%` : '';
    console.log(`  ${catColor}${c.bold}[${cat.toUpperCase()}]${c.reset} ${c.bold}${a.title || 'Untitled'}${c.reset} ${c.dim}${(a.id || '').slice(0, 8)}${c.reset}`);
    if (a.description) console.log(`  ${c.dim}${a.description.slice(0, 80)}${c.reset}`);
    console.log(`  ${c.dim}${a.agentName || '?'}${rep ? ` ${c.green}${rep}${c.reset}` : ''}${price ? ` ${c.yellow}${price}${c.reset}` : ''}${c.reset}`);
    console.log('');
  }
}

async function cmdSpark() {
  const data = await mcp('spark_balance');
  if (JSON_MODE) { console.log(JSON.stringify(data)); return; }
  if (!data || data.error) { console.log(`${c.dim}Spark not available${c.reset}`); return; }
  box('Spark / Lightning', [
    `${c.bold}${data.balanceSats?.toLocaleString() || 0}${c.reset} satoshis (${data.formatted || '0'} BTC)`,
  ]);
}

async function cmdPolicy() {
  const data = await api('/api/policies');
  if (JSON_MODE) { console.log(JSON.stringify(data)); return; }
  if (!data?.policies?.[0]) { console.log(`${c.dim}No policies loaded${c.reset}`); return; }
  const p = data.policies[0];
  const rules = (p.rules || []).map(r => {
    if (r.type === 'max_per_tx') return `  Max/tx: ${c.bold}${Number(r.amount) / 1e6} ${r.symbol}${c.reset}`;
    if (r.type === 'max_per_day') return `  Max/day: ${c.bold}${Number(r.amount) / 1e6} ${r.symbol}${c.reset}`;
    if (r.type === 'max_per_session') return `  Max/session: ${c.bold}${Number(r.amount) / 1e6} ${r.symbol}${c.reset}`;
    if (r.type === 'cooldown_seconds') return `  Cooldown: ${c.bold}${r.seconds}s${c.reset}`;
    if (r.type === 'require_confidence') return `  Min confidence: ${c.bold}${r.min}${c.reset}`;
    if (r.type === 'time_window') return `  Hours: ${c.bold}${r.start_hour}:00-${r.end_hour}:00 ${r.timezone || 'UTC'}${c.reset}`;
    return `  ${r.type}`;
  });
  box(`Policy: ${p.name || 'Default'}`, rules);
}

async function cmdAudit() {
  const limit = parseInt(args[1]) || 10;
  const data = await mcp('audit_log', { limit });
  if (JSON_MODE) { console.log(JSON.stringify(data)); return; }
  if (!data?.entries?.length) { console.log(`${c.dim}No audit entries${c.reset}`); return; }
  console.log(`${c.dim}Last ${data.entries.length} audit entries:${c.reset}\n`);
  for (const e of data.entries) {
    const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '--';
    const type = (e.proposalType || e.type || '?').toUpperCase();
    const status = (e.status || '?').toUpperCase();
    const sc = status === 'EXECUTED' ? c.green : status === 'REJECTED' ? c.red : c.yellow;
    const sym = e.proposal?.symbol || '';
    const amt = e.proposal?.amount || '';
    console.log(`  ${c.dim}${time}${c.reset} ${c.bold}${pad(type, 10)}${c.reset} ${sc}${pad(status, 10)}${c.reset} ${amt ? amt + ' ' + sym : ''}`);
  }
}

async function cmdTools() {
  const res = await apiPost('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  if (JSON_MODE) { console.log(JSON.stringify(res?.result?.tools || [])); return; }
  const tools = res?.result?.tools || [];
  console.log(`\n${c.bold}Available MCP Tools${c.reset} (${tools.length})\n`);
  const groups = {};
  for (const t of tools) {
    const prefix = t.name.split('_')[0];
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(t);
  }
  for (const [group, items] of Object.entries(groups)) {
    console.log(`  ${c.yellow}${c.bold}${group}${c.reset}`);
    for (const t of items) {
      console.log(`    ${c.cyan}${pad(t.name, 28)}${c.reset} ${c.dim}${t.description?.slice(0, 60) || ''}${c.reset}`);
    }
  }
  console.log('');
}

async function cmdSend() {
  const [, amount, symbol, to, chain] = args;
  if (!amount || !symbol || !to) {
    console.log(`Usage: oikos send <amount> <symbol> <to> [chain]`);
    console.log(`Example: oikos send 50 USDT 0xabc123 arbitrum`);
    return;
  }
  const result = await mcp('propose_payment', {
    amount, symbol: symbol.toUpperCase(), to,
    chain: chain || 'ethereum', reason: 'CLI payment', confidence: 0.9,
  });
  if (JSON_MODE) { console.log(JSON.stringify(result)); return; }
  if (result?.status === 'executed') {
    console.log(`${c.green}✓ Sent${c.reset} ${amount} ${symbol.toUpperCase()} to ${to}`);
    console.log(`  ${c.dim}tx: ${result.txHash}${c.reset}`);
  } else {
    console.log(`${c.red}✗ Failed${c.reset}: ${result?.violations?.join(', ') || result?.error || 'Unknown error'}`);
  }
}

async function cmdSwap() {
  const [, amount, from, to, chain] = args;
  if (!amount || !from || !to) {
    console.log(`Usage: oikos swap <amount> <from> <to> [chain]`);
    console.log(`Example: oikos swap 100 USDT ETH arbitrum`);
    return;
  }
  const result = await mcp('propose_swap', {
    amount, symbol: from.toUpperCase(), toSymbol: to.toUpperCase(),
    chain: chain || 'ethereum', reason: 'CLI swap', confidence: 0.85,
  });
  if (JSON_MODE) { console.log(JSON.stringify(result)); return; }
  if (result?.status === 'executed') {
    console.log(`${c.green}✓ Swapped${c.reset} ${amount} ${from.toUpperCase()} → ${to.toUpperCase()}`);
    console.log(`  ${c.dim}tx: ${result.txHash}${c.reset}`);
  } else {
    console.log(`${c.red}✗ Failed${c.reset}: ${result?.violations?.join(', ') || result?.error || 'Unknown error'}`);
  }
}

// ── Chat Mode ──

async function cmdChat() {
  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  printLogo();

  // Health check
  const h = await api('/api/health');
  if (!h) {
    console.log(`${c.red}  Cannot connect to wallet at ${BASE}${c.reset}`);
    console.log(`${c.dim}  Start the wallet: node oikos-wallet/dist/src/main.js${c.reset}\n`);
    process.exit(1);
  }
  const dot = (on) => on ? `${c.green}●${c.reset}` : `${c.red}●${c.reset}`;
  console.log(`  ${dot(h.walletConnected)} Wallet  ${dot(h.swarmEnabled)} Swarm  ${dot(h.companionConnected)} Agent  ${c.dim}${BASE}${c.reset}`);
  console.log(`  ${c.dim}Type /help for commands, or chat naturally.${c.reset}\n`);

  const prompt = () => rl.question(`${c.yellow}oikos>${c.reset} `, handleInput);

  async function handleInput(line) {
    const input = line.trim();
    if (!input) { prompt(); return; }

    if (input === '/quit' || input === '/exit' || input === '/q') {
      console.log(`${c.dim}Goodbye.${c.reset}`);
      rl.close();
      process.exit(0);
    }

    if (input === '/help' || input === '/h' || input === '/?') {
      console.log(`
${c.bold}Commands:${c.reset}
  ${c.cyan}/balance${c.reset}           Portfolio overview
  ${c.cyan}/send${c.reset}              Send payment (interactive)
  ${c.cyan}/swap${c.reset}              Token swap (interactive)
  ${c.cyan}/swarm${c.reset}             Swarm board
  ${c.cyan}/spark${c.reset}             Lightning balance
  ${c.cyan}/policy${c.reset}            Policy engine
  ${c.cyan}/audit${c.reset}             Audit trail
  ${c.cyan}/tools${c.reset}             List MCP tools
  ${c.cyan}/health${c.reset}            System status
  ${c.cyan}/quit${c.reset}              Exit

  ${c.dim}Or type naturally — the agent understands.${c.reset}
`);
      prompt(); return;
    }

    // Slash commands in chat mode
    if (input === '/balance') { await cmdBalance(); prompt(); return; }
    if (input === '/swarm') { await cmdSwarm(); prompt(); return; }
    if (input === '/spark') { await cmdSpark(); prompt(); return; }
    if (input === '/policy') { await cmdPolicy(); prompt(); return; }
    if (input === '/audit') { await cmdAudit(); prompt(); return; }
    if (input === '/tools') { await cmdTools(); prompt(); return; }
    if (input === '/health') { await cmdHealth(); prompt(); return; }

    // Chat with agent
    process.stdout.write(`${c.dim}  thinking...${c.reset}\r`);
    const result = await apiPost('/api/agent/chat', { message: input, from: 'cli' });
    process.stdout.write('              \r');

    if (result?.reply) {
      console.log(`\n${c.blue}  Agent:${c.reset} ${result.reply}\n`);
    } else if (result?.error) {
      console.log(`\n${c.red}  Error:${c.reset} ${result.error}\n`);
    } else {
      console.log(`\n${c.dim}  No response from agent${c.reset}\n`);
    }

    prompt();
  }

  prompt();
}

// ── Help ──

function printHelp() {
  printLogo();
  console.log(`${c.bold}Usage:${c.reset} oikos <command> [options]\n`);
  console.log(`${c.bold}Commands:${c.reset}`);
  console.log(`  ${c.cyan}chat${c.reset}                 Interactive chat mode`);
  console.log(`  ${c.cyan}balance${c.reset}              Portfolio overview`);
  console.log(`  ${c.cyan}send${c.reset} <amt> <sym> <to> [chain]  Send payment`);
  console.log(`  ${c.cyan}swap${c.reset} <amt> <from> <to> [chain] Token swap`);
  console.log(`  ${c.cyan}swarm${c.reset}                Swarm board`);
  console.log(`  ${c.cyan}spark${c.reset}                Lightning balance`);
  console.log(`  ${c.cyan}policy${c.reset}               Policy engine status`);
  console.log(`  ${c.cyan}audit${c.reset} [limit]         Audit trail`);
  console.log(`  ${c.cyan}tools${c.reset}                List all MCP tools`);
  console.log(`  ${c.cyan}health${c.reset}               System health`);
  console.log(`  ${c.cyan}help${c.reset}                 This message`);
  console.log(`\n${c.bold}Options:${c.reset}`);
  console.log(`  ${c.cyan}--port${c.reset} <n>           Wallet port (default: 3420)`);
  console.log(`  ${c.cyan}--json${c.reset}               Raw JSON output (for scripts)`);
  console.log(`\n${c.bold}Examples:${c.reset}`);
  console.log(`  ${c.dim}oikos chat${c.reset}                          Interactive mode`);
  console.log(`  ${c.dim}oikos balance${c.reset}                       Quick balance check`);
  console.log(`  ${c.dim}oikos send 50 USDT 0xabc arbitrum${c.reset}   Send payment`);
  console.log(`  ${c.dim}oikos balance --json | jq .${c.reset}         Pipe to jq`);
  console.log(`  ${c.dim}oikos --port 8080 swarm${c.reset}             Custom port`);
  console.log('');
}

// ── Router ──

async function main() {
  switch (cmd) {
    case 'chat': return cmdChat();
    case 'balance': case 'bal': case 'b': return cmdBalance();
    case 'send': case 'pay': return cmdSend();
    case 'swap': return cmdSwap();
    case 'swarm': case 'board': return cmdSwarm();
    case 'spark': case 'lightning': case 'ln': return cmdSpark();
    case 'policy': case 'pol': return cmdPolicy();
    case 'audit': case 'log': return cmdAudit();
    case 'tools': case 'mcp': return cmdTools();
    case 'health': case 'status': return cmdHealth();
    case 'help': case '--help': case '-h': return printHelp();
    default:
      // One-shot: treat as chat message
      if (cmd.startsWith('-')) { printHelp(); return; }
      const msg = args.join(' ');
      const result = await apiPost('/api/agent/chat', { message: msg, from: 'cli' });
      if (JSON_MODE) { console.log(JSON.stringify(result)); return; }
      if (result?.reply) console.log(`\n${c.blue}Agent:${c.reset} ${result.reply}\n`);
      else console.log(`${c.red}No response${c.reset}`);
  }
}

main().catch(e => { console.error(`${c.red}Error:${c.reset}`, e.message); process.exit(1); });
