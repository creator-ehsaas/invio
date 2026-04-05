const { app, BrowserWindow, shell, Menu, Tray, nativeImage, ipcMain } = require("electron");
const path = require("path");
const isDev = !app.isPackaged;
const { execFile } = require("child_process");
const http = require("http");

let mainWindow = null;
let splashWindow = null;
let tray = null;
let nextServer = null;

const NEXT_PORT = 3000;
const APP_URL = `http://localhost:${NEXT_PORT}`;

function createSplash() {
  const splashImg = path.join(__dirname, "../public/splash.png").replace(/\\/g, "/");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:600px;height:400px;overflow:hidden;background:#0d001f;-webkit-app-region:drag;user-select:none}
    img{width:600px;height:400px;display:block}
    #s{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:rgba(167,139,250,0.6);font-size:11px;font-family:-apple-system,sans-serif;letter-spacing:.05em;white-space:nowrap}
    .d{display:inline-block;animation:b 1.4s infinite}.d:nth-child(2){animation-delay:.2s}.d:nth-child(3){animation-delay:.4s}
    @keyframes b{0%,80%,100%{opacity:0}40%{opacity:1}}
  </style></head><body>
    <img src="file:///${splashImg}" />
    <div id="s">Starting<span class="d">.</span><span class="d">.</span><span class="d">.</span></div>
  </body></html>`;

  splashWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    skipTaskbar: true,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  splashWindow.once("ready-to-show", () => splashWindow.show());
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: path.join(__dirname, "../public/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
    },
    backgroundColor: "#0d001f",
    show: false,
  });

  mainWindow.once("ready-to-show", () => {
    closeSplash();
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  mainWindow.loadURL(APP_URL);

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

function createTray() {
  const iconPath = path.join(__dirname, "../public/icon.png");
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: "Open Invio", click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
    { type: "separator" },
    { label: "New Invoice", click: () => { mainWindow?.loadURL(`${APP_URL}/invoices/new`); mainWindow?.show(); } },
    { label: "New Expense", click: () => { mainWindow?.loadURL(`${APP_URL}/expenses/new`); mainWindow?.show(); } },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setToolTip("Invio — Business Accounting");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => { if (mainWindow) mainWindow.show(); else createWindow(); });
}

function buildNativeMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: "about" }, { type: "separator" }, { role: "services" },
      { type: "separator" }, { role: "hide" }, { role: "hideOthers" },
      { role: "unhide" }, { type: "separator" }, { role: "quit" },
    ]}] : []),
    { label: "File", submenu: [
      { label: "New Invoice", accelerator: "CmdOrCtrl+N", click: () => mainWindow?.loadURL(`${APP_URL}/invoices/new`) },
      { label: "New Expense", accelerator: "CmdOrCtrl+E", click: () => mainWindow?.loadURL(`${APP_URL}/expenses/new`) },
      { label: "New Estimate", accelerator: "CmdOrCtrl+Shift+Q", click: () => mainWindow?.loadURL(`${APP_URL}/estimates/new`) },
      { type: "separator" },
      isMac ? { role: "close" } : { role: "quit" },
    ]},
    { label: "View", submenu: [
      { label: "Dashboard", accelerator: "CmdOrCtrl+Shift+D", click: () => mainWindow?.loadURL(`${APP_URL}/dashboard`) },
      { label: "Reports", accelerator: "CmdOrCtrl+Shift+R", click: () => mainWindow?.loadURL(`${APP_URL}/reports`) },
      { label: "Customers", click: () => mainWindow?.loadURL(`${APP_URL}/customers`) },
      { label: "Inventory", click: () => mainWindow?.loadURL(`${APP_URL}/inventory`) },
      { type: "separator" },
      { role: "reload" }, { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ]},
    { label: "Edit", submenu: [
      { role: "undo" }, { role: "redo" }, { type: "separator" },
      { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
    ]},
    { label: "Help", submenu: [
      { label: "About Invio", click: () => shell.openExternal("https://invio.app") },
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function startNextServer() {
  return new Promise((resolve) => {
    if (isDev) { resolve(); return; }

    const nextBin = path.join(__dirname, "../node_modules/.bin/next");
    nextServer = execFile(nextBin, ["start", "-p", String(NEXT_PORT)], {
      cwd: path.join(__dirname, "../"),
    });

    let resolved = false;
    nextServer.stdout.on("data", (data) => {
      if (!resolved && (data.includes("started server") || data.includes("ready"))) {
        resolved = true;
        resolve();
      }
    });
    // Fallback
    setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 4000);
  });
}

function waitForServer(maxAttempts = 30) {
  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http.get(APP_URL, () => resolve(true)).on("error", () => {
        if (attempts < maxAttempts) setTimeout(check, 1000);
        else resolve(false);
      });
    };
    check();
  });
}

app.whenReady().then(async () => {
  buildNativeMenu();

  if (!isDev) {
    createSplash();
    await startNextServer();
    await waitForServer();
  }

  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (nextServer) nextServer.kill();
    app.quit();
  }
});

app.on("before-quit", () => {
  if (nextServer) nextServer.kill();
});

ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("open-external", (_, url) => shell.openExternal(url));
