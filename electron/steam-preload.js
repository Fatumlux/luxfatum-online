const { contextBridge, ipcRenderer } = require("electron");

const messageListeners = new Set();
const disconnectListeners = new Set();

ipcRenderer.on("steam-network-message", (_event, payload) => {
  for (const listener of messageListeners) listener(payload.fromPeerId, payload.message);
});

ipcRenderer.on("steam-network-disconnect", (_event, payload) => {
  for (const listener of disconnectListeners) listener(payload.peerId, payload.reason);
});

contextBridge.exposeInMainWorld("luxfatumSteam", {
  getLocalPeerId: () => ipcRenderer.invoke("steam:get-local-peer-id"),
  createLobby: () => ipcRenderer.invoke("steam:create-lobby"),
  joinLobby: lobbyId => ipcRenderer.invoke("steam:join-lobby", lobbyId),
  openInviteDialog: lobbyId => ipcRenderer.invoke("steam:open-invite-dialog", lobbyId),
  connect: peerId => ipcRenderer.invoke("steam:connect", peerId),
  disconnect: () => ipcRenderer.invoke("steam:disconnect"),
  send: (peerId, message) => ipcRenderer.invoke("steam:send", peerId, message),
  broadcast: message => ipcRenderer.invoke("steam:broadcast", message),
  onMessage: callback => {
    messageListeners.add(callback);
    return () => messageListeners.delete(callback);
  },
  onDisconnect: callback => {
    disconnectListeners.add(callback);
    return () => disconnectListeners.delete(callback);
  }
});
