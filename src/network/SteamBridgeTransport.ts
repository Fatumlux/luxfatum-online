import { makeEnvelope, type NetworkMessage } from "./messages";
import type { DisconnectCallback, MessageCallback, NetworkTransport } from "./NetworkTransport";

export interface SteamBridge {
  getLocalPeerId?: () => string | Promise<string>;
  connect: (peerId: string) => Promise<void> | void;
  disconnect: () => Promise<void> | void;
  send: (peerId: string, message: string) => Promise<void> | void;
  broadcast?: (message: string) => Promise<void> | void;
  onMessage: (callback: (fromPeerId: string, message: string) => void) => (() => void) | void;
  onDisconnect: (callback: (peerId: string, reason?: string) => void) => (() => void) | void;
  openInviteDialog?: (lobbyId?: string) => Promise<void> | void;
  createLobby?: () => Promise<string> | string;
  joinLobby?: (lobbyId: string) => Promise<void> | void;
}

function requireBridge(): SteamBridge {
  const bridge = window.luxfatumSteam;
  if (!bridge) throw new Error("Steam bridge is not available. Launch from the Steam desktop shell.");
  return bridge;
}

export class SteamBridgeTransport implements NetworkTransport {
  readonly localPeerId: string;
  private bridge: SteamBridge;
  private peers = new Set<string>();
  private messageCallbacks = new Set<MessageCallback>();
  private disconnectCallbacks = new Set<DisconnectCallback>();
  private removeMessageListener?: () => void;
  private removeDisconnectListener?: () => void;

  constructor(localPeerId = "steam-local", bridge: SteamBridge = requireBridge()) {
    this.localPeerId = localPeerId;
    this.bridge = bridge;
    const removeMessage = this.bridge.onMessage((fromPeerId, raw) => {
      const message = JSON.parse(raw) as NetworkMessage;
      this.peers.add(fromPeerId);
      const envelope = makeEnvelope(fromPeerId, message, this.localPeerId);
      for (const callback of this.messageCallbacks) callback(envelope);
    });
    const removeDisconnect = this.bridge.onDisconnect((peerId, reason) => {
      this.peers.delete(peerId);
      for (const callback of this.disconnectCallbacks) callback(peerId, reason);
    });
    this.removeMessageListener = removeMessage || undefined;
    this.removeDisconnectListener = removeDisconnect || undefined;
  }

  static isAvailable() {
    return typeof window !== "undefined" && !!window.luxfatumSteam;
  }

  static async createFromBridge() {
    const bridge = requireBridge();
    const localPeerId = await bridge.getLocalPeerId?.() || "steam-local";
    return new SteamBridgeTransport(localPeerId, bridge);
  }

  async connect(peerId: string) {
    await this.bridge.connect(peerId);
    this.peers.add(peerId);
  }

  async disconnect() {
    this.removeMessageListener?.();
    this.removeDisconnectListener?.();
    await this.bridge.disconnect();
    this.peers.clear();
  }

  async send(peerId: string, message: NetworkMessage) {
    await this.bridge.send(peerId, JSON.stringify(message));
  }

  async broadcast(message: NetworkMessage) {
    if (this.bridge.broadcast) {
      await this.bridge.broadcast(JSON.stringify(message));
      return;
    }
    await Promise.all([...this.peers].map(peerId => this.send(peerId, message)));
  }

  onMessage(callback: MessageCallback) {
    this.messageCallbacks.add(callback);
    return () => this.messageCallbacks.delete(callback);
  }

  onDisconnect(callback: DisconnectCallback) {
    this.disconnectCallbacks.add(callback);
    return () => this.disconnectCallbacks.delete(callback);
  }
}
