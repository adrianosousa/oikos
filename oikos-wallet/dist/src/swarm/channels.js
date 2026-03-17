/**
 * Channel Manager — Protomux channels over Noise connections.
 *
 * For each peer connection, opens protomux channels:
 * - 'oikos/board' — public announcements + heartbeats
 * - 'oikos/room/{id}' — private negotiation per announcement
 * - 'oikos/feed' — lightweight data (price feeds, signals)
 *
 * Messages are JSON over c.raw encoding (not binary framing).
 * This is pragmatic for hackathon scope — messages are tiny JSON objects.
 *
 * Adapted from rgb-c-t/lib/session.js _setupAckChannel:
 * - Protomux.from(socket) to get/create muxer
 * - mux.createChannel({ protocol, messages: [{ encoding: c.raw, onmessage }] })
 * - channel.open() to initiate
 *
 * Key difference from rgb-c-t: no Hypercore replication, so we use
 * Protomux.from(socket) explicitly (not socket.userData).
 */
import Protomux from 'protomux';
import c from 'compact-encoding';
import b4a from 'b4a';
export class ChannelManager {
    handlers;
    peerChannels = new Map();
    constructor(handlers) {
        this.handlers = handlers;
    }
    /**
     * Set up channels on a new peer connection.
     * Called by SwarmDiscovery when a peer connects.
     */
    setupPeer(socket, remotePubkey) {
        const pubkeyHex = remotePubkey.toString('hex');
        // Get or create Protomux muxer for this socket
        // Adapted from rgb-c-t session.js: const mux = socket.userData
        // Since we don't replicate Hypercores, we use Protomux.from() directly
        const mux = Protomux.from(socket);
        const peer = {
            mux,
            board: null,
            rooms: new Map(),
            feed: null,
        };
        // Open board channel
        peer.board = this._openChannel(mux, 'oikos/board', remotePubkey, (buf) => {
            this._handleBoardMessage(buf, remotePubkey);
        });
        // Open feed channel
        peer.feed = this._openChannel(mux, 'oikos/feed', remotePubkey, (buf) => {
            this._handleFeedMessage(buf, remotePubkey);
        });
        this.peerChannels.set(pubkeyHex, peer);
    }
    /**
     * Open a room channel with a specific peer for private negotiation.
     */
    openRoomChannel(remotePubkey, roomId) {
        const pubkeyHex = remotePubkey.toString('hex');
        const peer = this.peerChannels.get(pubkeyHex);
        if (!peer)
            return;
        if (peer.rooms.has(roomId))
            return; // already open
        const protocol = `oikos/room/${roomId}`;
        const room = this._openChannel(peer.mux, protocol, remotePubkey, (buf) => {
            this._handleRoomMessage(roomId, buf, remotePubkey);
        });
        peer.rooms.set(roomId, room);
    }
    /**
     * Close a room channel with a specific peer.
     */
    closeRoomChannel(remotePubkey, roomId) {
        const pubkeyHex = remotePubkey.toString('hex');
        const peer = this.peerChannels.get(pubkeyHex);
        if (!peer)
            return;
        const room = peer.rooms.get(roomId);
        if (room) {
            const ch = room.channel;
            ch.close();
            peer.rooms.delete(roomId);
        }
    }
    /** Remove all channels for a disconnected peer */
    removePeer(remotePubkey) {
        const pubkeyHex = remotePubkey.toString('hex');
        this.peerChannels.delete(pubkeyHex);
    }
    // ── Send Methods ──
    /** Send a message on the board channel to a specific peer */
    sendBoard(remotePubkey, msg) {
        return this._send(remotePubkey, 'board', msg);
    }
    /** Send a message on the board channel to ALL peers */
    broadcastBoard(msg) {
        let sent = 0;
        for (const [, peer] of this.peerChannels) {
            if (peer.board) {
                const m = peer.board.message;
                try {
                    m.send(b4a.from(JSON.stringify(msg)));
                    sent++;
                }
                catch {
                    // Peer may have disconnected
                }
            }
        }
        return sent;
    }
    /** Send a room message to a specific peer */
    sendRoom(remotePubkey, roomId, msg) {
        const pubkeyHex = remotePubkey.toString('hex');
        const peer = this.peerChannels.get(pubkeyHex);
        if (!peer)
            return false;
        const room = peer.rooms.get(roomId);
        if (!room)
            return false;
        try {
            const m = room.message;
            m.send(b4a.from(JSON.stringify(msg)));
            return true;
        }
        catch {
            return false;
        }
    }
    /** Broadcast a room message to all peers in a room */
    broadcastRoom(roomId, msg) {
        let sent = 0;
        for (const [, peer] of this.peerChannels) {
            const room = peer.rooms.get(roomId);
            if (room) {
                try {
                    const m = room.message;
                    m.send(b4a.from(JSON.stringify(msg)));
                    sent++;
                }
                catch {
                    // Peer may have disconnected
                }
            }
        }
        return sent;
    }
    /** Send a feed message to a specific peer */
    sendFeed(remotePubkey, msg) {
        return this._send(remotePubkey, 'feed', msg);
    }
    /** Get all connected peer pubkeys */
    getConnectedPeers() {
        return Array.from(this.peerChannels.keys());
    }
    // ── Private Helpers ──
    /** Create a protomux channel with JSON message handling */
    _openChannel(mux, protocol, _remotePubkey, onMessage) {
        // Adapted from rgb-c-t _setupAckChannel pattern
        const channel = mux.createChannel({
            protocol,
            id: null,
            unique: true,
            messages: [
                {
                    encoding: c.raw,
                    onmessage: (buf) => {
                        onMessage(buf);
                    },
                },
            ],
            onclose: () => {
                // Channel closed — cleanup handled by removePeer
            },
        });
        const message = channel.messages[0];
        channel.open();
        return { channel, message };
    }
    /** Send a message on a named channel type */
    _send(remotePubkey, channelType, msg) {
        const pubkeyHex = remotePubkey.toString('hex');
        const peer = this.peerChannels.get(pubkeyHex);
        if (!peer)
            return false;
        const ch = channelType === 'board' ? peer.board : peer.feed;
        if (!ch)
            return false;
        try {
            const m = ch.message;
            m.send(b4a.from(JSON.stringify(msg)));
            return true;
        }
        catch {
            return false;
        }
    }
    /** Parse and dispatch a board message */
    _handleBoardMessage(buf, fromPubkey) {
        try {
            const text = b4a.toString(buf, 'utf-8');
            const msg = JSON.parse(text);
            if (!msg.type)
                return; // invalid
            this.handlers.onBoardMessage(msg, fromPubkey);
        }
        catch {
            // Invalid JSON — drop silently (same as IPC listener pattern)
        }
    }
    /** Parse and dispatch a room message */
    _handleRoomMessage(roomId, buf, fromPubkey) {
        try {
            const text = b4a.toString(buf, 'utf-8');
            const msg = JSON.parse(text);
            if (!msg.type)
                return;
            this.handlers.onRoomMessage(roomId, msg, fromPubkey);
        }
        catch {
            // Invalid JSON — drop silently
        }
    }
    /** Parse and dispatch a feed message */
    _handleFeedMessage(buf, fromPubkey) {
        try {
            const text = b4a.toString(buf, 'utf-8');
            const msg = JSON.parse(text);
            if (!msg.type)
                return;
            this.handlers.onFeedMessage(msg, fromPubkey);
        }
        catch {
            // Invalid JSON — drop silently
        }
    }
}
//# sourceMappingURL=channels.js.map