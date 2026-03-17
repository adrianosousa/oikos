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
async function loadFs() {
    try {
        // Bare Runtime — bare-fs is bundled in the runtime
        // bare-fs has these methods but the TS types are incomplete
        const mod = await import('bare-fs');
        const resolved = mod['default'] ?? mod;
        const r = resolved;
        return {
            readFileSync: r['readFileSync'],
            appendFileSync: r['appendFileSync'],
            writeFileSync: r['writeFileSync'],
            existsSync: r['existsSync'],
        };
    }
    catch {
        // Node.js — use built-in fs
        const mod = await import('fs');
        return {
            readFileSync: mod.readFileSync,
            appendFileSync: mod.appendFileSync,
            writeFileSync: mod.writeFileSync,
            existsSync: mod.existsSync,
        };
    }
}
const fs = await loadFs();
export const readFileSync = fs.readFileSync;
export const appendFileSync = fs.appendFileSync;
export const writeFileSync = fs.writeFileSync;
export const existsSync = fs.existsSync;
//# sourceMappingURL=fs.js.map