const { contextBridge, ipcRenderer } = require("electron");

// Expose safe Electron APIs to the renderer (Next.js app)
contextBridge.exposeInMainWorld("electron", {
  isElectron: true,
  getVersion: () => ipcRenderer.invoke("get-app-version"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  gemScan: (opts) => ipcRenderer.invoke("gem-scan", opts),
  gemFetchDoc: (opts) => ipcRenderer.invoke("gem-fetch-doc", opts),

  // GeM bid participation — credentials never cross this bridge in plaintext
  // except on initial save (renderer → main), and never main → renderer.
  gemCredsStatus: (opts) => ipcRenderer.invoke("gem-creds-status", opts),
  gemCredsSave: (opts) => ipcRenderer.invoke("gem-creds-save", opts),
  gemCredsClear: (opts) => ipcRenderer.invoke("gem-creds-clear", opts),
  gemGmailSave: (opts) => ipcRenderer.invoke("gem-gmail-save", opts),
  gemParticipateOpen: (opts) => ipcRenderer.invoke("gem-participate-open", opts),
  gemParticipateLogin: (opts) => ipcRenderer.invoke("gem-participate-login", opts),
  gemParticipateOtp: (opts) => ipcRenderer.invoke("gem-participate-otp", opts),
  gemParticipateGoto: (opts) => ipcRenderer.invoke("gem-participate-goto", opts),
  gemParticipateFill: (opts) => ipcRenderer.invoke("gem-participate-fill", opts),
  gemParticipateAttach: (opts) => ipcRenderer.invoke("gem-participate-attach", opts),
  gemParticipateScreenshot: (opts) => ipcRenderer.invoke("gem-participate-screenshot", opts),
  gemParticipateSubmit: (opts) => ipcRenderer.invoke("gem-participate-submit", opts),
  gemParticipateConfirmation: (opts) => ipcRenderer.invoke("gem-participate-confirmation", opts),
  gemParticipateClose: (opts) => ipcRenderer.invoke("gem-participate-close", opts),
  onGemParticipationEvent: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on("gem-participation-event", listener);
    return () => ipcRenderer.removeListener("gem-participation-event", listener);
  },
});
