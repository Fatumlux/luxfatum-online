const { ipcMain } = require("electron");

function notConfigured() {
  throw new Error("Steamworks adapter is not configured. Bind these IPC handlers to Steamworks SDK in the packaged desktop app.");
}

function registerSteamIpcHandlers(adapter = {}) {
  ipcMain.handle("steam:get-local-peer-id", () => adapter.getLocalPeerId?.() || notConfigured());
  ipcMain.handle("steam:create-lobby", () => adapter.createLobby?.() || notConfigured());
  ipcMain.handle("steam:join-lobby", (_event, lobbyId) => adapter.joinLobby?.(lobbyId) || notConfigured());
  ipcMain.handle("steam:open-invite-dialog", (_event, lobbyId) => adapter.openInviteDialog?.(lobbyId) || notConfigured());
  ipcMain.handle("steam:connect", (_event, peerId) => adapter.connect?.(peerId) || notConfigured());
  ipcMain.handle("steam:disconnect", () => adapter.disconnect?.() || notConfigured());
  ipcMain.handle("steam:send", (_event, peerId, message) => adapter.send?.(peerId, message) || notConfigured());
  ipcMain.handle("steam:broadcast", (_event, message) => adapter.broadcast?.(message) || notConfigured());
}

function emitSteamMessage(browserWindow, fromPeerId, message) {
  browserWindow.webContents.send("steam-network-message", { fromPeerId, message });
}

function emitSteamDisconnect(browserWindow, peerId, reason) {
  browserWindow.webContents.send("steam-network-disconnect", { peerId, reason });
}

module.exports = {
  registerSteamIpcHandlers,
  emitSteamMessage,
  emitSteamDisconnect
};
