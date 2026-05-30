import type { GameState } from "../types";

export type RoomState = "waiting" | "ready" | "drafting" | "battle" | "finished";
export type PlayerRole = "host" | "guest";
export type ActionCommandType = "attack" | "skill" | "defend" | "rest";

export interface LobbyPlayer {
  playerId: string;
  role: PlayerRole;
  ready: boolean;
  connected: boolean;
}

export interface LobbyState {
  lobbyId: string;
  hostPlayerId: string;
  guestPlayerId: string | null;
  players: Record<string, LobbyPlayer>;
  roomState: RoomState;
  gameVersion: string;
  rulesetVersion: string;
}

export interface NetworkEnvelope<T extends NetworkMessage = NetworkMessage> {
  fromPlayerId: string;
  toPlayerId?: string;
  sentAt: number;
  message: T;
}

export interface VersionPayload {
  gameVersion: string;
  rulesetVersion: string;
}

export interface ActionCommandMessage {
  type: "ACTION_COMMAND";
  clientActionId: string;
  turn: number;
  actorId: string;
  actionType: ActionCommandType;
  skillId: string | null;
  targetIds: string[];
  useResonance: boolean;
  useJudgement: boolean;
  judgementType: string | null;
}

export interface ActionEvent {
  type: string;
  message?: string;
  payload?: Record<string, unknown>;
}

export interface ActionResultMessage {
  type: "ACTION_RESULT";
  clientActionId: string;
  legal: boolean;
  turn?: number;
  actorId?: string;
  events?: ActionEvent[];
  updatedState?: GameState;
  stateHash?: string;
  reason?: string;
}

export type NetworkMessage =
  | { type: "LOBBY_CREATED"; lobby: LobbyState }
  | { type: "PLAYER_JOINED"; lobby: LobbyState; playerId: string }
  | { type: "PLAYER_LEFT"; lobby: LobbyState; playerId: string }
  | { type: "READY_STATE_CHANGED"; lobby: LobbyState; playerId: string; ready: boolean }
  | ({ type: "VERSION_CHECK"; playerId: string } & VersionPayload)
  | ({ type: "VERSION_MISMATCH"; playerId: string; expected: VersionPayload; received: VersionPayload })
  | { type: "DRAFT_PICK_COMMAND"; clientActionId: string; playerId: string; characterId: string }
  | { type: "DRAFT_PICK_RESULT"; clientActionId: string; legal: boolean; playerId: string; characterId: string; updatedState?: GameState; stateHash?: string; reason?: string }
  | { type: "BATTLE_START"; updatedState: GameState; stateHash: string }
  | ActionCommandMessage
  | ActionResultMessage
  | { type: "RNG_RESULT"; clientActionId?: string; value: number; label?: string }
  | { type: "GAME_STATE_SYNC"; updatedState: GameState; stateHash: string; reason?: string }
  | { type: "GAME_OVER"; winner: string | null; updatedState: GameState; stateHash: string }
  | { type: "ERROR_MESSAGE"; code: string; message: string; clientActionId?: string }
  | { type: "DISCONNECT_NOTICE"; playerId: string; reason: string };

export function makeEnvelope<T extends NetworkMessage>(fromPlayerId: string, message: T, toPlayerId?: string): NetworkEnvelope<T> {
  return {
    fromPlayerId,
    toPlayerId,
    sentAt: Date.now(),
    message
  };
}
