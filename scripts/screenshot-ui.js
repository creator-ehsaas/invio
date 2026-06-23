// Screenshot the new UI for visual verification — run: node scripts/screenshot-ui.js
const puppeteer = require("puppeteer");

(async () => {
  const base = "http://localhost:3000";
  // wait for server
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base + "/login");
      if (r.ok || r.status === 200) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });

  await page.goto(base + "/login", { waitUntil: "networkidle0", timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: "scripts/shot-login.png" });
  console.log("login captured");

  // dark mode
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await page.reload({ waitUntil: "networkidle0", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: "scripts/shot-login-dark.png" });
  console.log("login dark captured");

  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
