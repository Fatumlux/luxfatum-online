import { makeEnvelope, type NetworkEnvelope, type NetworkMessage } from "./messages";
import type { DisconnectCallback, MessageCallback, NetworkTransport } from "./NetworkTransport";

type HubPeer = {
  transport: LocalMockTransport;
  connectedPeers: Set<string>;
};

class LocalMockHub {
  peers = new Map<string, HubPeer>();

  register(transport: LocalMockTransport) {
    this.peers.set(transport.localPeerId, { transport, connectedPeers: new Set() });
  }

  connect(fromPeerId: string, toPeerId: string) {
    const from = this.peers.get(fromPeerId);
    const to = this.peers.get(toPeerId);
    if (!from || !to) throw new Error(`LocalMockTransport 找不到 peer：${toPeerId}`);
    from.connectedPeers.add(toPeerId);
    to.connectedPeers.add(fromPeerId);
  }

  send(fromPeerId: string, toPeerId: string, message: NetworkMessage) {
    const to = this.peers.get(toPeerId);
    if (!to) throw new Error(`LocalMockTransport 傳送失敗，peer 不存在：${toPeerId}`);
    to.transport.deliver(makeEnvelope(fromPeerId, message, toPeerId));
  }

  broadcast(fromPeerId: string, message: NetworkMessage) {
    const from = this.peers.get(fromPeerId);
    if (!from) return;
    for (const peerId of from.connectedPeers) this.send(fromPeerId, peerId, message);
  }

  disconnect(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    for (const otherPeerId of peer.connectedPeers) {
      const other = this.peers.get(otherPeerId);
      other?.connectedPeers.delete(peerId);
      other?.transport.notifyDisconnect(peerId, "local-disconnect");
    }
    peer.connectedPeers.clear();
  }
}

const defaultHub = new LocalMockHub();

export class LocalMockTransport implements NetworkTransport {
  private messageCallbacks = new Set<MessageCallback>();
  private disconnectCallbacks = new Set<DisconnectCallback>();

  constructor(public readonly localPeerId: string, private readonly hub = defaultHub) {
    this.hub.register(this);
  }

  async connect(peerId: string) {
    this.hub.connect(this.localPeerId, peerId);
  }

  async disconnect() {
    this.hub.disconnect(this.localPeerId);
  }

  async send(peerId: string, message: NetworkMessage) {
    this.hub.send(this.localPeerId, peerId, message);
  }

  async broadcast(message: NetworkMessage) {
    this.hub.broadcast(this.localPeerId, message);
  }

  onMessage(callback: MessageCallback) {
    this.messageCallbacks.add(callback);
    return () => this.messageCallbacks.delete(callback);
  }

  onDisconnect(callback: DisconnectCallback) {
    this.disconnectCallbacks.add(callback);
    return () => this.disconnectCallbacks.delete(callback);
  }

  deliver(envelope: NetworkEnvelope) {
    for (const callback of this.messageCallbacks) callback(envelope);
  }

  notifyDisconnect(peerId: string, reason?: string) {
    for (const callback of this.disconnectCallbacks) callback(peerId, reason);
  }
}

export function createLocalMockPair(hostPeerId = "host", clientPeerId = "client") {
  const hub = new LocalMockHub();
  const host = new LocalMockTransport(hostPeerId, hub);
  const client = new LocalMockTransport(clientPeerId, hub);
  return { host, client };
}
