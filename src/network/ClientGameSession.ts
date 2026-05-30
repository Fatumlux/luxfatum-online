import type { GameState } from "../types";
import type { NetworkTransport } from "./NetworkTransport";
import type { ActionCommandMessage, ActionResultMessage, LobbyState, NetworkEnvelope, NetworkMessage, VersionPayload } from "./messages";
import { stateHash } from "./stateHash";

export interface ClientGameSessionOptions extends VersionPayload {
  playerId: string;
  hostPlayerId: string;
  transport: NetworkTransport;
}

export type ClientSessionStatus = "idle" | "connecting" | "waiting-host" | "synced" | "version-mismatch" | "disconnected";

export class ClientGameSession {
  status: ClientSessionStatus = "idle";
  lobby: LobbyState | null = null;
  gameState: GameState | null = null;
  lastStateHash = "";
  waitingActionIds = new Set<string>();
  lastError = "";

  private messageListeners = new Set<(message: NetworkMessage) => void>();
  private readonly unsubscribeMessage: () => void;
  private readonly unsubscribeDisconnect: () => void;

  constructor(private readonly options: ClientGameSessionOptions) {
    this.unsubscribeMessage = options.transport.onMessage(envelope => this.handleMessage(envelope));
    this.unsubscribeDisconnect = options.transport.onDisconnect((peerId, reason) => this.handleDisconnect(peerId, reason));
  }

  async connect() {
    this.status = "connecting";
    await this.options.transport.connect(this.options.hostPlayerId);
    await this.options.transport.send(this.options.hostPlayerId, {
      type: "VERSION_CHECK",
      playerId: this.options.playerId,
      gameVersion: this.options.gameVersion,
      rulesetVersion: this.options.rulesetVersion
    });
    this.status = "waiting-host";
  }

  async disconnect() {
    this.status = "disconnected";
    this.unsubscribeMessage();
    this.unsubscribeDisconnect();
    await this.options.transport.disconnect();
  }

  async sendDraftPick(characterId: string) {
    const clientActionId = this.actionId("draft");
    this.waitingActionIds.add(clientActionId);
    await this.options.transport.send(this.options.hostPlayerId, {
      type: "DRAFT_PICK_COMMAND",
      clientActionId,
      playerId: this.options.playerId,
      characterId
    });
    return clientActionId;
  }

  async sendAction(command: Omit<ActionCommandMessage, "type" | "clientActionId"> & { clientActionId?: string }) {
    const clientActionId = command.clientActionId || this.actionId("action");
    this.waitingActionIds.add(clientActionId);
    await this.options.transport.send(this.options.hostPlayerId, {
      type: "ACTION_COMMAND",
      clientActionId,
      turn: command.turn,
      actorId: command.actorId,
      actionType: command.actionType,
      skillId: command.skillId,
      targetIds: command.targetIds,
      useResonance: command.useResonance,
      useJudgement: command.useJudgement,
      judgementType: command.judgementType
    });
    return clientActionId;
  }

  onMessage(callback: (message: NetworkMessage) => void) {
    this.messageListeners.add(callback);
    return () => this.messageListeners.delete(callback);
  }

  private handleMessage(envelope: NetworkEnvelope) {
    const message = envelope.message;
    this.emit(message);
    if (message.type === "VERSION_MISMATCH") {
      this.status = "version-mismatch";
      this.lastError = `版本不一致：Host ${message.expected.gameVersion}/${message.expected.rulesetVersion}`;
      return;
    }
    if (message.type === "PLAYER_JOINED" || message.type === "PLAYER_LEFT" || message.type === "READY_STATE_CHANGED" || message.type === "LOBBY_CREATED") {
      this.lobby = message.lobby;
    }
    if (message.type === "DRAFT_PICK_RESULT") {
      this.waitingActionIds.delete(message.clientActionId);
      if (!message.legal) this.lastError = message.reason || "選角不合法。";
      if (message.updatedState && message.stateHash) this.applyHostState(message.updatedState, message.stateHash);
    }
    if (message.type === "BATTLE_START" || message.type === "GAME_STATE_SYNC" || message.type === "GAME_OVER") {
      this.applyHostState(message.updatedState, message.stateHash);
    }
    if (message.type === "ACTION_RESULT") this.handleActionResult(message);
    if (message.type === "ERROR_MESSAGE") this.lastError = message.message;
    if (message.type === "DISCONNECT_NOTICE") {
      this.status = "disconnected";
      this.lastError = message.reason;
    }
  }

  private handleActionResult(message: ActionResultMessage) {
    this.waitingActionIds.delete(message.clientActionId);
    if (!message.legal) {
      this.lastError = message.reason || "操作不合法。";
      return;
    }
    if (message.updatedState && message.stateHash) this.applyHostState(message.updatedState, message.stateHash);
  }

  private applyHostState(state: GameState, hash: string) {
    this.gameState = structuredClone(state);
    this.lastStateHash = hash;
    this.status = "synced";
    if (stateHash(this.gameState) !== hash) {
      this.lastError = "本地 stateHash 與 Host 不一致，已等待下一次 GAME_STATE_SYNC。";
    }
  }

  private handleDisconnect(peerId: string, reason?: string) {
    if (peerId !== this.options.hostPlayerId) return;
    this.status = "disconnected";
    this.lastError = reason || "Host 已離開，房間關閉。";
    this.gameState = null;
  }

  private emit(message: NetworkMessage) {
    for (const listener of this.messageListeners) listener(message);
  }

  private actionId(prefix: string) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
