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

// GeM scraper — runs in Node.js main process (no CORS, Indian IP from user's machine)
const https = require("https");

const GEM_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function gemHttpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        "User-Agent": GEM_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
      },
    }, (res) => {
      let body = "";
      const cookies = (res.headers["set-cookie"] ?? [])
        .map((c) => c.split(";")[0].trim())
        .join("; ");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ body, cookies, status: res.statusCode }));
    });
    req.setTimeout(12000, () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
  });
}

function isGemHost(hostname) {
  return hostname.replace(/\.$/, "").toLowerCase().endsWith(".gem.gov.in");
}

function gemHttpGetBinary(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || !isGemHost(parsed.hostname)) {
        return reject(new Error("Binary fetch blocked: not a gem.gov.in HTTPS URL"));
      }
      const req = https.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: parsed.pathname + (parsed.search || ""),
          method: "GET",
          headers: {
            "User-Agent": GEM_UA,
            "Accept": "*/*",
            "Referer": "https://bidplus.gem.gov.in/",
          },
        },
        (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302) && redirectsLeft > 0) {
            const location = res.headers["location"];
            if (location) {
              // Re-validate redirect target before following
              try {
                const redir = new URL(location, url);
                if (redir.protocol !== "https:" || !isGemHost(redir.hostname)) {
                  return reject(new Error("Redirect blocked: target is not a gem.gov.in HTTPS URL"));
                }
                res.resume(); // discard body
                gemHttpGetBinary(redir.href, redirectsLeft - 1).then(resolve).catch(reject);
              } catch {
                reject(new Error("Invalid redirect URL"));
              }
              return;
            }
          }
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve({
            buffer: Buffer.concat(chunks),
            status: res.statusCode,
            contentType: res.headers["content-type"] || "",
          }));
        }
      );
      req.setTimeout(25000, () => { req.destroy(); reject(new Error("PDF download timeout")); });
      req.on("error", reject);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function gemHttpPost(cookie, csrf, keyword, page) {
  const payload = {
    param: { searchBid: keyword, searchType: "fullText" },
    filter: { bidStatusType: "ongoing_bids", byType: "all", highBidValue: "", byEndDate: { from: "", to: "" }, sort: "Bid-End-Date-Oldest" },
    ...(page > 1 ? { page } : {}),
  };
  const formBody = new URLSearchParams();
  formBody.set("payload", JSON.stringify(payload));
  formBody.set("csrf_bd_gem_nk", csrf);
  const bodyStr = formBody.toString();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "bidplus.gem.gov.in",
        path: "/all-bids-data",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "Content-Length": Buffer.byteLength(bodyStr),
          "X-Requested-With": "XMLHttpRequest",
          "Cookie": cookie,
          "Referer": "https://bidplus.gem.gov.in/all-bids",
          "User-Agent": GEM_UA,
          "Accept": "application/json, text/javascript, */*; q=0.01",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); } catch { resolve(null); }
        });
      }
    );
    req.setTimeout(15000, () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

function decodeHtmlEntities(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(s) {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim());
}

function htmlToText(html) {
  // Remove scripts, styles, comments
  let h = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const lines = [];

  // Process tables into structured key: value lines
  const tableRegex = /<table[\s\S]*?<\/table>/gi;
  const tableMatches = [];
  let tm;
  while ((tm = tableRegex.exec(h)) !== null) {
    tableMatches.push({ index: tm.index, end: tm.index + tm[0].length, text: tm[0] });
  }

  // Build a list of (position, text) segments — non-table HTML + structured table text
  let cursor = 0;
  for (const t of tableMatches) {
    // Text before this table
    if (t.index > cursor) {
      const pre = stripTags(h.substring(cursor, t.index));
      if (pre.trim()) lines.push(pre.trim());
    }
    // Convert table to structured text
    lines.push(tableToText(t.text));
    cursor = t.end;
  }
  // Text after last table
  if (cursor < h.length) {
    const rest = stripTags(h.substring(cursor));
    if (rest.trim()) lines.push(rest.trim());
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function tableToText(tableHtml) {
  const out = [];
  // Extract rows
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
    const row = rowMatch[0];
    const cells = [];
    const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(row)) !== null) {
      cells.push(stripTags(cellMatch[1]).trim());
    }
    if (cells.length === 0) continue;
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length === 0) continue;

    if (cells.length === 1) {
      // Single cell — likely a header/group label
      const val = nonEmpty[0];
      if (val) out.push(`\n[${val}]`);
    } else if (cells.length === 2) {
      // Two columns — treat as key: value pair
      out.push(`${cells[0]}: ${cells[1]}`);
    } else {
      // Multi-column — join with pipes
      out.push(nonEmpty.join(" | "));
    }
  }
  return out.join("\n");
}

ipcMain.handle("gem-fetch-doc", async (_, { bidUrl }) => {
  try {
    if (!bidUrl) return { error: "No bid URL provided" };
    // Only allow requests to GeM's domain to prevent SSRF
    try {
      const u = new URL(bidUrl);
      if (u.protocol !== "https:" || !u.hostname.replace(/\.$/, "").endsWith(".gem.gov.in")) {
        return { error: "Invalid host — only gem.gov.in domains are allowed" };
      }
    } catch {
      return { error: "Invalid URL" };
    }
    const res = await gemHttpGet(bidUrl);
    if (res.status !== 200) return { error: `GeM returned HTTP ${res.status}` };

    const html = res.body;

    // Convert HTML to structured readable text, preserving tables
    const text = htmlToText(html);

    // Find all downloadable / spec document links
    const docLinks = [];
    const seen = new Set();
    const linkRegex = /<a[^>]+href="([^"#][^"]*)"[^>]*>([\s\S]{1,200}?)<\/a>/gi;
    let match;
    const DOC_PATTERNS = /\.(pdf|docx?|xlsx?|zip|pptx?)/i;
    const DOC_KEYWORDS = /download|BidDocument|showDocument|specification|Specification|corrigendum|atc|tender_doc|tenderDoc|SpecDocument|getSpec|viewDoc|attachment/i;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1].trim();
      const label = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 150);
      if (!href || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;
      if (seen.has(href)) continue;
      if (DOC_PATTERNS.test(href) || DOC_KEYWORDS.test(href)) {
        seen.add(href);
        const url = href.startsWith("http") ? href : `https://bidplus.gem.gov.in${href.startsWith("/") ? "" : "/"}${href}`;
        docLinks.push({ url, name: label || "Document" });
      }
    }

    // Parse financial values from the structured text
    const financials = {};
    const estPatterns = [
      /(?:estimated\s+(?:total\s+)?(?:bid\s+)?value|bid\s+value|budget|total\s+value)[^:\d\n]{0,20}:?\s*(?:₹|inr|rs\.?)?\s*([\d,]+(?:\.\d+)?)/i,
      /(?:₹|Rs\.?)\s*([\d,]+(?:\.\d+)?)\s*(?:lakh|lac|L|crore|cr)?\s*(?:estimated|estimate|budget|value)/i,
    ];
    for (const pat of estPatterns) {
      const m = text.match(pat);
      if (m) {
        const val = parseFloat(m[1].replace(/,/g, ""));
        if (val > 100) { financials.estimated_value = val; break; }
      }
    }
    // EMD — look for "EMD: 25000" or "Earnest Money Deposit: 25,000"
    const emdMatch = text.match(/(?:EMD|Earnest\s+Money(?:\s+Deposit)?)\s*:?\s*(?:₹|inr|rs\.?)?\s*([\d,]+(?:\.\d+)?)/i);
    if (emdMatch) {
      const val = parseFloat(emdMatch[1].replace(/,/g, ""));
      if (val > 0) financials.emd_amount = val;
    }

    // Download PDF spec documents and extract text (only gem.gov.in HTTPS URLs)
    const pdfLinks = docLinks.filter(l => {
      try {
        const u = new URL(l.url);
        return u.protocol === "https:" && isGemHost(u.hostname) && l.url.match(/\.pdf($|\?|&)/i);
      } catch { return false; }
    }).slice(0, 3);
    let pdfText = "";
    for (const link of pdfLinks) {
      try {
        const pdfRes = await gemHttpGetBinary(link.url);
        if (pdfRes.status === 200 && pdfRes.buffer.length > 500) {
          const pdfParse = require("pdf-parse");
          const data = await pdfParse(pdfRes.buffer);
          if (data.text && data.text.length > 100) {
            pdfText += `\n\n=== Specification Document: ${link.name} ===\n${data.text.substring(0, 15000)}`;
          }
        }
      } catch (pdfErr) {
        console.error(`PDF extract failed for ${link.url}:`, pdfErr.message);
      }
    }

    return {
      text: text.substring(0, 25000),
      docLinks,
      pdfText: pdfText.substring(0, 20000),
      financials,
    };
  } catch (err) {
    return { error: err.message || "Failed to fetch bid document" };
  }
});

ipcMain.handle("gem-scan", async (_, { keywords, maxPages } = {}) => {
  try {
    const sessionRes = await gemHttpGet("https://bidplus.gem.gov.in/all-bids");
    const csrfMatch = sessionRes.body.match(/csrf_bd_gem_nk['":\s,]+['"]([a-f0-9]{32})['"]/);
    const csrf = csrfMatch?.[1];
    if (!csrf) return { error: "Could not read session from GeM portal. Try again." };

    const kws = keywords?.length ? keywords.slice(0, 5) : [""];
    const pages = maxPages ?? 3;
    const docs = [];

    for (const kw of kws) {
      for (let page = 1; page <= pages; page++) {
        const data = await gemHttpPost(sessionRes.cookies, csrf, kw, page);
        if (data?.code !== 200) break;
        const items = data?.response?.response?.docs ?? [];
        if (!items.length) break;
        docs.push(...items);
        if (items.length < 10) break; // last page
      }
    }

    return { docs };
  } catch (err) {
    return { error: err.message || "Scan failed" };
  }
});
