const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("studyspaceDevice", Object.freeze({
  signIn: () => ipcRenderer.invoke("device:sign-in"),
  signOut: () => ipcRenderer.invoke("device:sign-out"),
}));
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.studyspaceDesktop = "true";
});
ipcRenderer.on("device:add-module", (_event, point) => {
  window.dispatchEvent(new CustomEvent("studyspace:add-module", {detail:point}));
});
ipcRenderer.on("device:account-changed",()=>window.dispatchEvent(new Event("studyspace:account-changed")));
