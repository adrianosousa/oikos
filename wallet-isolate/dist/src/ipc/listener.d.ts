/**
 * IPC Listener — stdin JSON-lines reader with schema validation.
 *
 * Reads newline-delimited JSON from stdin, validates each message
 * against the IPCRequest schema. Malformed messages are silently
 * dropped and logged to the audit trail.
 *
 * @security This module is a trust boundary. Every byte from stdin
 * is untrusted input from the Agent Brain process.
 */
import { type IPCRequest } from './types.js';
export type MessageHandler = (request: IPCRequest) => void;
export type MalformedHandler = (line: string, error: string) => void;
export declare class IPCListener {
    private buffer;
    private readonly onMessage;
    private readonly onMalformed;
    constructor(onMessage: MessageHandler, onMalformed: MalformedHandler);
    /**
     * Feed raw data from stdin into the listener.
     * Processes complete lines and buffers partial input.
     */
    feed(chunk: string): void;
    private processLine;
}
//# sourceMappingURL=listener.d.ts.map