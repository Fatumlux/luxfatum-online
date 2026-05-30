import type { LobbyPlayer, LobbyState, PlayerRole, RoomState } from "./messages";

export interface LobbyManagerOptions {
  gameVersion: string;
  rulesetVersion: string;
  lobbyId?: string;
}

function createLobbyId() {
  return `LF-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function makePlayer(playerId: string, role: PlayerRole): LobbyPlayer {
  return {
    playerId,
    role,
    ready: false,
    connected: true
  };
}

export class LobbyManager {
  private lobby: LobbyState | null = null;

  constructor(private readonly options: LobbyManagerOptions) {}

  createLobby(hostPlayerId: string) {
    const lobbyId = this.options.lobbyId || createLobbyId();
    this.lobby = {
      lobbyId,
      hostPlayerId,
      guestPlayerId: null,
      players: {
        [hostPlayerId]: makePlayer(hostPlayerId, "host")
      },
      roomState: "waiting",
      gameVersion: this.options.gameVersion,
      rulesetVersion: this.options.rulesetVersion
    };
    return this.snapshot();
  }

  joinLobby(playerId: string) {
    const lobby = this.requireLobby();
    if (lobby.guestPlayerId && lobby.guestPlayerId !== playerId) {
      throw new Error("房間已滿。");
    }
    lobby.guestPlayerId = playerId;
    lobby.players[playerId] = makePlayer(playerId, "guest");
    lobby.roomState = this.bothPlayersReady(lobby) ? "ready" : "waiting";
    return this.snapshot();
  }

  leaveLobby(playerId: string) {
    const lobby = this.requireLobby();
    if (playerId === lobby.hostPlayerId) {
      lobby.roomState = "finished";
      for (const player of Object.values(lobby.players)) player.connected = false;
      return this.snapshot();
    }
    if (playerId === lobby.guestPlayerId) lobby.guestPlayerId = null;
    if (lobby.players[playerId]) lobby.players[playerId].connected = false;
    lobby.roomState = "waiting";
    return this.snapshot();
  }

  setHost(playerId: string) {
    const lobby = this.requireLobby();
    if (!lobby.players[playerId]) throw new Error("玩家不在房間內。");
    const oldHost = lobby.players[lobby.hostPlayerId];
    if (oldHost) oldHost.role = "guest";
    lobby.hostPlayerId = playerId;
    lobby.players[playerId].role = "host";
    if (lobby.guestPlayerId === playerId) {
      lobby.guestPlayerId = Object.keys(lobby.players).find(id => id !== playerId && lobby.players[id].connected) || null;
    }
    return this.snapshot();
  }

  setReady(playerId: string, ready: boolean) {
    const lobby = this.requireLobby();
    if (!lobby.players[playerId]) throw new Error("玩家不在房間內。");
    lobby.players[playerId].ready = ready;
    lobby.roomState = this.bothPlayersReady(lobby) ? "ready" : "waiting";
    return this.snapshot();
  }

  setRoomState(roomState: RoomState) {
    const lobby = this.requireLobby();
    lobby.roomState = roomState;
    return this.snapshot();
  }

  syncLobbyState(next: LobbyState) {
    this.lobby = structuredClone(next);
    return this.snapshot();
  }

  get playerIds() {
    return Object.keys(this.requireLobby().players);
  }

  snapshot(): LobbyState {
    return structuredClone(this.requireLobby());
  }

  private requireLobby() {
    if (!this.lobby) throw new Error("尚未建立房間。");
    return this.lobby;
  }

  private bothPlayersReady(lobby: LobbyState) {
    return !!lobby.guestPlayerId
      && !!lobby.players[lobby.hostPlayerId]?.ready
      && !!lobby.players[lobby.guestPlayerId]?.ready;
  }
}
