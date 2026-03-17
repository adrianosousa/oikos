/**
 * IPC Responder — stdout JSON-lines writer.
 *
 * Serializes IPCResponse objects as newline-delimited JSON
 * and writes them to a writable output stream.
 *
 * @security Responses must NEVER contain seed phrases, private keys,
 * or raw wallet state. Only structured results.
 */
import type { IPCResponse } from './types.js';
export type WriteFunction = (data: string) => void;
export declare class IPCResponder {
    private readonly write;
    constructor(write: WriteFunction);
    /** Send a response back to the Agent Brain. */
    send(response: IPCResponse): void;
    /** Send an error response for a given request ID. */
    sendError(id: string, message: string): void;
}
//# sourceMappingURL=responder.d.ts.map