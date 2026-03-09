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
