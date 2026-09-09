const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "studyspaceDesktop",
  Object.freeze({
    state: () => ipcRenderer.invoke("desktop:state"),
    save: (settings) => ipcRenderer.invoke("desktop:save", settings),
    checkUpdates: () => ipcRenderer.invoke("desktop:check-updates"),
    installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
    openWorkspace: (kind) => ipcRenderer.invoke("desktop:open-workspace", kind),
    openGuide: () => ipcRenderer.invoke("desktop:guide"),
    subscribe: (callback) => {
      const handler = (_event, value) => callback(value);
      ipcRenderer.on("desktop:state-changed", handler);
      return () => ipcRenderer.removeListener("desktop:state-changed", handler);
    },
  }),
);
