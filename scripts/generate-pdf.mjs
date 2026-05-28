import { launch } from "D:/invio/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, "../public/invio-investor-deck.html");
const outPath = path.resolve(__dirname, "../public/invio-investor-deck.pdf");

if (!fs.existsSync(htmlPath)) {
  console.error("HTML file not found:", htmlPath);
  process.exit(1);
}

console.log("Launching browser...");
const browser = await launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage();

const fileUrl = "file:///" + htmlPath.replace(/\\/g, "/");
console.log("Loading:", fileUrl);
await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 30000 });

await new Promise(r => setTimeout(r, 2000));

console.log("Generating PDF...");
await page.pdf({
  path: outPath,
  format: "A4",
  printBackground: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
  preferCSSPageSize: true,
});

await browser.close();
console.log("PDF saved to:", outPath);
