/**
 * Document text extraction for the GeM crawler (Electron main process).
 *
 * GeM tenders attach a mix of formats: PDFs (text or scanned), DOCX
 * (annexures, ATC), XLSX (BOQ / price schedules). The crawler must read
 * all of them — BOQ rates and eligibility tables frequently live only in
 * the spreadsheet/word attachments, not the main bid PDF.
 */

const { PDFParse } = require("pdf-parse");

// pdf-parse v2 renders via @napi-rs/canvas, which expects DOMMatrix to exist.
function ensureCanvasGlobals() {
  if (typeof globalThis.DOMMatrix === "undefined") {
    try {
      const { DOMMatrix } = require("@napi-rs/canvas");
      globalThis.DOMMatrix = DOMMatrix;
    } catch {
      // Screenshot rendering will be unavailable; text extraction still works.
    }
  }
}

/**
 * Identify a downloaded buffer. GeM download URLs often have no file
 * extension, so sniff magic bytes first and fall back to the URL.
 */
function sniffDocType(buffer, url = "", contentType = "") {
  const head = buffer.slice(0, 8).toString("latin1");
  if (head.startsWith("%PDF-") || contentType.includes("pdf")) return "pdf";
  if (head.startsWith("PK\x03\x04")) {
    // Office Open XML containers are all zips — disambiguate by URL/MIME
    if (/\.docx($|\?)/i.test(url) || contentType.includes("wordprocessingml")) return "docx";
    if (/\.xlsx($|\?)/i.test(url) || contentType.includes("spreadsheetml")) return "xlsx";
    return "zip"; // unknown zip — try docx then xlsx
  }
  if (/\.doc($|\?)/i.test(url) || contentType.includes("msword")) return "doc";
  if (/\.xls($|\?)/i.test(url) || contentType.includes("ms-excel")) return "xls";
  const printable = buffer.slice(0, 512).toString("utf-8");
  // Heuristic: HTML pages start with markup; anything else binary is unknown
  if (/<\s*(!doctype|html|head|body|div|table|script)/i.test(printable)) return "html";
  if (contentType.includes("html") || contentType.includes("text")) return "html";
  return "binary";
}

/** Extract text from a PDF buffer. Returns { text, numPages }. */
async function pdfToText(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { text: result.text || "", numPages: result.total || 0 };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/**
 * Render PDF pages to PNG data-URL strings — used to OCR scanned tenders
 * where getText() returns (almost) nothing.
 */
async function pdfToImages(buffer, maxPages = 4, scale = 1.5) {
  ensureCanvasGlobals();
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const shot = await parser.getScreenshot({ first: maxPages, scale, imageBuffer: false });
    return (shot.pages || [])
      .map((p) => p.dataUrl)
      .filter((d) => typeof d === "string" && d.startsWith("data:image"));
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/** Extract text from a DOCX buffer via mammoth. */
async function docxToText(buffer) {
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

/**
 * Extract a spreadsheet as labeled CSV blocks — preserves rows/columns so
 * BOQ quantity/rate tables stay readable for the AI.
 */
function xlsxToText(buffer) {
  const XLSX = require("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const parts = [];
  for (const name of wb.SheetNames.slice(0, 10)) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    if (csv.trim()) parts.push(`[Sheet: ${name}]\n${csv}`);
  }
  return parts.join("\n\n");
}

/**
 * GeM bid documents are bilingual — every Hindi label is immediately
 * followed by its English equivalent — and PDF extraction mangles the
 * Devanagari anyway (doubled glyphs: "बड बड ववरण ववरण", broken conjuncts:
 * "काया%लय"). The Hindi carries no extra information but tokenizes ~4x
 * worse than English, so drop any word containing Devanagari before the
 * per-document caps are applied — it roughly doubles the useful content
 * that fits.
 */
function stripBilingualNoise(text) {
  return text
    // Detach English that's slash-joined to a Hindi label ("ववरण//Bid Details")
    .replace(/([ऀ-ॿ][^\s]*?)\/+(?=[A-Za-z])/g, "$1 /")
    // Remove every whitespace-delimited word containing Devanagari
    .replace(/[^\s]*[ऀ-ॿ][^\s]*/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Best-effort extraction for an unknown zip (no extension): try DOCX,
 * then XLSX. Returns { format, text } or null.
 */
async function zipToText(buffer) {
  try {
    const text = await docxToText(buffer);
    if (text.trim().length > 50) return { format: "docx", text };
  } catch {}
  try {
    const text = xlsxToText(buffer);
    if (text.trim().length > 20) return { format: "xlsx", text };
  } catch {}
  return null;
}

module.exports = { sniffDocType, pdfToText, pdfToImages, docxToText, xlsxToText, zipToText, stripBilingualNoise };
