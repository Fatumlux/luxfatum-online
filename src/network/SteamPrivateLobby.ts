import type { GameState } from "../types";
import { ClientGameSession } from "./ClientGameSession";
import { HostGameSession } from "./HostGameSession";
import { SteamBridgeTransport } from "./SteamBridgeTransport";

export interface SteamPrivateLobbyOptions {
  gameVersion: string;
  rulesetVersion: string;
}

export async function createSteamHostSession(initialState: GameState, options: SteamPrivateLobbyOptions) {
  const transport = await SteamBridgeTransport.createFromBridge();
  const lobbyId = await window.luxfatumSteam?.createLobby?.();
  const session = new HostGameSession({
    hostPlayerId: transport.localPeerId,
    transport,
    initialState,
    lobbyId,
    gameVersion: options.gameVersion,
    rulesetVersion: options.rulesetVersion
  });
  if (lobbyId) await window.luxfatumSteam?.openInviteDialog?.(lobbyId);
  return { session, transport, lobbyId };
}

export async function createSteamClientSession(hostPlayerId: string, options: SteamPrivateLobbyOptions) {
  const transport = await SteamBridgeTransport.createFromBridge();
  const session = new ClientGameSession({
    playerId: transport.localPeerId,
    hostPlayerId,
    transport,
    gameVersion: options.gameVersion,
    rulesetVersion: options.rulesetVersion
  });
  await session.connect();
  return { session, transport };
}
