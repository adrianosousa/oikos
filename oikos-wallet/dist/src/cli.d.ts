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
 *   oikos chat "message"                   Chat with agent brain
 *   oikos chat                             Interactive chat mode
 *
 * Flags: --port 3420, --json, --reason "...", --confidence 0.85
 */
export {};
//# sourceMappingURL=cli.d.ts.map