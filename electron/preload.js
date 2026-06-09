const { contextBridge, ipcRenderer } = require("electron");

// Expose safe Electron APIs to the renderer (Next.js app)
contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  getVersion: () => ipcRenderer.invoke("get-app-version"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  gemScan: (opts) => ipcRenderer.invoke("gem-scan", opts),
  gemFetchDoc: (opts) => ipcRenderer.invoke("gem-fetch-doc", opts),
});
