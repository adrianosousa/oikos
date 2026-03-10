/**
 * Runtime-agnostic filesystem access.
 *
 * Bare Runtime provides `bare-fs` (bundled in the runtime).
 * Node.js provides built-in `fs`.
 * Both have compatible APIs for readFileSync / appendFileSync.
 *
 * This module tries bare-fs first (Bare Runtime), falls back to
 * Node.js fs. The detection happens once at module load via
 * top-level await.
 */

type ReadFileSyncFn = (path: string, encoding: 'utf-8') => string;
type AppendFileSyncFn = (path: string, data: string) => void;
type WriteFileSyncFn = (path: string, data: string, encoding: 'utf-8') => void;
type ExistsSyncFn = (path: string) => boolean;

interface FsSubset {
  readFileSync: ReadFileSyncFn;
  appendFileSync: AppendFileSyncFn;
  writeFileSync: WriteFileSyncFn;
  existsSync: ExistsSyncFn;
}

async function loadFs(): Promise<FsSubset> {
  try {
    // Bare Runtime — bare-fs is bundled in the runtime
    // bare-fs has these methods but the TS types are incomplete
    const mod = await import('bare-fs') as unknown as Record<string, unknown>;
    const resolved = mod['default'] ?? mod;
    const r = resolved as Record<string, unknown>;
    return {
      readFileSync: r['readFileSync'] as ReadFileSyncFn,
      appendFileSync: r['appendFileSync'] as AppendFileSyncFn,
      writeFileSync: r['writeFileSync'] as WriteFileSyncFn,
      existsSync: r['existsSync'] as ExistsSyncFn,
    };
  } catch {
    // Node.js — use built-in fs
    const mod = await import('fs');
    return {
      readFileSync: mod.readFileSync as ReadFileSyncFn,
      appendFileSync: mod.appendFileSync as AppendFileSyncFn,
      writeFileSync: mod.writeFileSync as WriteFileSyncFn,
      existsSync: mod.existsSync as ExistsSyncFn,
    };
  }
}

const fs = await loadFs();

export const readFileSync: ReadFileSyncFn = fs.readFileSync;
export const appendFileSync: AppendFileSyncFn = fs.appendFileSync;
export const writeFileSync: WriteFileSyncFn = fs.writeFileSync;
export const existsSync: ExistsSyncFn = fs.existsSync;
