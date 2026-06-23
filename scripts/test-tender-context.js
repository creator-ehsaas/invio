// Functional test for buildTenderContext — run: node scripts/test-tender-context.js
const { buildTenderContext } = require("../.tmp-test/tender-context");

const pageFooter = "GeM Bid Document - Government e-Marketplace Portal Page Footer Text";
const sharedClause = "The bidder must possess a valid BIS certification for IS 1239 and submit test reports from a NABL accredited laboratory along with the technical bid documents for evaluation purposes by the buyer committee.".repeat(1);

// Real GeM bilingual extraction artifacts: doubled Devanagari glyphs,
// broken conjuncts with embedded Latin chars, slash-joined English labels
const bilingual = `बड बड ववरण ववरण//Bid Details
बड बड बंद बंद होने होने क क तारख तारख//समय समय /Bid End Date/Time 25-05-2026 11:00:00
काया%लय काया%लय का का नाम नाम /Office Name Fhq Ssb New Delhi
अनुमािनत अनुमािनत बड बड मूWय मूWय / Estimated Bid Value 5083000
ईएमड रािश/EMD Amount 254150`;

const raw = [
  "Bid Number: GEM/2026/B/12345\nTitle: Supply of MS Pipes\nEstimated Value: ₹N/A",
  `=== ATC: Buyer Terms ===\n${bilingual}`,
  `=== MAIN BID DOCUMENT: Bid Document ===\nEstimated Bid Value 2500000\n${pageFooter}\nDelivery within 30 days........................ to consignee location\n${sharedClause}\n${pageFooter}\nEMD Amount 50000\n${pageFooter}`,
  `=== SPECIFICATION: Technical Spec ===\nPipe diameter 100mm, thickness 4.5mm, IS 1239 Part 1\n${pageFooter}\nGalvanization 120 GSM minimum`,
  `=== CORRIGENDUM: Corrigendum 1 ===\n${sharedClause}\nDelivery period extended to 45 days`,
  `=== BOQ (XLSX): Price Schedule ===\n[Sheet: BOQ]\nItem,Qty,Rate\nMS Pipe 100mm,500,`,
].join("\n\n");

const out = buildTenderContext(raw, 48000);
console.log(out);
console.log("\n--- checks ---");
const checks = {
  "metadata kept": out.includes("GEM/2026/B/12345"),
  "estimated value kept": out.includes("2500000"),
  "spec kept": out.includes("120 GSM"),
  "BOQ kept": out.includes("MS Pipe 100mm,500"),
  "corrigendum unique line kept": out.includes("extended to 45 days"),
  "dup clause appears once": out.split("NABL accredited").length === 2,
  "page footer appears once": out.split("Portal Page Footer").length === 2,
  "dot leaders stripped": !out.includes("......"),
  "devanagari stripped": !/[ऀ-ॿ]/.test(out),
  "english label survives slash-join": out.includes("/Bid Details") && out.includes("/Bid End Date/Time 25-05-2026 11:00:00"),
  "english values survive": out.includes("/Office Name Fhq Ssb New Delhi") && out.includes("/ Estimated Bid Value 5083000") && out.includes("/EMD Amount 254150"),
};
// Electron-side variant must behave the same
const { stripBilingualNoise } = require("../electron/doc-extract");
const stripped = stripBilingualNoise(bilingual);
checks["electron strip matches"] = !/[ऀ-ॿ]/.test(stripped)
  && stripped.includes("/Bid Details")
  && stripped.includes("Estimated Bid Value 5083000");
let ok = true;
for (const [name, pass] of Object.entries(checks)) {
  console.log(pass ? "PASS" : "FAIL", "-", name);
  if (!pass) ok = false;
}
// Budget enforcement
const tight = buildTenderContext(raw, 600);
console.log(tight.length <= 650 ? "PASS" : "FAIL", "- budget enforced (len", tight.length + ")");
if (tight.length > 650) ok = false;
if (!ok) process.exit(1);
console.log("\nALL OK");
