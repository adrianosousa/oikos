/**
 * Runtime-agnostic process access.
 *
 * Bare Runtime provides `bare-process` (must be imported).
 * Node.js has `process` as a global.
 *
 * This module exports a unified process interface that works on both.
 */
async function loadProcess() {
    // Check if Node.js process global exists
    if (typeof globalThis !== 'undefined' && 'process' in globalThis) {
        const gProcess = globalThis.process;
        if (gProcess && typeof gProcess.exit === 'function') {
            return gProcess;
        }
    }
    // Bare Runtime — import from bare-process
    const mod = await import('bare-process');
    return mod.default;
}
/** Process instance — resolved once at module load. */
export const proc = await loadProcess();
//# sourceMappingURL=process.js.map