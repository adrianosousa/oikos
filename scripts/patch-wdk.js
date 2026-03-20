#!/usr/bin/env node
/**
 * patch-wdk.js — Patch WDK Secret Manager for Node.js compatibility.
 *
 * The WDK Secret Manager (beta.3) unconditionally requires `bare-crypto`,
 * which pulls in `bare-assert → bare-inspect → bare-type → require.addon()`.
 * `require.addon()` only exists in Bare Runtime, so it crashes on Node.js.
 *
 * The fix: `bare-crypto` is only used for `pbkdf2Sync`, which is identical
 * to `node:crypto.pbkdf2Sync`. This script patches the require to use
 * Node's built-in crypto module instead.
 *
 * Pattern from: tzimtzum_v2/scripts/patch-wdk.js
 * Run: node scripts/patch-wdk.js (or as postinstall)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const targetFile = resolve(
  root,
  'node_modules/@tetherto/wdk-secret-manager/src/wdk-secret-manager.js'
);

if (!existsSync(targetFile)) {
  console.log('[patch-wdk] Secret manager not found, skipping.');
  process.exit(0);
}

const original = readFileSync(targetFile, 'utf8');

// Already patched?
if (original.includes("require('crypto')") || original.includes("require('node:crypto')")) {
  console.log('[patch-wdk] Already patched, skipping.');
  process.exit(0);
}

// Replace bare-crypto with node:crypto
const patched = original.replace(
  "const bareCrypto = require('bare-crypto');",
  "const bareCrypto = require('crypto'); // patched by scripts/patch-wdk.js (bare-crypto → node:crypto)"
);

if (patched === original) {
  console.log('[patch-wdk] Could not find bare-crypto require line. Manual review needed.');
  process.exit(1);
}

writeFileSync(targetFile, patched, 'utf8');
console.log('[patch-wdk] Patched wdk-secret-manager: bare-crypto → node:crypto');
