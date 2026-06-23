// Smoke test for electron/doc-extract.js — run: node scripts/test-doc-extract.js
const { pdfToText, pdfToImages, xlsxToText, sniffDocType } = require("../electron/doc-extract");

function makeMinimalPdf() {
  const content = "BT /F1 18 Tf 72 720 Td (Estimated Bid Value 123456) Tj ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

(async () => {
  const pdfBuf = makeMinimalPdf();
  console.log("sniff:", sniffDocType(pdfBuf, "", ""));

  const { text, numPages } = await pdfToText(pdfBuf);
  console.log("pdfToText pages:", numPages, "| text:", JSON.stringify(text.trim().slice(0, 80)));
  if (!text.includes("123456")) throw new Error("PDF text extraction failed");

  const images = await pdfToImages(pdfBuf, 1, 1.0);
  console.log("pdfToImages:", images.length, "page(s),", images[0]?.slice(0, 30), "len:", images[0]?.length);
  if (!images.length) throw new Error("PDF screenshot rendering failed");

  const XLSX = require("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([["Item", "Qty", "Rate"], ["Steel Pipe", 100, 450.5]]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BOQ");
  const xlsxBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  console.log("xlsx sniff:", sniffDocType(xlsxBuf, "boq.xlsx", ""));
  const csv = xlsxToText(xlsxBuf);
  console.log("xlsxToText:", JSON.stringify(csv));
  if (!csv.includes("450.5")) throw new Error("XLSX extraction failed");

  console.log("\nALL OK");
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
