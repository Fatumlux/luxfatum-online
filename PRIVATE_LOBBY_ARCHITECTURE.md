# LuxFatum：裁定對決 私人裁定場架構

## 目標

私人裁定場是未來 Steam 好友開房模式的前置架構，類似 Host & Play：

- 不自架官方伺服器。
- 不做排位、陌生人配對或官方排行榜。
- 房主 Host 是本場對戰唯一權威判定端。
- Client 只送操作指令，不直接改 HP、能量、冷卻、裁定、狀態或勝負。
- Steamworks SDK 尚未接入；目前先以可替換抽象層建立架構。

## 模組

- `src/network/NetworkTransport.ts`
  - 可替換傳輸介面。
  - 未來 Steam Networking Sockets 只需要實作同一組方法。

- `src/network/LocalMockTransport.ts`
  - 本機假連線，供開發模式模擬 Host / Client。
  - 可測試選角同步、戰鬥行動同步、斷線流程與 stateHash。

- `src/network/SteamBridgeTransport.ts`
  - 桌面 Steam 版本使用的 Transport。
  - 透過 `window.luxfatumSteam` 呼叫 Electron preload / native Steamworks 層。
  - Web 版沒有 bridge 時不會啟用。

- `electron/steam-preload.js`
  - Electron preload bridge 範本，暴露 `window.luxfatumSteam`。

- `electron/steam-main-adapter.js`
  - Electron main-process IPC 範本。
  - 需要在正式桌面版中接上 Steamworks SDK 的 Lobby 與 `ISteamNetworkingMessages`。

- `src/network/LobbyManager.ts`
  - 管理 lobbyId、hostPlayerId、guestPlayerId、players、roomState、gameVersion、rulesetVersion。
  - 房間狀態包含 waiting、ready、drafting、battle、finished。

- `src/network/HostGameSession.ts`
  - 保存權威 gameState。
  - 驗證版本、選角、行動者、能量、冷卻、封印與基本目標。
  - 呼叫既有規則函式計算結果，不重寫角色規則。
  - 每次合法行動後廣播 ACTION_RESULT 與 GAME_STATE_SYNC。
  - Host 產生隨機值並記錄 RNG_RESULT event。

- `src/network/ClientGameSession.ts`
  - 送出 DRAFT_PICK_COMMAND 與 ACTION_COMMAND。
  - 等待 Host ACTION_RESULT。
  - 收到 Host 的 updatedState 與 stateHash 後同步畫面。
  - 不自行計算正式結果。

- `src/network/messages.ts`
  - 定義 LOBBY_CREATED、PLAYER_JOINED、PLAYER_LEFT、READY_STATE_CHANGED、VERSION_CHECK、VERSION_MISMATCH、DRAFT_PICK_COMMAND、DRAFT_PICK_RESULT、BATTLE_START、ACTION_COMMAND、ACTION_RESULT、RNG_RESULT、GAME_STATE_SYNC、GAME_OVER、ERROR_MESSAGE、DISCONNECT_NOTICE。

## ACTION_COMMAND

```json
{
  "type": "ACTION_COMMAND",
  "clientActionId": "string",
  "turn": 1,
  "actorId": "string",
  "actionType": "attack | skill | defend | rest",
  "skillId": "string | null",
  "targetIds": ["string"],
  "useResonance": true,
  "useJudgement": false,
  "judgementType": "string | null"
}
```

`targetIds` 使用目前規則層可解析的 fighter key，例如 `p2:ningyao`。

## ACTION_RESULT

合法：

```json
{
  "type": "ACTION_RESULT",
  "clientActionId": "string",
  "legal": true,
  "turn": 1,
  "actorId": "string",
  "events": [],
  "updatedState": {},
  "stateHash": "string"
}
```

非法：

```json
{
  "type": "ACTION_RESULT",
  "clientActionId": "string",
  "legal": false,
  "reason": "能量不足"
}
```

## 同步規則

- Host 是唯一權威狀態來源。
- 每次行動後 Host 產生 stateHash。
- Client 收到 ACTION_RESULT 後更新畫面。
- 如果 Client 本地 hash 不一致，以 Host 的 GAME_STATE_SYNC 為準。
- Client 不允許直接改 HP、能量、冷卻、裁定或狀態。

## 隨機規則

所有隨機結果由 Host 產生，例如小莫、作者擲硬幣與未來隨機效果。

Host 在執行既有規則函式時包住 `Math.random`，隨機值會寫入 `RNG_RESULT` event，Client 用同一份 ACTION_RESULT / GAME_STATE_SYNC 播放相同結果。

## 斷線處理

- Host 離開：廣播 DISCONNECT_NOTICE，房間關閉。
- Client 離開：LobbyManager 標記 guest disconnected，Host 可顯示對方離線。
- 戰鬥中斷線：目前由 DISCONNECT_NOTICE 暫停與提示。
- 先不做重連。

## LocalMockTransport 測試方式

```ts
import { createLocalMockPair, HostGameSession, ClientGameSession } from "./src/network";
import { freshStateLike } from "./your-test-helper";

const { host, client } = createLocalMockPair("host-player", "guest-player");
const initialState = freshStateLike();
initialState.screen = "draft";

const hostSession = new HostGameSession({
  hostPlayerId: "host-player",
  transport: host,
  initialState,
  gameVersion: "v4.7.1",
  rulesetVersion: "v4.7.1"
});

const clientSession = new ClientGameSession({
  playerId: "guest-player",
  hostPlayerId: "host-player",
  transport: client,
  gameVersion: "v4.7.1",
  rulesetVersion: "v4.7.1"
});

await clientSession.connect();
await clientSession.sendDraftPick("ningyao");
```

正式測試可在 UI 或 Vitest/Playwright 中建立 host/client 兩端，對比 `stateHash`。

## 未來替換點

- Steam Lobby：替換或包裝 `LobbyManager` 的房間建立、加入、離開、玩家清單同步來源。
- Steam Networking Sockets / Messages：正式版在 Electron main process 接 Steamworks SDK，preload 暴露 `window.luxfatumSteam`，前端直接使用 `SteamBridgeTransport`。
- Host / Client 規則流程不需要換；只換 transport 與 lobby discovery。

## Steam bridge 對接點

前端期待桌面外殼提供：

- `getLocalPeerId()`
- `createLobby()`
- `joinLobby(lobbyId)`
- `openInviteDialog(lobbyId)`
- `connect(peerId)`
- `disconnect()`
- `send(peerId, jsonMessage)`
- `broadcast(jsonMessage)`
- `onMessage(callback)`
- `onDisconnect(callback)`

Steamworks 對應方向：

- 好友邀請與 Lobby UI：`ISteamFriends::ActivateGameOverlayInviteDialog`。
- P2P 訊息：`ISteamNetworkingMessages::SendMessageToUser` 與對應 session request / message callback。
