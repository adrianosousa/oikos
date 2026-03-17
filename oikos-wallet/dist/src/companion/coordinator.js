/**
 * Companion Coordinator — P2P Human-Agent Channel.
 *
 * Manages the Hyperswarm connection between the Oikos app and
 * the owner's companion app. Uses protomux infrastructure.
 *
 * Auth: Owner Ed25519 pubkey verified via Noise handshake.
 * Only the owner can connect as a companion.
 *
 * Design constraint: Companion NEVER talks to Wallet Isolate directly.
 * Instructions from the companion are queued for any connected agent to read.
 */
import Hyperswarm from 'hyperswarm';
import Protomux from 'protomux';
import c from 'compact-encoding';
import b4a from 'b4a';
import sodium from 'sodium-universal';
export class CompanionCoordinator {
    stateProvider;
    swarm;
    config;
    hyperswarm = null;
    companionChannel = null;
    ownerPubkeyBuf;
    companionTopic;
    updateInterval = null;
    connected = false;
    started = false;
    /** Instruction handler — set by main.ts to queue instructions */
    onInstructionHandler = null;
    /** Chat handler — set by main.ts to forward to brain and get reply */
    onChatHandler = null;
    constructor(_wallet, stateProvider, config, swarm) {
        this.stateProvider = stateProvider;
        this.config = config;
        this.swarm = swarm;
        this.ownerPubkeyBuf = Buffer.from(config.ownerPubkey, 'hex');
        // Derive companion topic: BLAKE2b-256("oikos-companion-v0", ownerPubkey)
        this.companionTopic = b4a.alloc(32);
        sodium.crypto_generichash(this.companionTopic, b4a.from(`oikos-companion-v0:${config.topicSeed}`), this.ownerPubkeyBuf);
    }
    /** Register instruction handler */
    onInstruction(handler) {
        this.onInstructionHandler = handler;
    }
    /** Register chat handler — called when instruction arrives, forwards to brain, returns reply */
    onChat(handler) {
        this.onChatHandler = handler;
    }
    /** Start listening for companion connections */
    async start() {
        if (this.started)
            return;
        const { loadOrCreateKeypair } = await import('../swarm/identity.js');
        const keypair = loadOrCreateKeypair(this.config.keypairPath);
        const opts = { keyPair: keypair };
        if (this.config.dht)
            opts['dht'] = this.config.dht;
        this.hyperswarm = new Hyperswarm(opts);
        this.hyperswarm.on('connection', (socket) => {
            this._onConnection(socket);
        });
        const discovery = this.hyperswarm.join(this.companionTopic, {
            server: true,
            client: false,
        });
        await discovery.flushed();
        this.updateInterval = setInterval(() => {
            void this._pushStateUpdate();
        }, this.config.updateIntervalMs);
        this.started = true;
        console.error(`[companion] Listening. Topic: ${this.companionTopic.toString('hex').slice(0, 16)}...`);
        console.error(`[companion] Authorized owner: ${this.config.ownerPubkey.slice(0, 16)}...`);
    }
    /** Send a message to the connected companion */
    send(msg) {
        if (!this.connected || !this.companionChannel)
            return false;
        try {
            const m = this.companionChannel.message;
            m.send(b4a.from(JSON.stringify(msg)));
            return true;
        }
        catch {
            return false;
        }
    }
    /** Notify companion of an execution result */
    notifyExecution(result) {
        const msg = {
            type: 'execution_notify',
            result,
            timestamp: Date.now(),
        };
        this.send(msg);
    }
    /** Check if companion is connected */
    isConnected() {
        return this.connected;
    }
    /** Graceful shutdown */
    async stop() {
        if (this.updateInterval)
            clearInterval(this.updateInterval);
        if (this.hyperswarm)
            await this.hyperswarm.destroy();
        this.started = false;
        this.connected = false;
        console.error('[companion] Stopped.');
    }
    // ── Private ──
    _onConnection(socket) {
        const sock = socket;
        const remotePubkey = sock.remotePublicKey;
        if (!remotePubkey)
            return;
        // CRITICAL: Only allow the authorized owner
        if (!b4a.equals(remotePubkey, this.ownerPubkeyBuf)) {
            console.error(`[companion] Rejected unauthorized: ${remotePubkey.toString('hex').slice(0, 16)}...`);
            const closeable = socket;
            closeable.destroy();
            return;
        }
        console.error(`[companion] Owner connected: ${remotePubkey.toString('hex').slice(0, 16)}...`);
        const mux = Protomux.from(socket);
        const channel = mux.createChannel({
            protocol: 'oikos/companion',
            id: null,
            unique: true,
            messages: [{
                    encoding: c.raw,
                    onmessage: (buf) => {
                        this._handleMessage(buf);
                    },
                }],
            onclose: () => {
                console.error('[companion] Owner disconnected.');
                this.connected = false;
                this.companionChannel = null;
            },
        });
        const message = channel.messages[0];
        channel.open();
        this.companionChannel = { channel, message };
        this.connected = true;
        sock.on('close', () => {
            this.connected = false;
            this.companionChannel = null;
        });
        void this._pushStateUpdate();
    }
    _handleMessage(buf) {
        try {
            const text = b4a.toString(buf, 'utf-8');
            const msg = JSON.parse(text);
            switch (msg.type) {
                case 'instruction':
                    console.error(`[companion] Instruction: "${msg.text}"`);
                    if (this.onInstructionHandler) {
                        this.onInstructionHandler(msg.text);
                    }
                    // Forward to brain and send reply back via protomux
                    if (this.onChatHandler) {
                        this.onChatHandler(msg.text).then((result) => {
                            if (result) {
                                const reply = {
                                    type: 'chat_reply',
                                    text: result.reply,
                                    brainName: result.brainName,
                                    timestamp: Date.now(),
                                };
                                this.send(reply);
                            }
                        }).catch((err) => {
                            console.error(`[companion] Chat handler error: ${err instanceof Error ? err.message : String(err)}`);
                        });
                    }
                    break;
                case 'approval_response':
                    console.error(`[companion] Approval: ${msg.proposalId} → ${msg.approved ? 'APPROVED' : 'REJECTED'}`);
                    break;
                case 'ping':
                    void this._pushStateUpdate();
                    break;
                default:
                    console.error(`[companion] Unknown message type: ${msg.type}`);
            }
        }
        catch {
            console.error('[companion] Failed to parse message');
        }
    }
    async _pushStateUpdate() {
        if (!this.connected)
            return;
        // Balance update (from wallet IPC, not brain)
        try {
            const balances = await this.stateProvider.getBalances();
            const balanceMsg = {
                type: 'balance_update',
                balances,
                timestamp: Date.now(),
            };
            this.send(balanceMsg);
        }
        catch { /* wallet may not be ready */ }
        // Agent reasoning — no agent connected, send stub
        const reasoningMsg = {
            type: 'agent_reasoning',
            status: 'idle',
            reasoning: '',
            decision: '',
            timestamp: Date.now(),
        };
        this.send(reasoningMsg);
        // Policy update (from wallet IPC)
        try {
            const policies = await this.stateProvider.getPolicies();
            const policyMsg = {
                type: 'policy_update',
                policies,
                timestamp: Date.now(),
            };
            this.send(policyMsg);
        }
        catch { /* wallet may not be ready */ }
        // Swarm status (with full data for UI rendering)
        if (this.swarm) {
            const swarmState = this.swarm.getState();
            const swarmMsg = {
                type: 'swarm_status',
                peersConnected: swarmState.boardPeers.length,
                activeRooms: swarmState.activeRooms.length,
                announcements: swarmState.announcements.length,
                boardPeers: swarmState.boardPeers.map((p) => ({
                    name: p.name, pubkey: p.pubkey, reputation: p.reputation,
                })),
                announcementList: swarmState.announcements.map((a) => ({
                    id: a.id, title: a.title, category: a.category, agentName: a.agentName,
                    description: a.description, priceRange: a.priceRange,
                    reputation: a.reputation, timestamp: a.timestamp,
                })),
                roomList: swarmState.activeRooms.map((r) => ({
                    announcementId: r.announcementId, status: r.status,
                    announcement: { title: r.announcement?.title ?? 'Room' },
                    bids: r.bids?.length ?? 0,
                })),
                identity: swarmState.identity ? { name: swarmState.identity.name, reputation: swarmState.identity.reputation } : undefined,
                economics: {
                    totalRevenue: swarmState.economics.totalRevenue,
                    totalCosts: swarmState.economics.totalCosts,
                    sustainabilityScore: swarmState.economics.sustainabilityScore,
                    dealsCompleted: swarmState.economics.completedTasks,
                },
                timestamp: Date.now(),
            };
            this.send(swarmMsg);
        }
    }
}
//# sourceMappingURL=coordinator.js.map