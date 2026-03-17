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
export declare const readFileSync: ReadFileSyncFn;
export declare const appendFileSync: AppendFileSyncFn;
export declare const writeFileSync: WriteFileSyncFn;
export declare const existsSync: ExistsSyncFn;
export {};
//# sourceMappingURL=fs.d.ts.map