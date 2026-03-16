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
 *   oikos board                            Announcement board
 *   oikos rooms                            Active negotiation rooms
 *   oikos announce <c> <t> <d>             Post announcement
 *   oikos bid <id> <price> [sym]           Bid on announcement
 *   oikos accept <id>                      Accept best bid (creator)
 *   oikos settle <id>                      Submit payment (creator)
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

// ── Setup commands (offline — no running server needed) ──

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join, resolve as pathResolve } from 'path';
import { homedir } from 'os';

const OIKOS_DIR = join(homedir(), '.oikos');

async function cmdInit(): Promise<void> {
  console.log(`\n${BOLD}oikos init${RESET} — Initialize Oikos wallet infrastructure\n`);

  // Create ~/.oikos/
  if (!existsSync(OIKOS_DIR)) {
    mkdirSync(OIKOS_DIR, { recursive: true });
    console.log(`${GREEN}✓${RESET} Created ${OIKOS_DIR}`);
  } else {
    console.log(`${DIM}  ${OIKOS_DIR} already exists${RESET}`);
  }

  // Generate swarm keypair
  const keypairPath = join(OIKOS_DIR, 'swarm-keypair.json');
  if (!existsSync(keypairPath)) {
    try {
      const { loadOrCreateKeypair } = await import('./swarm/identity.js');
      const kp = loadOrCreateKeypair(keypairPath);
      console.log(`${GREEN}✓${RESET} Generated swarm keypair`);
      console.log(`  Pubkey: ${CYAN}${kp.publicKey.toString('hex').slice(0, 32)}...${RESET}`);
    } catch {
      // Fallback: generate with Node.js crypto
      const ed = await import('crypto');
      const kp = ed.generateKeyPairSync('ed25519');
      const pub = kp.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
      const sec = kp.privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
      writeFileSync(keypairPath, JSON.stringify({
        publicKey: pub.toString('hex'),
        secretKey: sec.toString('hex'),
      }));
      console.log(`${GREEN}✓${RESET} Generated swarm keypair (fallback)`);
    }
  } else {
    const kp = JSON.parse(readFileSync(keypairPath, 'utf-8')) as { publicKey: string };
    console.log(`${DIM}  Swarm keypair exists: ${kp.publicKey.slice(0, 16)}...${RESET}`);
  }

  // Copy default policy
  const policyDest = join(OIKOS_DIR, 'policy.json');
  if (!existsSync(policyDest)) {
    const defaultPolicy = pathResolve('..', 'policies.json');
    if (existsSync(defaultPolicy)) {
      copyFileSync(defaultPolicy, policyDest);
      console.log(`${GREEN}✓${RESET} Copied default policy config`);
    } else {
      writeFileSync(policyDest, JSON.stringify([{
        name: 'default',
        rules: [
          { type: 'max_amount', amount: '100000000', symbol: 'USDT' },
          { type: 'cooldown', seconds: 30 },
          { type: 'confidence_threshold', min: 0.7 },
        ],
      }], null, 2));
      console.log(`${GREEN}✓${RESET} Created minimal policy config`);
    }
  } else {
    console.log(`${DIM}  Policy config exists${RESET}`);
  }

  // Create audit directory
  const auditDir = join(OIKOS_DIR, 'audit');
  if (!existsSync(auditDir)) {
    mkdirSync(auditDir, { recursive: true });
    console.log(`${GREEN}✓${RESET} Created audit directory`);
  }

  // Write agent pubkey for local companion auto-connect
  if (existsSync(keypairPath)) {
    const kp = JSON.parse(readFileSync(keypairPath, 'utf-8')) as { publicKey: string };
    writeFileSync(join(OIKOS_DIR, 'agent-pubkey.txt'), kp.publicKey);
  }

  console.log(`\n${GREEN}✓ Oikos initialized.${RESET}\n`);

  if (existsSync(keypairPath)) {
    const kp = JSON.parse(readFileSync(keypairPath, 'utf-8')) as { publicKey: string };
    console.log(`  ${BOLD}Agent ID${RESET}:   ${kp.publicKey.slice(0, 16)}`);
  }
  console.log(`  ${BOLD}Dashboard${RESET}:  http://127.0.0.1:3420`);
  console.log(`  ${BOLD}MCP${RESET}:        POST http://127.0.0.1:3420/mcp`);
  console.log(`  ${BOLD}CLI${RESET}:        oikos <command> --json\n`);
  console.log(`  To start:  ${BOLD}oikos start${RESET}  or  ${BOLD}npm start${RESET}`);
  console.log(`  To pair:   ${BOLD}oikos pair${RESET}\n`);
}

async function cmdPair(): Promise<void> {
  console.log(`\n${BOLD}oikos pair${RESET} — Companion App Pairing\n`);

  const keypairPath = join(OIKOS_DIR, 'swarm-keypair.json');
  if (!existsSync(keypairPath)) {
    console.error(`${RED}Error: Run ${BOLD}oikos init${RESET}${RED} first.${RESET}`);
    process.exit(1);
  }

  const kp = JSON.parse(readFileSync(keypairPath, 'utf-8')) as { publicKey: string };

  if (jsonOutput) {
    out({ agentPubkey: kp.publicKey, topicSeed: 'oikos-companion-default' });
    return;
  }

  console.log(`  ${BOLD}Agent swarm pubkey:${RESET}`);
  console.log(`  ${CYAN}${kp.publicKey}${RESET}\n`);

  // Write agent pubkey for local auto-connect
  writeFileSync(join(OIKOS_DIR, 'agent-pubkey.txt'), kp.publicKey);

  console.log(`  ${BOLD}Local (same machine):${RESET}`);
  console.log(`    pear run --dev .${DIM}  # auto-connects via ~/.oikos/${RESET}\n`);

  console.log(`  ${BOLD}Remote:${RESET}`);
  console.log(`    OIKOS_AGENT_PUBKEY=${kp.publicKey} pear run --dev .\n`);

  console.log(`  ${DIM}The companion generates its own keypair on first run.${RESET}`);
  console.log(`  ${DIM}Set COMPANION_OWNER_PUBKEY=<companion pubkey> on the agent.${RESET}\n`);
}

async function cmdWalletSub(): Promise<void> {
  const sub = argv[1];

  switch (sub) {
    case 'backup': case 'export': {
      console.log(`\n${BOLD}oikos wallet backup${RESET} — Export seed phrase\n`);
      console.log(`${RED}${BOLD}⚠  WARNING: Your seed phrase controls ALL funds.${RESET}`);
      console.log(`${RED}   Never share it. Never store it digitally. Write it on paper.${RESET}\n`);

      const seedPaths = [
        join(OIKOS_DIR, 'wallet-seed.enc.json'),
        join(OIKOS_DIR, 'seed.json'),
      ];

      let seedData: string | null = null;
      for (const p of seedPaths) {
        if (existsSync(p)) {
          seedData = readFileSync(p, 'utf-8');
          break;
        }
      }

      if (!seedData) {
        console.log(`${YELLOW}No seed file found at ~/.oikos/${RESET}`);
        console.log(`${DIM}In mock mode, the wallet uses a deterministic test seed.${RESET}`);
        console.log(`${DIM}For testnet/mainnet, run: oikos init --real${RESET}\n`);
        return;
      }

      try {
        const data = JSON.parse(seedData) as { mnemonic?: string; entropy?: string; encrypted?: boolean };

        if (data.encrypted) {
          console.log(`${YELLOW}Seed is encrypted. Passphrase decryption not yet implemented.${RESET}`);
          console.log(`${DIM}Planned for production release.${RESET}`);
          return;
        }

        if (data.mnemonic) {
          console.log(`${BOLD}Your 24-word seed phrase:${RESET}\n`);
          const words = data.mnemonic.split(' ');
          for (let i = 0; i < words.length; i++) {
            const num = String(i + 1).padStart(2, ' ');
            console.log(`  ${DIM}${num}.${RESET} ${words[i]}`);
          }
          console.log(`\n${RED}Store this offline. Clear your terminal.${RESET}\n`);
        } else if (data.entropy) {
          console.log(`${BOLD}Entropy (hex):${RESET} ${data.entropy}`);
          console.log(`${DIM}Convert to mnemonic with any BIP39 tool.${RESET}\n`);
        }
      } catch {
        console.error(`${RED}Failed to parse seed file.${RESET}`);
      }
      break;
    }

    default:
      console.error(`${RED}Usage: oikos wallet <backup>${RESET}`);
      process.exit(1);
  }
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

async function cmdBoard(): Promise<void> {
  const data = await get('/api/swarm') as {
    announcements?: Array<{
      id: string; agentName: string; category: string;
      title: string; description: string;
      priceRange?: { min: string; max: string; symbol: string };
      reputation: number; timestamp: number;
    }>;
  };
  const anns = data.announcements ?? [];

  if (jsonOutput) { out(anns); return; }

  if (anns.length === 0) {
    console.log(`${DIM}No announcements on the board.${RESET}`);
    return;
  }

  console.log(`${BOLD}Announcement Board${RESET}  (${anns.length} listing${anns.length !== 1 ? 's' : ''})\n`);
  for (const a of anns) {
    const price = a.priceRange
      ? `${a.priceRange.min}-${a.priceRange.max} ${a.priceRange.symbol}`
      : 'N/A';
    const ago = Math.round((Date.now() - a.timestamp) / 1000);
    console.log(`  ${CYAN}${a.id.slice(0, 8)}${RESET}  ${BOLD}${a.title}${RESET}`);
    console.log(`           ${DIM}${a.category}${RESET}  ${price}  by ${a.agentName} (rep ${a.reputation})  ${DIM}${ago}s ago${RESET}`);
    console.log(`           ${a.description.slice(0, 100)}`);
    console.log();
  }
}

async function cmdRooms(): Promise<void> {
  const data = await get('/api/rooms') as {
    rooms?: Array<{
      announcementId: string; role: string; status: string;
      announcement: { title: string; agentName: string };
      bids: Array<{ bidderName: string; price: string; symbol: string }>;
      agreedPrice?: string; agreedSymbol?: string;
      paymentTxHash?: string;
    }>;
  };
  const rooms = data.rooms ?? [];

  if (jsonOutput) { out(rooms); return; }

  if (rooms.length === 0) {
    console.log(`${DIM}No active rooms.${RESET}`);
    return;
  }

  console.log(`${BOLD}Negotiation Rooms${RESET}  (${rooms.length} room${rooms.length !== 1 ? 's' : ''})\n`);
  for (const r of rooms) {
    const statusColor = r.status === 'settled' ? GREEN : r.status === 'accepted' ? YELLOW : CYAN;
    console.log(`  ${CYAN}${r.announcementId.slice(0, 8)}${RESET}  ${BOLD}${r.announcement.title}${RESET}`);
    console.log(`           Role: ${r.role}  Status: ${statusColor}${r.status}${RESET}  Bids: ${r.bids.length}`);
    if (r.agreedPrice) {
      console.log(`           Agreed: ${GREEN}${r.agreedPrice} ${r.agreedSymbol}${RESET}`);
    }
    if (r.paymentTxHash) {
      console.log(`           TxHash: ${DIM}${r.paymentTxHash}${RESET}`);
    }
    if (r.bids.length > 0) {
      for (const b of r.bids) {
        console.log(`           ${DIM}bid: ${b.bidderName} ${b.price} ${b.symbol}${RESET}`);
      }
    }
    console.log();
  }
}

async function cmdAnnounce(): Promise<void> {
  // oikos announce service "My Title" "Description text" --min 5 --max 100 --symbol USDT
  const category = argv[1];
  const title = argv[2];
  const desc = argv[3];
  const minPrice = flag('min') ?? '0';
  const maxPrice = flag('max') ?? '100';
  const sym = flag('symbol') ?? 'USDT';

  if (!category || !title || !desc || !['service', 'auction', 'request'].includes(category)) {
    console.error(`${RED}Usage: oikos announce <service|auction|request> "<title>" "<description>" [--min 5 --max 100 --symbol USDT]${RESET}`);
    process.exit(1);
  }

  const result = await mcpCall('swarm_announce', {
    category, title, description: desc, minPrice, maxPrice, symbol: sym,
  });
  if (jsonOutput) { out(result); return; }

  const r = result as { announcementId?: string };
  if (r.announcementId) {
    console.log(`${GREEN}Announced${RESET}: ${BOLD}${title}${RESET}`);
    console.log(`  ID: ${CYAN}${r.announcementId}${RESET}`);
  } else {
    out(result);
  }
}

async function cmdBid(): Promise<void> {
  // oikos bid <announcementId> <price> <symbol> --reason "..."
  const announcementId = argv[1];
  const price = argv[2];
  const sym = argv[3]?.toUpperCase() ?? 'USDT';

  if (!announcementId || !price) {
    console.error(`${RED}Usage: oikos bid <announcementId> <price> [symbol] [--reason "..."]${RESET}`);
    process.exit(1);
  }

  const result = await mcpCall('swarm_bid', {
    announcementId, price, symbol: sym, reason,
  });
  if (jsonOutput) { out(result); return; }

  console.log(`${GREEN}Bid placed${RESET}: ${price} ${sym} on ${CYAN}${announcementId.slice(0, 8)}${RESET}`);
}

async function cmdAccept(): Promise<void> {
  // oikos accept <announcementId>
  const announcementId = argv[1];
  if (!announcementId) {
    console.error(`${RED}Usage: oikos accept <announcementId>${RESET}`);
    process.exit(1);
  }

  const result = await mcpCall('swarm_accept_bid', { announcementId });
  if (jsonOutput) { out(result); return; }

  const r = result as { accepted?: boolean; agreedPrice?: string; agreedSymbol?: string; reason?: string };
  if (r.accepted) {
    console.log(`${GREEN}Accepted${RESET}: best bid on ${CYAN}${announcementId.slice(0, 8)}${RESET}`);
    if (r.agreedPrice) console.log(`  Price: ${r.agreedPrice} ${r.agreedSymbol ?? ''}`);
  } else {
    console.log(`${YELLOW}Not accepted${RESET}: ${r.reason ?? 'unknown reason'}`);
  }
}

async function cmdSettle(): Promise<void> {
  // oikos settle <announcementId>
  const announcementId = argv[1];
  if (!announcementId) {
    console.error(`${RED}Usage: oikos settle <announcementId>${RESET}`);
    process.exit(1);
  }

  const result = await mcpCall('swarm_submit_payment', { announcementId });
  if (jsonOutput) { out(result); return; }

  const r = result as { submitted?: boolean };
  if (r.submitted) {
    console.log(`${GREEN}Payment submitted${RESET} for ${CYAN}${announcementId.slice(0, 8)}${RESET}`);
    console.log(`  ${DIM}(Goes through PolicyEngine -> Wallet Isolate -> on-chain)${RESET}`);
  } else {
    out(result);
  }
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
  console.log(`${BOLD}oikos${RESET} — Sovereign AI Agent Wallet

${BOLD}Setup:${RESET}
  oikos init                             Initialize wallet infrastructure
  oikos pair                             Pair companion app
  oikos wallet backup                    Export seed phrase for recovery

${BOLD}Read:${RESET}
  oikos balance [symbol] [chain]         All balances
  oikos address [chain]                  Wallet addresses
  oikos status                           Policy budgets & cooldowns
  oikos audit [--limit N]                Transaction history
  oikos health                           Service health
  oikos swarm                            P2P swarm state
  oikos identity                         ERC-8004 identity
  oikos prices                           Asset prices

${BOLD}Write:${RESET}
  oikos pay <amt> <sym> to <addr>        Send tokens
  oikos swap <amt> <sym> to <toSym>      Swap tokens
  oikos bridge <amt> <sym> from <c> to <c>  Bridge cross-chain
  oikos yield deposit|withdraw <amt> <sym>  Yield ops

${BOLD}Swarm:${RESET}
  oikos board                              Announcement board
  oikos rooms                             Active negotiation rooms
  oikos announce <cat> "<t>" "<d>"        Post announcement
  oikos bid <id> <price> [sym]            Bid on announcement
  oikos accept <id>                       Accept best bid (creator)
  oikos settle <id>                       Submit payment (creator)

${BOLD}Simulate:${RESET}
  oikos simulate <type> <amt> <sym>      Dry-run policy check

${BOLD}RGB:${RESET}
  oikos rgb assets|issue|transfer        RGB asset operations

${BOLD}Flags:${RESET}
  --port 3420     API port        --json          Raw JSON output
  --reason "..."  Op reason       --confidence N  Score (0-1)
`);
}

// ── Router ──

async function main(): Promise<void> {
  try {
    // Setup commands (no running server needed)
    if (cmd === 'init') { await cmdInit(); return; }
    if (cmd === 'pair') { await cmdPair(); return; }
    if (cmd === 'wallet') { await cmdWalletSub(); return; }

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
      case 'board': await cmdBoard(); break;
      case 'rooms': await cmdRooms(); break;
      case 'announce': await cmdAnnounce(); break;
      case 'bid': await cmdBid(); break;
      case 'accept': await cmdAccept(); break;
      case 'settle': await cmdSettle(); break;
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
      console.error(`${RED}Cannot connect to Oikos at ${BASE}${RESET}`);
      console.error(`Is Oikos running? Start with: ${BOLD}npm start${RESET} or ${BOLD}oikos start${RESET}`);
    } else {
      console.error(`${RED}Error: ${msg}${RESET}`);
    }
    process.exit(1);
  }
}

main();
