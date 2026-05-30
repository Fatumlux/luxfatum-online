import type { NetworkEnvelope, NetworkMessage } from "./messages";

export type MessageCallback = (envelope: NetworkEnvelope) => void;
export type DisconnectCallback = (peerId: string, reason?: string) => void;

export interface NetworkTransport {
  readonly localPeerId: string;
  connect(peerId: string): Promise<void>;
  disconnect(): Promise<void>;
  send(peerId: string, message: NetworkMessage): Promise<void>;
  broadcast(message: NetworkMessage): Promise<void>;
  onMessage(callback: MessageCallback): () => void;
  onDisconnect(callback: DisconnectCallback): () => void;
}
