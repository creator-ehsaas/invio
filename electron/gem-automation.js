/**
 * GeM Bid Participation — Electron main-process automation.
 *
 * Responsibilities:
 *  - Credential vault: GeM + Gmail secrets encrypted with safeStorage (OS
 *    keychain / DPAPI). Secrets NEVER leave this process — the renderer only
 *    ever sees booleans and usernames.
 *  - Gmail IMAP OTP listener: connects only while a login is in progress.
 *  - Automation window: a visible BrowserWindow in an isolated session
 *    partition. Fills login + participation forms, attaches approved
 *    documents, and submits ONLY when explicitly told to. The user can take
 *    over manually at any time — the window is theirs.
 *
 * Every IPC handler returns { ok, ... } or { error } — no throws across IPC.
 */

const { BrowserWindow, app, safeStorage, session, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const https = require("https");

const VAULT_FILE = () => path.join(app.getPath("userData"), "gem-vault.enc");

// ── Credential vault ──────────────────────────────────────────────────────────

function readVault() {
  try {
    const raw = fs.readFileSync(VAULT_FILE());
    const json = safeStorage.decryptString(raw);
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function writeVault(vault) {
  const buf = safeStorage.encryptString(JSON.stringify(vault));
  fs.writeFileSync(VAULT_FILE(), buf);
}

function credsStatus(businessId) {
  if (!safeStorage.isEncryptionAvailable()) {
    return { encryptionAvailable: false, hasGem: false, hasGmail: false };
  }
  const entry = readVault()[businessId] || {};
  return {
    encryptionAvailable: true,
    hasGem: !!(entry.gem && entry.gem.username && entry.gem.password),
    gemUserId: entry.gem ? entry.gem.username : null,
    hasGmail: !!(entry.gmail && entry.gmail.email && entry.gmail.password),
    gmailEmail: entry.gmail ? entry.gmail.email : null,
    deviceLabel: os.hostname(),
  };
}

// ── Gmail IMAP OTP listener ───────────────────────────────────────────────────

/**
 * Polls the Gmail inbox over IMAP for a fresh OTP mail from gem.gov.in.
 * Runs only while a login flow is active; disconnects as soon as it
 * resolves, times out, or is cancelled.
 */
async function waitForGemOtp({ email, password, host, sinceDate, timeoutMs, isCancelled }) {
  const { ImapFlow } = require("imapflow");
  const client = new ImapFlow({
    host: host || "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });

  const deadline = Date.now() + (timeoutMs || 180000);
  await client.connect();
  try {
    await client.mailboxOpen("INBOX");
    while (Date.now() < deadline) {
      if (isCancelled && isCancelled()) return null;

      const uids = await client.search({ since: sinceDate, from: "gem.gov.in" });
      if (uids && uids.length) {
        // Newest first
        for (const uid of uids.slice(-5).reverse()) {
          const msg = await client.fetchOne(uid, { envelope: true, source: true });
          if (!msg) continue;
          const msgDate = msg.envelope && msg.envelope.date ? new Date(msg.envelope.date) : null;
          if (msgDate && msgDate.getTime() < sinceDate.getTime() - 60000) continue;
          const body = msg.source ? msg.source.toString("utf-8") : "";
          // OTP appears near the word OTP/code — 4 to 8 digits
          const m = body.match(/(?:OTP|one\s*time\s*password|verification\s*code)[^0-9]{0,40}(\d{4,8})/i)
                 || body.match(/\b(\d{6})\b\s*(?:is\s+your|as\s+your)/i);
          if (m) return m[1];
        }
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    return null;
  } finally {
    try { await client.logout(); } catch { /* connection may already be gone */ }
  }
}

async function testGmail({ email, password, host }) {
  const { ImapFlow } = require("imapflow");
  const client = new ImapFlow({
    host: host || "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });
  await client.connect();
  await client.logout();
}

// ── Automation window management ──────────────────────────────────────────────

// sessionId → { win, partition, otpCancelled }
const activeSessions = new Map();

function emitEvent(mainWindowGetter, sessionId, type, payload) {
  const mw = mainWindowGetter();
  if (mw && !mw.isDestroyed()) {
    mw.webContents.send("gem-participation-event", { sessionId, type, payload: payload || {}, ts: new Date().toISOString() });
  }
}

function getSessionWin(sessionId) {
  const entry = activeSessions.get(sessionId);
  if (!entry || entry.win.isDestroyed()) return null;
  return entry.win;
}

/** Run JS in the automation page; never throws across IPC. */
async function pageExec(win, script) {
  return win.webContents.executeJavaScript(script, true);
}

// Script injected to fill form fields by matching labels/names/placeholders.
// Returns { filled: [...], unmatched: [...] }. Values are passed as JSON and
// only ever assigned to input values — never evaluated.
const FILL_SCRIPT = (fieldsJson) => `
(() => {
  const fields = ${fieldsJson};
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const inputs = Array.from(document.querySelectorAll("input, textarea, select"))
    .filter((el) => el.type !== "hidden" && el.type !== "submit" && el.type !== "button" && !el.disabled && el.offsetParent !== null);

  const labelFor = (el) => {
    if (el.id) {
      const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l) return l.textContent;
    }
    const wrap = el.closest("label");
    if (wrap) return wrap.textContent;
    const row = el.closest("tr, .form-group, .row, .field, div");
    if (row) {
      const l = row.querySelector("label, th, .label");
      if (l) return l.textContent;
    }
    return "";
  };

  const setVal = (el, value) => {
    if (el.tagName === "SELECT") {
      const opt = Array.from(el.options).find((o) => norm(o.textContent) === norm(value) || norm(o.value) === norm(value));
      if (!opt) return false;
      el.value = opt.value;
    } else if (el.type === "checkbox" || el.type === "radio") {
      el.checked = ["true", "yes", "1"].includes(String(value).toLowerCase());
    } else {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
        || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
      try { setter.set.call(el, value); } catch { el.value = value; }
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const filled = [];
  const unmatched = [];
  const used = new Set();

  for (const f of fields) {
    const targets = [norm(f.field_label), norm(f.field_key)].filter(Boolean);
    let matched = null;
    for (const el of inputs) {
      if (used.has(el)) continue;
      const hay = norm(labelFor(el)) + " " + norm(el.name) + " " + norm(el.id) + " " + norm(el.placeholder) + " " + norm(el.getAttribute("aria-label"));
      if (targets.some((t) => t && hay.includes(t))) { matched = el; break; }
    }
    if (matched && setVal(matched, f.value)) {
      used.add(matched);
      filled.push({ field_key: f.field_key, element: matched.name || matched.id || matched.tagName });
    } else {
      unmatched.push({ field_key: f.field_key, field_label: f.field_label });
    }
  }
  return { filled, unmatched, totalInputsOnPage: inputs.length };
})();
`;

// Login fill — GeM SSO login page (selectors best-effort; the window is
// visible so the user can always complete it manually).
const LOGIN_SCRIPT = (userJson) => `
(() => {
  const user = ${userJson};
  const userEl = document.querySelector('#loginid, input[name="loginid"], input[name="username"], input[name="user_id"], input[type="text"][id*="login" i], input[type="email"]');
  if (!userEl) return { found: false };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  setter.set.call(userEl, user);
  userEl.dispatchEvent(new Event("input", { bubbles: true }));
  userEl.dispatchEvent(new Event("change", { bubbles: true }));
  return { found: true };
})();
`;

const PASSWORD_SCRIPT = (passJson) => `
(() => {
  const pass = ${passJson};
  const el = document.querySelector('input[type="password"]');
  if (!el || el.offsetParent === null) return { found: false };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  setter.set.call(el, pass);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { found: true };
})();
`;

const OTP_SCRIPT = (otpJson) => `
(() => {
  const otp = ${otpJson};
  const single = document.querySelector('input[name*="otp" i], input[id*="otp" i], input[placeholder*="otp" i]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (single && single.offsetParent !== null) {
    setter.set.call(single, otp);
    single.dispatchEvent(new Event("input", { bubbles: true }));
    single.dispatchEvent(new Event("change", { bubbles: true }));
    return { found: true, mode: "single" };
  }
  // Per-digit OTP boxes
  const boxes = Array.from(document.querySelectorAll('input[maxlength="1"]')).filter((b) => b.offsetParent !== null);
  if (boxes.length >= otp.length) {
    otp.split("").forEach((d, i) => {
      setter.set.call(boxes[i], d);
      boxes[i].dispatchEvent(new Event("input", { bubbles: true }));
    });
    return { found: true, mode: "boxes" };
  }
  return { found: false };
})();
`;

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

// ── IPC registration ──────────────────────────────────────────────────────────

/**
 * @param {() => BrowserWindow|null} getMainWindow — accessor for the app window
 */
function registerGemAutomation(getMainWindow) {
  // Credentials
  ipcMain.handle("gem-creds-status", (_, { businessId }) => {
    try { return { ok: true, ...credsStatus(businessId) }; }
    catch (e) { return { error: e.message }; }
  });

  ipcMain.handle("gem-creds-save", (_, { businessId, gemUserId, gemPassword }) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return { error: "OS encryption unavailable on this device" };
      if (!businessId || !gemUserId || !gemPassword) return { error: "Missing credentials" };
      const vault = readVault();
      vault[businessId] = vault[businessId] || {};
      vault[businessId].gem = { username: gemUserId, password: gemPassword };
      writeVault(vault);
      return { ok: true, deviceLabel: os.hostname() };
    } catch (e) { return { error: e.message }; }
  });

  ipcMain.handle("gem-gmail-save", async (_, { businessId, email, appPassword, host }) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return { error: "OS encryption unavailable on this device" };
      if (!businessId || !email || !appPassword) return { error: "Missing Gmail credentials" };
      await testGmail({ email, password: appPassword, host }); // verify before saving
      const vault = readVault();
      vault[businessId] = vault[businessId] || {};
      vault[businessId].gmail = { email, password: appPassword, host: host || "imap.gmail.com" };
      writeVault(vault);
      return { ok: true };
    } catch (e) {
      return { error: `Gmail connection failed: ${e.message}. Use a Google App Password (requires 2-Step Verification).` };
    }
  });

  ipcMain.handle("gem-creds-clear", (_, { businessId, which }) => {
    try {
      const vault = readVault();
      if (vault[businessId]) {
        if (!which || which === "gem") delete vault[businessId].gem;
        if (!which || which === "gmail") delete vault[businessId].gmail;
        writeVault(vault);
      }
      return { ok: true };
    } catch (e) { return { error: e.message }; }
  });

  // Open the visible automation window in an isolated partition
  ipcMain.handle("gem-participate-open", async (_, { sessionId, startUrl }) => {
    try {
      if (activeSessions.has(sessionId)) {
        const existing = getSessionWin(sessionId);
        if (existing) { existing.focus(); return { ok: true, alreadyOpen: true }; }
        activeSessions.delete(sessionId);
      }
      const partition = `gem-participation-${sessionId}`;
      const win = new BrowserWindow({
        width: 1200,
        height: 850,
        title: "GeM Portal — Invio Assisted Participation",
        webPreferences: {
          partition,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      activeSessions.set(sessionId, { win, partition, otpCancelled: false });

      win.webContents.on("did-navigate", (_e, url) => emitEvent(getMainWindow, sessionId, "navigated", { url }));
      win.webContents.on("did-navigate-in-page", (_e, url) => emitEvent(getMainWindow, sessionId, "navigated", { url }));
      win.on("closed", () => {
        emitEvent(getMainWindow, sessionId, "window_closed", {});
        activeSessions.delete(sessionId);
      });

      await win.loadURL(startUrl || "https://bidplus.gem.gov.in/login");
      return { ok: true };
    } catch (e) { return { error: e.message }; }
  });

  // Fill the login form from the vault, drive OTP via Gmail IMAP
  ipcMain.handle("gem-participate-login", async (_, { sessionId, businessId }) => {
    try {
      const win = getSessionWin(sessionId);
      if (!win) return { error: "Automation window is not open" };
      const vault = readVault();
      const creds = vault[businessId];
      if (!creds || !creds.gem) return { error: "GeM credentials not saved on this device" };

      const loginStarted = new Date();
      emitEvent(getMainWindow, sessionId, "login_started", { gemUserId: creds.gem.username });

      const userRes = await pageExec(win, LOGIN_SCRIPT(JSON.stringify(creds.gem.username)));
      const passRes = await pageExec(win, PASSWORD_SCRIPT(JSON.stringify(creds.gem.password)));
      emitEvent(getMainWindow, sessionId, "login_filled", {
        username_filled: !!(userRes && userRes.found),
        password_filled: !!(passRes && passRes.found),
      });

      // OTP: listen on Gmail if connected; the wizard also offers manual entry
      let otp = null;
      let otpSource = null;
      if (creds.gmail) {
        emitEvent(getMainWindow, sessionId, "otp_listening", { email: creds.gmail.email });
        const entry = activeSessions.get(sessionId);
        otp = await waitForGemOtp({
          email: creds.gmail.email,
          password: creds.gmail.password,
          host: creds.gmail.host,
          sinceDate: loginStarted,
          timeoutMs: 180000,
          isCancelled: () => !entry || entry.otpCancelled || win.isDestroyed(),
        }).catch((e) => { emitEvent(getMainWindow, sessionId, "otp_error", { error: e.message }); return null; });
        otpSource = otp ? "gmail_imap" : null;
      }

      if (otp && !win.isDestroyed()) {
        const otpRes = await pageExec(win, OTP_SCRIPT(JSON.stringify(otp)));
        emitEvent(getMainWindow, sessionId, "otp_filled", { source: otpSource, applied: !!(otpRes && otpRes.found) });
        return { ok: true, otpApplied: !!(otpRes && otpRes.found), otpSource };
      }

      emitEvent(getMainWindow, sessionId, "otp_manual_required", {});
      return { ok: true, otpApplied: false, manualOtpRequired: true };
    } catch (e) { return { error: e.message }; }
  });

  // User typed the OTP into the wizard (manual fallback)
  ipcMain.handle("gem-participate-otp", async (_, { sessionId, otp }) => {
    try {
      const win = getSessionWin(sessionId);
      if (!win) return { error: "Automation window is not open" };
      if (!/^\d{4,8}$/.test(otp || "")) return { error: "OTP must be 4-8 digits" };
      const res = await pageExec(win, OTP_SCRIPT(JSON.stringify(otp)));
      emitEvent(getMainWindow, sessionId, "otp_filled", { source: "manual", applied: !!(res && res.found) });
      return { ok: true, applied: !!(res && res.found) };
    } catch (e) { return { error: e.message }; }
  });

  // Navigate the automation window to a bid URL
  ipcMain.handle("gem-participate-goto", async (_, { sessionId, url }) => {
    try {
      const win = getSessionWin(sessionId);
      if (!win) return { error: "Automation window is not open" };
      const u = new URL(url);
      if (u.protocol !== "https:" || !u.hostname.replace(/\.$/, "").endsWith(".gem.gov.in")) {
        return { error: "Only gem.gov.in URLs are allowed" };
      }
      await win.loadURL(url);
      return { ok: true };
    } catch (e) { return { error: e.message }; }
  });

  // Fill ONLY user-approved values into the current page
  ipcMain.handle("gem-participate-fill", async (_, { sessionId, fields }) => {
    try {
      const win = getSessionWin(sessionId);
      if (!win) return { error: "Automation window is not open" };
      if (!Array.isArray(fields) || !fields.length) return { error: "No approved fields to fill" };
      const safe = fields.map((f) => ({
        field_key: String(f.field_key || ""),
        field_label: String(f.field_label || ""),
        value: String(f.value ?? ""),
      }));
      const report = await pageExec(win, FILL_SCRIPT(JSON.stringify(safe)));
      emitEvent(getMainWindow, sessionId, "form_filled", report);
      return { ok: true, report };
    } catch (e) { return { error: e.message }; }
  });

  // Download an approved document (signed URL), verify its hash, attach to a
  // file input on the page via the DevTools protocol.
  ipcMain.handle("gem-participate-attach", async (_, { sessionId, url, fileName, sha256: expectedHash, inputIndex }) => {
    let tmpPath = null;
    try {
      const win = getSessionWin(sessionId);
      if (!win) return { error: "Automation window is not open" };

      const buffer = await downloadToBuffer(url);
      const actualHash = sha256(buffer);
      if (expectedHash && actualHash !== expectedHash) {
        emitEvent(getMainWindow, sessionId, "doc_hash_mismatch", { fileName, expectedHash, actualHash });
        return { error: `Hash mismatch for ${fileName} — upload blocked` };
      }

      tmpPath = path.join(os.tmpdir(), `gem-${sessionId}-${Date.now()}-${fileName.replace(/[^\w.\-]/g, "_")}`);
      fs.writeFileSync(tmpPath, buffer);

      const dbg = win.webContents.debugger;
      if (!dbg.isAttached()) dbg.attach("1.3");
      const { root } = await dbg.sendCommand("DOM.getDocument");
      const { nodeIds } = await dbg.sendCommand("DOM.querySelectorAll", {
        nodeId: root.nodeId,
        selector: 'input[type="file"]',
      });
      if (!nodeIds || !nodeIds.length) return { error: "No file upload field found on this page" };
      const idx = Math.min(inputIndex || 0, nodeIds.length - 1);
      await dbg.sendCommand("DOM.setFileInputFiles", { nodeId: nodeIds[idx], files: [tmpPath] });

      emitEvent(getMainWindow, sessionId, "doc_attached", { fileName, sha256: actualHash, inputIndex: idx });
      return { ok: true, sha256: actualHash, fileInputsOnPage: nodeIds.length };
    } catch (e) {
      return { error: e.message };
    } finally {
      // Give the page a moment to read the file before cleanup
      if (tmpPath) setTimeout(() => { try { fs.unlinkSync(tmpPath); } catch { /* already gone */ } }, 60000);
    }
  });

  // Screenshot of the automation window (evidence for the audit trail)
  ipcMain.handle("gem-participate-screenshot", async (_, { sessionId }) => {
    try {
      const win = getSessionWin(sessionId);
      if (!win) return { error: "Automation window is not open" };
      const image = await win.webContents.capturePage();
      const png = image.toPNG();
      return { ok: true, base64: png.toString("base64"), sha256: sha256(png), url: win.webContents.getURL() };
    } catch (e) { return { error: e.message }; }
  });

  // Final submit — clicks the page's submit control. Only callable after the
  // wizard's second explicit confirmation; this handler does no clicking on
  // its own initiative.
  ipcMain.handle("gem-participate-submit", async (_, { sessionId }) => {
    try {
      const win = getSessionWin(sessionId);
      if (!win) return { error: "Automation window is not open" };
      const res = await pageExec(win, `
(() => {
  const candidates = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn, a.button'))
    .filter((el) => el.offsetParent !== null)
    .filter((el) => /submit|save\\s*&\\s*continue|participate|final/i.test(el.textContent || el.value || ""));
  if (!candidates.length) return { clicked: false };
  candidates[0].click();
  return { clicked: true, label: (candidates[0].textContent || candidates[0].value || "").trim() };
})();
      `);
      emitEvent(getMainWindow, sessionId, "submit_clicked", res || {});
      return { ok: true, ...(res || {}) };
    } catch (e) { return { error: e.message }; }
  });

  // Scrape a confirmation/reference number from the current page
  ipcMain.handle("gem-participate-confirmation", async (_, { sessionId }) => {
    try {
      const win = getSessionWin(sessionId);
      if (!win) return { error: "Automation window is not open" };
      const res = await pageExec(win, `
(() => {
  const text = document.body ? document.body.innerText.substring(0, 8000) : "";
  const m = text.match(/(?:reference|confirmation|offer|bid)\\s*(?:no|number|id)\\.?\\s*[:#-]?\\s*([A-Z0-9\\/_-]{6,40})/i);
  return { url: location.href, reference: m ? m[1] : null, snippet: text.substring(0, 1200) };
})();
      `);
      return { ok: true, ...(res || {}) };
    } catch (e) { return { error: e.message }; }
  });

  // Close the session: destroy window, wipe the partition's cookies/storage
  ipcMain.handle("gem-participate-close", async (_, { sessionId }) => {
    try {
      const entry = activeSessions.get(sessionId);
      if (entry) {
        entry.otpCancelled = true;
        if (!entry.win.isDestroyed()) entry.win.destroy();
        const part = session.fromPartition(entry.partition);
        await part.clearStorageData();
        await part.clearCache();
        activeSessions.delete(sessionId);
      }
      emitEvent(getMainWindow, sessionId, "session_closed", {});
      return { ok: true };
    } catch (e) { return { error: e.message }; }
  });
}

module.exports = { registerGemAutomation };
