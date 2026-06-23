/**
 * Server-side PDF text extraction using pdf-parse v2.
 *
 * pdf-parse v2 has no callable default export — it exposes a PDFParse
 * class and needs its worker wired up explicitly under Next.js bundling.
 * Every route that reads PDF text should go through this helper.
 */
export async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    if (typeof globalThis.DOMMatrix === "undefined") {
      const { DOMMatrix } = await import("@napi-rs/canvas");
      (globalThis as any).DOMMatrix = DOMMatrix;
    }
    const { PDFParse } = await import("pdf-parse");
    const worker = await import("pdf-parse/worker");
    PDFParse.setWorker(worker.getData());
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text || null;
    } finally {
      await parser.destroy().catch(() => {});
    }
  } catch (err) {
    console.error("PDF text extraction failed:", (err as Error).message);
    return null;
  }
}
