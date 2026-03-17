/**
 * IPC Responder — stdout JSON-lines writer.
 *
 * Serializes IPCResponse objects as newline-delimited JSON
 * and writes them to a writable output stream.
 *
 * @security Responses must NEVER contain seed phrases, private keys,
 * or raw wallet state. Only structured results.
 */
export class IPCResponder {
    write;
    constructor(write) {
        this.write = write;
    }
    /** Send a response back to the Agent Brain. */
    send(response) {
        const line = JSON.stringify(response) + '\n';
        this.write(line);
    }
    /** Send an error response for a given request ID. */
    sendError(id, message) {
        this.send({
            id,
            type: 'error',
            payload: { message }
        });
    }
}
//# sourceMappingURL=responder.js.map