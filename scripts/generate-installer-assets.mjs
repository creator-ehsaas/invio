/**
 * Generates all installer assets for Invio desktop:
 *  - welcome.bmp     164×314  (NSIS sidebar, left panel)
 *  - header.bmp      150×57   (NSIS page header strip)
 *  - dmg-bg.png      540×380  (macOS DMG window background)
 *  - splash.png      600×400  (Electron splash screen)
 *
 * Run: node scripts/generate-installer-assets.mjs
 */

import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "../installer-assets");
mkdirSync(OUT, { recursive: true });

// ── Brand palette ──────��─────────────────────────────────────
const PURPLE_DARK  = "#1a0533";
const PURPLE_MID   = "#4f1b8e";
const PURPLE_LIGHT = "#7c3aed";
const ACCENT       = "#a78bfa";
const WHITE        = "#ffffff";
const WHITE_60     = "rgba(255,255,255,0.6)";
const WHITE_20     = "rgba(255,255,255,0.12)";
const WHITE_10     = "rgba(255,255,255,0.07)";

// ── Helpers ─────────────────────��────────────────────────────
function verticalGradient(ctx, x, y, w, h, stops) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  stops.forEach(([pos, color]) => g.addColorStop(pos, color));
  return g;
}

function radialGlow(ctx, cx, cy, r, color) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  return g;
}

function drawGrid(ctx, w, h) {
  ctx.save();
  ctx.strokeStyle = WHITE_10;
  ctx.lineWidth = 0.5;
  const step = 20;
  for (let x = 0; x <= w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.restore();
}

function circle(ctx, cx, cy, r, fill) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
}

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// ── 1. WELCOME BITMAP  164 × 314 ────────────���────────────────
function makeWelcome() {
  const W = 164, H = 314;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background gradient
  ctx.fillStyle = verticalGradient(ctx, 0, 0, W, H, [
    [0, "#1a0533"], [0.5, "#2d0a6e"], [1, "#1a0533"]
  ]);
  ctx.fillRect(0, 0, W, H);

  // Subtle dot grid
  drawGrid(ctx, W, H);

  // Glowing orbs
  ctx.fillStyle = radialGlow(ctx, 82, 100, 90, "rgba(124,58,237,0.4)");
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = radialGlow(ctx, 30, 280, 60, "rgba(167,139,250,0.3)");
  ctx.fillRect(0, 0, W, H);

  // Logo circle
  const lx = W / 2, ly = 90, lr = 30;
  circle(ctx, lx, ly, lr + 6, "rgba(167,139,250,0.2)"); // glow ring
  circle(ctx, lx, ly, lr, PURPLE_LIGHT);

  // "I" lettermark
  ctx.fillStyle = WHITE;
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("I", lx, ly + 1);

  // App name
  ctx.fillStyle = WHITE;
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Invio", W / 2, 140);

  // Tagline
  ctx.fillStyle = "rgba(167,139,250,0.9)";
  ctx.font = "10px sans-serif";
  ctx.fillText("Smart Business", W / 2, 158);
  ctx.fillText("Accounting", W / 2, 172);

  // Divider
  ctx.strokeStyle = "rgba(167,139,250,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, 192); ctx.lineTo(W - 20, 192); ctx.stroke();

  // Feature bullets
  const features = ["GST Ready", "AI Powered", "Voice Input", "Cloud Sync"];
  ctx.font = "9.5px sans-serif";
  features.forEach((f, i) => {
    const fy = 212 + i * 18;
    // dot
    circle(ctx, 28, fy, 3, ACCENT);
    ctx.fillStyle = WHITE_60;
    ctx.textAlign = "left";
    ctx.fillText(f, 38, fy + 0.5);
  });

  // Bottom version strip
  roundRect(ctx, 12, H - 32, W - 24, 20, 10, "rgba(255,255,255,0.08)");
  ctx.fillStyle = "rgba(167,139,250,0.7)";
  ctx.font = "8px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("invio.app  ·  v1.0.0", W / 2, H - 19);

  writeFileSync(join(OUT, "welcome.bmp"), canvas.toBuffer("image/png"));
  console.log("✓ welcome.bmp  (saved as PNG — electron-builder accepts PNG)");
}

// ── 2. HEADER BITMAP  150 × 57 ───────────────────────���───────
function makeHeader() {
  const W = 150, H = 57;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = verticalGradient(ctx, 0, 0, W, H, [
    [0, "#2d0a6e"], [1, "#1a0533"]
  ]);
  ctx.fillRect(0, 0, W, H);

  // Glow
  ctx.fillStyle = radialGlow(ctx, 30, 28, 40, "rgba(124,58,237,0.5)");
  ctx.fillRect(0, 0, W, H);

  // Logo circle
  circle(ctx, 24, 28, 15, PURPLE_LIGHT);
  ctx.fillStyle = WHITE;
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("I", 24, 29);

  // App name
  ctx.fillStyle = WHITE;
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Invio", 46, 22);

  ctx.fillStyle = ACCENT;
  ctx.font = "9px sans-serif";
  ctx.fillText("Business Accounting", 46, 38);

  writeFileSync(join(OUT, "header.bmp"), canvas.toBuffer("image/png"));
  console.log("✓ header.bmp");
}

// ── 3. macOS DMG BACKGROUND  540 × 380 ──────────────────────
function makeDmgBackground() {
  const W = 540, H = 380;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = verticalGradient(ctx, 0, 0, W, H, [
    [0, "#0f0020"], [0.45, "#2d0a6e"], [1, "#1a0533"]
  ]);
  ctx.fillRect(0, 0, W, H);

  // Grid
  drawGrid(ctx, W, H);

  // Large glow behind logo
  ctx.fillStyle = radialGlow(ctx, W / 2, 120, 180, "rgba(124,58,237,0.35)");
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = radialGlow(ctx, 100, H - 50, 120, "rgba(167,139,250,0.2)");
  ctx.fillRect(0, 0, W, H);

  // Logo circle
  const lx = W / 2, ly = 110, lr = 50;
  circle(ctx, lx, ly, lr + 10, "rgba(124,58,237,0.25)");
  circle(ctx, lx, ly, lr + 4, "rgba(124,58,237,0.4)");
  circle(ctx, lx, ly, lr, PURPLE_LIGHT);
  ctx.fillStyle = WHITE;
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("I", lx, ly + 2);

  // App name
  ctx.fillStyle = WHITE;
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Invio", W / 2, 192);

  // Subtitle
  ctx.fillStyle = ACCENT;
  ctx.font = "14px sans-serif";
  ctx.fillText("Smart Business Accounting · GST Ready · AI Powered", W / 2, 216);

  // Horizontal divider
  ctx.strokeStyle = "rgba(167,139,250,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(60, 238); ctx.lineTo(W - 60, 238); ctx.stroke();

  // Install instructions row
  const arrowY = 290;
  // App icon placeholder
  roundRect(ctx, 130, 252, 76, 76, 18, "rgba(124,58,237,0.4)");
  ctx.fillStyle = WHITE;
  ctx.font = "bold 24px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("I", 168, 290);
  ctx.fillStyle = WHITE_60;
  ctx.font = "11px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Invio.app", 168, 342);

  // Arrow
  ctx.fillStyle = ACCENT;
  ctx.font = "28px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("→", W / 2, 298);

  // Applications folder icon
  roundRect(ctx, W - 206, 252, 76, 76, 18, "rgba(255,255,255,0.08)");
  ctx.fillStyle = WHITE_60;
  ctx.font = "28px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("📁", W - 168, 290);
  ctx.fillStyle = WHITE_60;
  ctx.font = "11px sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Applications", W - 168, 342);

  // Drag tip
  ctx.fillStyle = "rgba(167,139,250,0.5)";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Drag Invio to the Applications folder to install", W / 2, 365);

  writeFileSync(join(OUT, "dmg-background.png"), canvas.toBuffer("image/png"));
  console.log("✓ dmg-background.png");
}

// ── 4. SPLASH SCREEN  600 × 400 ──────────────────────────────
function makeSplash() {
  const W = 600, H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = verticalGradient(ctx, 0, 0, W, H, [
    [0, "#0d001f"], [0.5, "#1f0755"], [1, "#0d001f"]
  ]);
  ctx.fillRect(0, 0, W, H);

  // Dot grid overlay
  drawGrid(ctx, W, H);

  // Big radial glow
  ctx.fillStyle = radialGlow(ctx, W / 2, H / 2 - 30, 220, "rgba(124,58,237,0.45)");
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = radialGlow(ctx, 80, H - 60, 150, "rgba(167,139,250,0.2)");
  ctx.fillRect(0, 0, W, H);

  // Floating decorative circles
  [[520, 60, 35], [540, 340, 20], [50, 100, 15], [30, 320, 25]].forEach(([cx, cy, r]) => {
    circle(ctx, cx, cy, r, "rgba(124,58,237,0.15)");
    circle(ctx, cx, cy, r * 0.6, "rgba(124,58,237,0.1)");
  });

  // Logo ring
  const lx = W / 2, ly = 155;
  circle(ctx, lx, ly, 60, "rgba(124,58,237,0.2)");
  circle(ctx, lx, ly, 52, "rgba(124,58,237,0.35)");
  circle(ctx, lx, ly, 44, PURPLE_LIGHT);
  circle(ctx, lx, ly, 34, "#6d28d9"); // inner circle
  ctx.fillStyle = WHITE;
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("I", lx, ly + 2);

  // App name
  ctx.fillStyle = WHITE;
  ctx.font = "bold 42px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Invio", W / 2, 245);

  // Tagline
  ctx.fillStyle = ACCENT;
  ctx.font = "14px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Smart Business Accounting", W / 2, 272);

  // Feature pills row
  const pills = ["GST Ready", "AI Powered", "Voice Input", "Offline"];
  const pw = 88, ph = 24, gap = 10;
  const totalW = pills.length * pw + (pills.length - 1) * gap;
  const startX = (W - totalW) / 2;
  pills.forEach((p, i) => {
    const px = startX + i * (pw + gap);
    roundRect(ctx, px, 296, pw, ph, 12, "rgba(124,58,237,0.3)");
    // pill border
    ctx.strokeStyle = "rgba(167,139,250,0.4)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(px, 296, pw, ph, 12);
    ctx.stroke();
    ctx.fillStyle = ACCENT;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p, px + pw / 2, 296 + ph / 2);
  });

  // Loading bar background
  roundRect(ctx, 160, 348, W - 320, 4, 2, "rgba(255,255,255,0.1)");
  // Loading bar fill (animated in the actual app, this is a static asset)
  roundRect(ctx, 160, 348, (W - 320) * 0.6, 4, 2, PURPLE_LIGHT);

  // Version + copyright
  ctx.fillStyle = "rgba(167,139,250,0.4)";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("v1.0.0  ·  © 2025 Invio  ·  invio.app", W / 2, 384);

  writeFileSync(join(OUT, "splash.png"), canvas.toBuffer("image/png"));
  console.log("✓ splash.png");
}

// ── Run all ──────────────────────────────────────────────────
makeWelcome();
makeHeader();
makeDmgBackground();
makeSplash();
console.log("\nAll installer assets generated in installer-assets/");
