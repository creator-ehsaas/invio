// WCAG 2.2 contrast audit for the Ledger Heritage tokens.
// Reads the CURRENT values from src/app/globals.css and checks every
// combination the UI actually uses. Run: node scripts/check-contrast.js
const fs = require("fs");

const css = fs.readFileSync("src/app/globals.css", "utf-8");

function extractVars(block) {
  const vars = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6,8})\s*;/g)) vars[m[1]] = m[2];
  return vars;
}
const rootBlock = css.match(/:root\s*{([\s\S]*?)\n}/)?.[1] || "";
const darkBlock = css.match(/\.dark\s*{([\s\S]*?)\n}/)?.[1] || "";
const light = extractVars(rootBlock);
const dark = extractVars(darkBlock);

function lum(hex) {
  const h = hex.replace("#", "").slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [bg, fg, minimum, usage]  — 4.5 normal text, 3 large text / UI parts
function pairs(t, mode) {
  return [
    [t.background, t.foreground, 4.5, `${mode}: body text on page`],
    [t.card, t["card-foreground"], 4.5, `${mode}: text on card`],
    [t.background, t["muted-foreground"], 4.5, `${mode}: muted text on page`],
    [t.card, t["muted-foreground"], 4.5, `${mode}: muted text on card`],
    [t.muted, t["muted-foreground"], 4.5, `${mode}: muted text on muted bg`],
    [t.primary, t["primary-foreground"], 4.5, `${mode}: button text`],
    [t.secondary, t["secondary-foreground"], 4.5, `${mode}: secondary button text`],
    [t.accent, t["accent-foreground"], 4.5, `${mode}: accent hover text`],
    [t.card, t.destructive, 4.5, `${mode}: destructive text on card`],
    [t.card, t.vermillion, 4.5, `${mode}: vermillion text on card`],
    [t["vermillion-soft"], t.vermillion, 4.5, `${mode}: vermillion stamp (overdue)`],
    [t.card, t["ledger-green"], 4.5, `${mode}: green text on card`],
    [t["ledger-green-soft"], t["ledger-green"], 4.5, `${mode}: green stamp (paid)`],
    [t.card, t.marigold, 4.5, `${mode}: marigold text on card`],
    [t["marigold-soft"], t.marigold, 4.5, `${mode}: marigold stamp (partial)`],
    [t.card, t.peacock, 4.5, `${mode}: peacock text on card`],
    [t["peacock-soft"], t.peacock, 4.5, `${mode}: peacock stamp (sent)`],
    [t.input, t["border-strong"] || t.border, 3, `${mode}: input border (1.4.11 non-text)`],
    [t.background, t.vermillion, 3, `${mode}: vermillion UI marks (bars, underline)`],
  ];
}

let fail = 0;
for (const [bg, fg, min, usage] of [...pairs(light, "light"), ...pairs(dark, "dark")]) {
  if (!bg || !fg) { console.log("SKIP (missing token) -", usage); continue; }
  const r = ratio(bg, fg);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${r.toFixed(2)}:1 (need ${min}) - ${usage} [${fg} on ${bg}]`);
}
console.log(fail ? `\n${fail} combination(s) FAILED` : "\nALL COMBINATIONS PASS");
process.exit(fail ? 1 : 0);
