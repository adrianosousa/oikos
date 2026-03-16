# Oikos Protocol -- Security Model

Defense-in-depth security architecture for autonomous AI agent wallets.
The guiding principle: if the agent is compromised, the wallet is still safe.

## Process Isolation

The system runs as TWO separate runtime processes with no shared memory, no shared files,
and no direct function calls:

```
+-----------------------+          stdin/stdout          +-----------------------+
|     Oikos App         |  <---  JSON-lines IPC  --->   |   Wallet Isolate      |
|     (Node.js)         |                               |   (Bare Runtime)      |
|                       |                               |                       |
| - Hyperswarm P2P      |                               | - Holds private keys  |
| - Dashboard server    |                               | - Signs transactions  |
| - MCP server (21 tools)|                              | - Enforces policy     |
| - CLI interface       |                               | - Writes audit log    |
| - x402 payments       |                               | - Manages seed        |
| - Swarm negotiation   |                               |                       |
| - NO LLM (agnostic)   |                               |                       |
+-----------------------+                               +-----------------------+
   CAN be compromised                                     CANNOT be reached
   without moving funds                                   except through IPC
```

The Oikos App process has a large attack surface (HTTP server, MCP endpoint, Hyperswarm network, x402 endpoints).
If compromised, an attacker gains control of the infrastructure layer but CANNOT:

- Access the seed phrase or private keys (Wallet process memory only)
- Sign transactions directly (WDK runs in the Wallet process)
- Bypass policy rules (PolicyEngine evaluates in the Wallet process)
- Modify policies (immutable after startup)
- Delete or edit audit entries (append-only)

The worst an attacker can do through a compromised Oikos App is send proposals via IPC.
Every proposal is still subject to policy evaluation and creates an audit entry.

## Seed Phrase Handling

Seed material follows a strict lifecycle with minimal exposure:

1. **At rest:** Encrypted on disk using WDK SecretManager.
   - Key derivation: PBKDF2-SHA256 from a passphrase (minimum 12 characters).
   - Encryption: XSalsa20-Poly1305 (authenticated encryption).
   - File format: `{ version: 1, salt: hex, encryptedEntropy: hex, createdAt: ISO8601 }`.
   - Only the encrypted entropy is persisted. The passphrase comes from the environment.

2. **In memory:** Decrypted seed exists only inside the Wallet Isolate process.
   - Passed to `new WDK(seedPhrase)` exactly once at startup.
   - `SecretManager.dispose()` is called after WDK init to wipe the decrypted seed from its buffer.
   - The seed is never stored in a variable beyond the initialization scope.

3. **Never transmitted:** The seed phrase never appears in:
   - IPC messages (not even as error details)
   - Audit log entries
   - Debug logs or console output
   - Dashboard API responses
   - Companion channel messages

**Resolution priority:**
1. `WALLET_SEED` environment variable (backward compatibility, explicit override)
2. Encrypted seed file on disk (decrypt with `WALLET_PASSPHRASE`)
3. Generate new seed, encrypt, save to disk, return

## Transaction Authorization

There is exactly one code path that can move funds:

```
IPCRequest(proposal)
  --> validateIPCRequest()       Schema validation (drops malformed messages)
  --> ProposalExecutor.execute()
      --> AuditLog.logProposalReceived()
      --> PolicyEngine.evaluate(proposal)
          |
          |--> REJECTED: AuditLog.logPolicyEnforcement() --> return rejection
          |
          |--> APPROVED: WalletOperations.sendTransaction() / swap() / bridge() / etc.
               |
               |--> SUCCESS: AuditLog.logExecutionSuccess() --> PolicyEngine.recordExecution()
               |--> FAILURE: AuditLog.logExecutionFailure() --> return failure
```

Critical invariants:
- A rejected proposal NEVER reaches the wallet operation call. This is the most critical test target.
- The executor does NOT retry failed transactions. The calling agent may submit a new proposal.
- ALL proposal types (payment, swap, bridge, yield, feedback) traverse the same pipeline.
- Schema validation failure silently drops the message and logs a `malformed_message` audit entry.

## PolicyEngine Immutability

- Policies are loaded from a JSON config file at Wallet Isolate startup.
- The policy array is copied into the engine. The original config is not retained.
- No IPC message type exists that can modify, add, or remove policies.
- External agents can QUERY policy status (remaining budgets, cooldown timers) but CANNOT change state.
- Policy evaluation is deterministic: same proposal + same state = same decision.

The only way to change policies is to restart the Wallet Isolate with a new config file.
This is a deliberate design choice -- runtime policy modification would be a privilege escalation vector.

## Audit Trail

The audit log is an append-only JSON-lines file with these guarantees:

- **No updates:** The `AuditLog` class exposes `log*()` and `getEntries()` methods only.
  There is no `update()`, `delete()`, or `truncate()` method.
- **Complete coverage:** Every proposal received (approved, rejected, or malformed) is recorded.
  Every execution result (success or failure) is recorded.
- **No sensitive data:** Entries never contain seed phrases, private keys, raw wallet state,
  or LLM API keys. They contain: proposal amounts, symbols, chains, recipient addresses
  (public data), policy violations, transaction hashes, and error messages.
- **Query via IPC:** The Brain can request audit entries for dashboard display.
  Entries are returned as-is -- no filtering of fields.
- **Entry structure:**
  ```
  { id, timestamp (ISO 8601), type, proposalType, source, proposal, violations, txHash, error }
  ```
- **Entry types:** `proposal_received`, `policy_enforcement`, `execution_success`,
  `execution_failure`, `malformed_message`, `identity_operation`.

## Network Boundaries

| Process | Connects to | Never connects to |
|---------|-------------|-------------------|
| Wallet Isolate | Blockchain RPC (Electrum, JSON-RPC), DeFi protocols (DEXs, lending, bridges) | HTTP servers, Hyperswarm, LLM APIs, external APIs |
| Oikos App | Hyperswarm DHT, x402 endpoints, localhost dashboard + MCP, CLI | Blockchain nodes (directly), wallet signing, LLM APIs |
| External Agent | Oikos App (via MCP / REST / CLI) | Wallet Isolate, blockchain nodes |
| Oikos App | Oikos infrastructure (via Hyperswarm) | Wallet Isolate, blockchain nodes, LLM APIs |

The Oikos App negotiates with peers over Hyperswarm, handles x402 payment flows, receives companion
instructions, then sends Proposals to the Wallet via IPC. The Wallet evaluates policy and signs.
The Oikos App never sees the signing. The Companion never sees IPC.

## Dependency Hygiene

- ALL dependency versions are pinned exactly (no `^` or `~` in package.json).
- **Wallet Isolate** has a minimal dependency tree: `@tetherto/wdk`, `@tetherto/wdk-wallet-btc`,
  `@tetherto/wdk-wallet-evm`, `@tetherto/wdk-secret-manager`. No additional crypto libraries.
  WDK bundles its own sodium-based cryptography.
- **Oikos App** has larger dependencies (Express, Hyperswarm, Protomux, sodium-universal).
  This is acceptable because the Oikos App cannot sign transactions. Note: no LLM SDK --
  the app is agent-agnostic. LLM dependencies live in external agents (e.g., `examples/oikos-agent/`).
- TypeScript strict mode everywhere: `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`,
  `noUncheckedIndexedAccess: true`. No `any` types. `unknown` + type guards for uncertain types.

## Threat Model

| Threat | Mitigation |
|--------|------------|
| Oikos App process compromised | Wallet enforces policy independently. Attacker can only submit proposals (rate-limited by cooldown, capped by budgets). Full audit trail of all attempts. |
| Malicious IPC messages | Schema validation rejects malformed messages. Silently dropped, logged as `malformed_message`. |
| Policy bypass attempt | No IPC message type modifies policies. PolicyEngine is immutable after construction. |
| Seed phrase extraction | Seed exists only in Wallet process memory. Never in IPC, logs, or dashboard. Encrypted at rest with XSalsa20-Poly1305. |
| Companion impersonation | Ed25519 public key verification via Hyperswarm Noise handshake. Only the authorized owner pubkey is accepted. Unauthorized connections are immediately destroyed. |
| Swarm peer manipulation | Noise_XX mutual authentication. Firewall rejects unknown peers. Transaction details only in private rooms. Board is metadata-only. |
| Budget exhaustion | Per-transaction, per-session, per-day, and per-recipient-per-day limits. Limits are per-asset (USDT, XAUT, USAT each have independent budgets). |
| Timing attacks | Cooldown timer enforced between transactions. Time-window rules restrict operating hours. |
| Audit log tampering | Append-only file. No delete or update API. Log is inside the Wallet Isolate process boundary. |

## Fail-Closed Design

Every ambiguity resolves to "no funds move":

- Unknown proposal type: rejected, logged as unknown.
- Invalid timezone in time_window rule: returns hour -1, which violates most windows.
- Confidence below threshold: rejected.
- BigInt parse failure on amount: schema validation fails, message dropped.
- WDK transaction call failure: logged as `execution_failure`, returned as `failed` status.
- Missing counterparty for whitelist check: rule is skipped (swaps/bridges have no counterparty).
- Day boundary during evaluation: daily totals reset, proposal evaluated against fresh limits.
