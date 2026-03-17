/**
 * Runtime-agnostic process access.
 *
 * Bare Runtime provides `bare-process` (must be imported).
 * Node.js has `process` as a global.
 *
 * This module exports a unified process interface that works on both.
 */
/** Minimal process interface — only what wallet-isolate actually uses. */
export interface RuntimeProcess {
    env: Record<string, string | undefined>;
    stdin: {
        setEncoding(encoding: string): void;
        on(event: 'data', handler: (chunk: string) => void): void;
        on(event: 'end', handler: () => void): void;
    };
    stdout: {
        write(data: string): boolean;
    };
    exit(code?: number): never;
    on(event: 'SIGTERM' | 'SIGINT', handler: () => void): void;
}
/** Process instance — resolved once at module load. */
export declare const proc: RuntimeProcess;
//# sourceMappingURL=process.d.ts.map