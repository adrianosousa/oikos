/**
 * Swarm Discovery Manager — Hyperswarm DHT integration.
 *
 * Manages two layers:
 * - Board: single shared topic for public announcements
 * - Rooms: per-announcement topics for private negotiation
 *
 * Adapted from rgb-c-t/lib/session.js:
 * - swarm.join() + discovery.flushed() pattern (lines 160-196)
 * - Firewall function (lines 126-148)
 * - Connection handling (lines 430-470)
 *
 * Key difference: rgb-c-t has 1 session = 1 connection.
 * Oikos has N board peers + M room peers, all tracked.
 */

import Hyperswarm from 'hyperswarm';
import b4a from 'b4a';
import { deriveBoardTopic, deriveRoomTopic } from './topic.js';
import type { AgentKeypair } from './identity.js';

export interface DiscoveryConfig {
  swarmId: string;
  keypair: AgentKeypair;
  /** Injected HyperDHT instance for testnet (optional) */
  dht?: unknown;
  /**
   * Relay peer public key (hex) for connections that can't holepunch.
   * When holepunching fails (Docker containers, restrictive NATs, double-randomized NATs),
   * Hyperswarm automatically relays through this peer.
   * Without this, failed holepunches have NO fallback — connections silently die.
   */
  relayPubkey?: string;
}

export interface PeerConnection {
  socket: unknown;
  remotePubkey: Buffer;
  isBoard: boolean;
  roomId?: string;
}

type ConnectionHandler = (socket: unknown, remotePubkey: Buffer, info: { isBoard: boolean; roomId?: string }) => void;
type DisconnectHandler = (remotePubkey: Buffer) => void;

export class SwarmDiscovery {
  private swarm: Hyperswarm;
  private config: DiscoveryConfig;
  private boardTopic: Buffer;
  private boardDiscovery: unknown | null = null;
  private roomDiscoveries: Map<string, unknown> = new Map();
  private peers: Map<string, PeerConnection> = new Map();
  private connectionHandlers: ConnectionHandler[] = [];
  private disconnectHandlers: DisconnectHandler[] = [];
  private destroyed = false;

  constructor(config: DiscoveryConfig) {
    this.config = config;
    this.boardTopic = deriveBoardTopic(config.swarmId);

    // Create Hyperswarm instance with our keypair
    // Adapted from rgb-c-t/lib/session.js constructor
    const swarmOpts: Record<string, unknown> = {
      keyPair: config.keypair,
    };

    // Inject DHT for testnet (rgb-wallet-pear pattern: hyperdht/testnet)
    if (config.dht) {
      swarmOpts['dht'] = config.dht;
    }

    // Relay support: when holepunching fails (Docker, restrictive NAT, etc.),
    // Hyperswarm automatically relays through this peer.
    // The relayThrough function is called with (force, swarm):
    //   - force=false on first attempt: only relay if NAT is randomized
    //   - force=true on retry after HOLEPUNCH_ABORTED/DOUBLE_RANDOMIZED_NATS: always relay
    // Without this, failed holepunches have NO fallback.
    if (config.relayPubkey) {
      const relayBuf = b4a.from(config.relayPubkey, 'hex');
      swarmOpts['relayThrough'] = relayBuf;
      console.error(`[swarm] Relay configured: ${config.relayPubkey.slice(0, 12)}...`);
    }

    this.swarm = new Hyperswarm(swarmOpts);

    // Global connection handler
    this.swarm.on('connection', (socket: unknown, peerInfo: unknown) => {
      this._onConnection(socket, peerInfo);
    });
  }

  /** Join the board topic for public discovery */
  async joinBoard(): Promise<void> {
    if (this.destroyed) return;

    // Adapted from rgb-c-t session.open() — join + flushed
    const discovery = this.swarm.join(this.boardTopic, {
      server: true,
      client: true,
    });

    await discovery.flushed();
    this.boardDiscovery = discovery;
  }

  /** Join a room topic for private negotiation */
  async joinRoom(announcementId: string, creatorPubkey: Buffer): Promise<void> {
    if (this.destroyed) return;
    if (this.roomDiscoveries.has(announcementId)) return; // already joined

    const roomTopic = deriveRoomTopic(announcementId, creatorPubkey);
    const discovery = this.swarm.join(roomTopic, {
      server: true,
      client: true,
    });

    await discovery.flushed();
    this.roomDiscoveries.set(announcementId, discovery);
  }

  /** Leave a room topic */
  async leaveRoom(announcementId: string): Promise<void> {
    const discovery = this.roomDiscoveries.get(announcementId) as
      | { destroy(): Promise<void> }
      | undefined;
    if (discovery) {
      await discovery.destroy();
      this.roomDiscoveries.delete(announcementId);
    }
  }

  /** Register connection handler */
  onConnection(handler: ConnectionHandler): void {
    this.connectionHandlers.push(handler);
  }

  /** Register disconnect handler */
  onDisconnect(handler: DisconnectHandler): void {
    this.disconnectHandlers.push(handler);
  }

  /**
   * Explicitly connect to a peer by Noise public key.
   * Bypasses topic-based DHT discovery — uses DHT routing to find a direct path.
   * Auto-reconnects on failure. Use leavePeer() to stop.
   *
   * Use case: when you learn a peer's pubkey (from a board announcement, config, etc.)
   * and want a guaranteed connection attempt regardless of topic membership.
   */
  joinPeer(pubkeyHex: string): void {
    if (this.destroyed) return;
    const pubkeyBuf = b4a.from(pubkeyHex, 'hex');
    // Don't join ourselves
    if (b4a.equals(pubkeyBuf, this.config.keypair.publicKey)) return;
    this.swarm.joinPeer(pubkeyBuf);
    console.error(`[swarm] joinPeer: ${pubkeyHex.slice(0, 12)}...`);
  }

  /** Stop explicitly connecting to a peer. Does NOT close existing connection. */
  leavePeer(pubkeyHex: string): void {
    if (this.destroyed) return;
    this.swarm.leavePeer(b4a.from(pubkeyHex, 'hex'));
  }

  /** Get all connected peer pubkeys */
  getPeers(): Map<string, PeerConnection> {
    return new Map(this.peers);
  }

  /** Graceful shutdown */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    // Leave all rooms
    for (const [id] of this.roomDiscoveries) {
      await this.leaveRoom(id);
    }

    // Leave board
    if (this.boardDiscovery) {
      const disc = this.boardDiscovery as { destroy(): Promise<void> };
      await disc.destroy();
    }

    // Destroy swarm
    await this.swarm.destroy();
  }

  /** Handle new peer connection */
  private _onConnection(socket: unknown, _peerInfo: unknown): void {
    // Extract remote public key from the Noise handshake
    const sock = socket as {
      remotePublicKey: Buffer;
      on(event: string, handler: (...args: unknown[]) => void): void;
    };
    const remotePubkey = sock.remotePublicKey;

    if (!remotePubkey) return;

    // Block self-connections (adapted from rgb-c-t auth.js firewall)
    if (b4a.equals(remotePubkey, this.config.keypair.publicKey)) {
      return;
    }

    const pubkeyHex = remotePubkey.toString('hex');

    // Determine if this is a board or room connection
    // For now, treat all connections as board connections.
    // Room connections are identified when a room channel is opened.
    const isBoard = true;

    const conn: PeerConnection = {
      socket,
      remotePubkey,
      isBoard,
    };

    this.peers.set(pubkeyHex, conn);

    // Notify handlers
    for (const handler of this.connectionHandlers) {
      handler(socket, remotePubkey, { isBoard, roomId: undefined });
    }

    // Handle disconnect
    sock.on('close', () => {
      this.peers.delete(pubkeyHex);
      for (const handler of this.disconnectHandlers) {
        handler(remotePubkey);
      }
    });

    sock.on('error', () => {
      this.peers.delete(pubkeyHex);
    });
  }
}
