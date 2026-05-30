import { CHARACTERS } from "../data/characters";
import {
  RULES,
  STATUS,
  attack,
  buildQueue,
  currentAtk,
  defend,
  finishAction,
  judgement,
  rest,
  skillCost,
  startBattle,
  targetList,
  useSkill
} from "../game";
import type { Fighter, GameSnapshot, GameState, RuleActionResult, Side } from "../types";
import { LobbyManager } from "./LobbyManager";
import type { NetworkTransport } from "./NetworkTransport";
import type { ActionCommandMessage, ActionEvent, LobbyState, NetworkEnvelope, VersionPayload } from "./messages";
import { stateHash } from "./stateHash";

export interface HostGameSessionOptions extends VersionPayload {
  hostPlayerId: string;
  transport: NetworkTransport;
  initialState: GameState;
  lobbyId?: string;
  random?: () => number;
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function sideForPlayer(lobby: LobbyState, playerId: string): Side | null {
  if (playerId === lobby.hostPlayerId) return "p1";
  if (playerId === lobby.guestPlayerId) return "p2";
  return null;
}

function fighterKey(side: Side, id: string) {
  return `${side}:${id}`;
}

function activeFighter(state: GameState): Fighter | null {
  if (!state.players || !state.active) return null;
  return state.players[state.active.side].team.find(fighter => fighter.id === state.active?.id) || null;
}

function activeSnapshot(state: GameState): GameSnapshot {
  return { version: "host", chars: CHARACTERS, state };
}

export class HostGameSession {
  readonly lobby: LobbyManager;
  private gameState: GameState;
  private readonly random: () => number;
  private readonly unsubscribeMessage: () => void;
  private readonly unsubscribeDisconnect: () => void;

  constructor(private readonly options: HostGameSessionOptions) {
    this.random = options.random || Math.random;
    this.gameState = cloneState(options.initialState);
    this.lobby = new LobbyManager({
      lobbyId: options.lobbyId,
      gameVersion: options.gameVersion,
      rulesetVersion: options.rulesetVersion
    });
    this.lobby.createLobby(options.hostPlayerId);
    this.unsubscribeMessage = options.transport.onMessage(envelope => void this.handleMessage(envelope));
    this.unsubscribeDisconnect = options.transport.onDisconnect(peerId => void this.handleDisconnect(peerId));
  }

  get state() {
    return cloneState(this.gameState);
  }

  get hash() {
    return stateHash(this.gameState);
  }

  async close() {
    this.unsubscribeMessage();
    this.unsubscribeDisconnect();
    await this.options.transport.broadcast({
      type: "DISCONNECT_NOTICE",
      playerId: this.options.hostPlayerId,
      reason: "host-left"
    });
    await this.options.transport.disconnect();
  }

  async sync(reason = "host-sync") {
    await this.options.transport.broadcast({
      type: "GAME_STATE_SYNC",
      updatedState: this.state,
      stateHash: this.hash,
      reason
    });
  }

  private async handleMessage(envelope: NetworkEnvelope) {
    const message = envelope.message;
    if (message.type === "VERSION_CHECK") return this.handleVersionCheck(envelope);
    if (message.type === "DRAFT_PICK_COMMAND") return this.handleDraftPick(envelope);
    if (message.type === "ACTION_COMMAND") return this.handleActionCommand(envelope, message);
  }

  private async handleVersionCheck(envelope: NetworkEnvelope) {
    const message = envelope.message;
    if (message.type !== "VERSION_CHECK") return;
    const expected = { gameVersion: this.options.gameVersion, rulesetVersion: this.options.rulesetVersion };
    const received = { gameVersion: message.gameVersion, rulesetVersion: message.rulesetVersion };
    if (expected.gameVersion !== received.gameVersion || expected.rulesetVersion !== received.rulesetVersion) {
      await this.options.transport.send(envelope.fromPlayerId, {
        type: "VERSION_MISMATCH",
        playerId: envelope.fromPlayerId,
        expected,
        received
      });
      return;
    }
    const lobby = this.lobby.joinLobby(envelope.fromPlayerId);
    await this.options.transport.broadcast({ type: "PLAYER_JOINED", lobby, playerId: envelope.fromPlayerId });
    await this.options.transport.send(envelope.fromPlayerId, { type: "GAME_STATE_SYNC", updatedState: this.state, stateHash: this.hash, reason: "joined" });
  }

  private async handleDraftPick(envelope: NetworkEnvelope) {
    const message = envelope.message;
    if (message.type !== "DRAFT_PICK_COMMAND") return;
    const lobby = this.lobby.snapshot();
    const side = sideForPlayer(lobby, envelope.fromPlayerId);
    const reason = this.validateDraftPick(side, message.characterId);
    if (reason) {
      await this.options.transport.send(envelope.fromPlayerId, {
        type: "DRAFT_PICK_RESULT",
        clientActionId: message.clientActionId,
        legal: false,
        playerId: envelope.fromPlayerId,
        characterId: message.characterId,
        reason
      });
      return;
    }

    const state = cloneState(this.gameState);
    state[`${side}Draft`].push(message.characterId);
    state.pickIndex += 1;
    if (state.pickIndex >= RULES.TEAM_SIZE * 2) {
      startBattle(activeSnapshot(state));
      this.lobby.setRoomState("battle");
      await this.options.transport.broadcast({ type: "BATTLE_START", updatedState: state, stateHash: stateHash(state) });
    } else {
      state.draftTurn = (["p1", "p2", "p2", "p1", "p1", "p2"] as Side[])[state.pickIndex];
      this.lobby.setRoomState("drafting");
    }
    this.gameState = state;
    const hash = this.hash;
    await this.options.transport.broadcast({
      type: "DRAFT_PICK_RESULT",
      clientActionId: message.clientActionId,
      legal: true,
      playerId: envelope.fromPlayerId,
      characterId: message.characterId,
      updatedState: this.state,
      stateHash: hash
    });
    await this.sync("draft-pick");
  }

  private validateDraftPick(side: Side | null, characterId: string) {
    if (!side) return "玩家不在房間內。";
    if (this.gameState.screen !== "draft") return "目前不是選角階段。";
    if (this.gameState.draftTurn !== side) return "尚未輪到該玩家選角。";
    if (!CHARACTERS.some(character => character.id === characterId)) return "角色不存在。";
    if (this.gameState.p1Draft.includes(characterId) || this.gameState.p2Draft.includes(characterId)) return "角色已被選走。";
    return "";
  }

  private async handleActionCommand(envelope: NetworkEnvelope, command: ActionCommandMessage) {
    const lobby = this.lobby.snapshot();
    const side = sideForPlayer(lobby, envelope.fromPlayerId);
    const validation = this.validateActionCommand(side, command);
    if (validation) {
      await this.options.transport.send(envelope.fromPlayerId, {
        type: "ACTION_RESULT",
        clientActionId: command.clientActionId,
        legal: false,
        reason: validation
      });
      return;
    }

    const events: ActionEvent[] = [];
    const state = cloneState(this.gameState);
    const snapshot = activeSnapshot(state);
    const logsBefore = state.logs.length;
    const rngEvents = this.withHostRandom(command.clientActionId, events, () => this.applyAction(snapshot, command));
    const result = rngEvents.result;
    const logEvents = state.logs.slice(logsBefore).map(message => ({ type: "LOG", message }));
    events.push(...logEvents);

    if (!result?.ok) {
      await this.options.transport.send(envelope.fromPlayerId, {
        type: "ACTION_RESULT",
        clientActionId: command.clientActionId,
        legal: false,
        reason: state.logs[logsBefore] || state.logs.at(-1) || "操作不合法。"
      });
      return;
    }

    if (result.actionSpent) finishAction(snapshot);
    this.gameState = state;
    const hash = this.hash;
    const actionResult = {
      type: "ACTION_RESULT" as const,
      clientActionId: command.clientActionId,
      legal: true,
      turn: command.turn,
      actorId: command.actorId,
      events,
      updatedState: this.state,
      stateHash: hash
    };
    await this.options.transport.broadcast(actionResult);
    for (const event of events) {
      if (event.type === "RNG_RESULT") {
        await this.options.transport.broadcast({
          type: "RNG_RESULT",
          clientActionId: command.clientActionId,
          value: Number(event.payload?.value || 0),
          label: String(event.payload?.label || "host-rng")
        });
      }
    }
    await this.sync("action-result");
    if (this.gameState.winner) {
      this.lobby.setRoomState("finished");
      await this.options.transport.broadcast({
        type: "GAME_OVER",
        winner: this.gameState.winner,
        updatedState: this.state,
        stateHash: hash
      });
    }
  }

  private validateActionCommand(side: Side | null, command: ActionCommandMessage) {
    if (!side) return "玩家不在房間內。";
    if (this.gameState.screen !== "battle" || !this.gameState.players) return "目前不是戰鬥階段。";
    if (this.gameState.winner) return "對戰已結束。";
    const actor = activeFighter(this.gameState);
    if (!actor) return "沒有可行動角色。";
    if (actor.owner !== side) return "尚未輪到該玩家行動。";
    if (actor.id !== command.actorId) return "行動者不一致。";
    if (actor.hpNow <= 0) return "角色已被擊倒。";
    if (command.useJudgement && command.judgementType) return "";
    if (command.actionType === "skill") {
      if (actor.cd > 0) return "技能冷卻中。";
      if (actor.statuses.includes(STATUS.SEAL)) return "封印中不能使用技能。";
      const player = this.gameState.players[actor.owner];
      if (player.energy < skillCost(actor, !!command.useResonance)) return "能量不足。";
    }
    if (command.actionType === "attack" && actor.flags.noAttack) return "本回合不能攻擊。";
    return "";
  }

  private applyAction(snapshot: GameSnapshot, command: ActionCommandMessage): RuleActionResult {
    const targetKey = command.targetIds[0] || null;
    if (command.useJudgement && command.judgementType) return judgement(snapshot, command.judgementType, targetKey || undefined);
    if (command.actionType === "attack") return attack(snapshot, targetKey);
    if (command.actionType === "skill") return useSkill(snapshot, targetKey, { res: command.useResonance });
    if (command.actionType === "defend") return defend(snapshot);
    if (command.actionType === "rest") return rest(snapshot);
    return { ok: false };
  }

  private withHostRandom<T>(clientActionId: string, events: ActionEvent[], fn: () => T) {
    const originalRandom = Math.random;
    Math.random = () => {
      const value = this.random();
      events.push({ type: "RNG_RESULT", payload: { clientActionId, value, label: "host-random" } });
      return value;
    };
    try {
      return { result: fn() };
    } finally {
      Math.random = originalRandom;
    }
  }

  private async handleDisconnect(peerId: string) {
    const lobby = this.lobby.leaveLobby(peerId);
    await this.options.transport.broadcast({ type: "PLAYER_LEFT", lobby, playerId: peerId });
    await this.options.transport.broadcast({ type: "DISCONNECT_NOTICE", playerId: peerId, reason: "client-left" });
  }
}
