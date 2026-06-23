/**
 * Builds a token-efficient context string from crawled tender text.
 *
 * GeM tender text is extremely redundant: dot-leader fill, per-page
 * headers/footers repeated on every page, and corrigenda/ATC documents
 * that reprint the original tender wholesale. Naively truncating wastes
 * the token budget on duplicates and cuts off later documents (BOQ,
 * corrigenda) entirely. This module cleans, dedupes, and reassembles the
 * text by document priority so more *unique* content fits in fewer tokens.
 */

interface Section {
  header: string; // "" for the preamble before the first === marker
  body: string;
}

// Lower = more important. Matched against the section header text.
const SECTION_PRIORITY: [RegExp, number][] = [
  [/MAIN BID DOCUMENT/i, 0],
  [/SPECIFICATION/i, 1],
  [/BOQ/i, 2],
  [/SCANNED|OCR/i, 3],
  [/CORRIGENDUM/i, 4],
  [/ATC/i, 5],
  [/UPLOADED DOCUMENT/i, 6],
  [/LINKED PAGE/i, 8],
];

function sectionPriority(header: string): number {
  for (const [re, p] of SECTION_PRIORITY) if (re.test(header)) return p;
  return 7;
}

/** Strip PDF text artifacts that carry no information. */
function cleanBody(body: string): string {
  return body
    // GeM documents are bilingual (every Hindi label has an English twin)
    // and extraction mangles the Devanagari — drop Hindi-containing words.
    // First detach English slash-joined to a Hindi label ("ववरण//Bid Details").
    .replace(/([ऀ-ॿ][^\s]*?)\/+(?=[A-Za-z])/g, "$1 /")
    .replace(/[^\s]*[ऀ-ॿ][^\s]*/g, "")
    .replace(/-- \d+ of \d+ --/g, "") // pdf-parse page joiners
    .replace(/^[ \t]*Page \d+ of \d+[ \t]*$/gim, "")
    .replace(/\.{4,}/g, " ") // dot leaders in tables of contents/forms
    .replace(/_{4,}/g, " ")
    .replace(/-{6,}/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function buildTenderContext(raw: string, budgetChars = 48000): string {
  // 1. Split into document sections on the crawler's === HEADER: name === markers
  const sections: Section[] = [];
  const parts = raw.split(/\n?=== ([^=\n]{1,200}) ===\n?/);
  // parts = [preamble, header1, body1, header2, body2, ...]
  if (parts[0]?.trim()) sections.push({ header: "", body: parts[0] });
  for (let i = 1; i < parts.length - 1; i += 2) {
    sections.push({ header: parts[i].trim(), body: parts[i + 1] || "" });
  }

  // 2. Find lines repeated across the document — page headers/footers print
  //    on every page, and corrigenda/ATC reprint original clauses. A long
  //    line appearing even twice is never coincidence; shorter lines (table
  //    headers etc.) need 3+ occurrences. Keep only the first occurrence.
  const lineCounts = new Map<string, number>();
  for (const s of sections) {
    for (const line of s.body.split("\n")) {
      const key = normalize(line);
      if (key.length > 30) lineCounts.set(key, (lineCounts.get(key) || 0) + 1);
    }
  }
  const repeatedLines = new Set(
    [...lineCounts.entries()]
      .filter(([k, n]) => n >= (k.length > 80 ? 2 : 3))
      .map(([k]) => k)
  );

  // 3. Clean + dedupe. Paragraph dedupe runs across sections in priority
  //    order so the duplicate copy in the lower-priority document is the
  //    one dropped (corrigenda reprint the original tender).
  const ordered = sections
    .map((s, idx) => ({ ...s, idx, priority: s.header ? sectionPriority(s.header) : -1 }))
    .sort((a, b) => a.priority - b.priority || a.idx - b.idx);

  const seenLines = new Set<string>();
  const seenParagraphs = new Set<string>();

  for (const s of ordered) {
    const kept: string[] = [];
    for (const line of cleanBody(s.body).split("\n")) {
      const key = normalize(line);
      if (repeatedLines.has(key)) {
        if (seenLines.has(key)) continue;
        seenLines.add(key);
      }
      kept.push(line);
    }
    const paragraphs = kept.join("\n").split(/\n\n+/);
    const uniqueParas: string[] = [];
    for (const p of paragraphs) {
      const key = normalize(p);
      if (key.length > 150) {
        if (seenParagraphs.has(key)) continue;
        seenParagraphs.add(key);
      }
      if (p.trim()) uniqueParas.push(p.trim());
    }
    s.body = uniqueParas.join("\n\n");
  }

  // 4. Assemble within budget, most important documents first. The
  //    preamble (bid metadata) is always included in full.
  let remaining = budgetChars;
  const included = new Map<number, string>(); // original idx → text

  for (const s of ordered) {
    if (remaining <= 200) break;
    const headerLine = s.header ? `\n\n=== ${s.header} ===\n` : "";
    const room = remaining - headerLine.length;
    if (room <= 200 && s.header) continue;
    const body = s.body.length > room ? s.body.substring(0, room) : s.body;
    if (!body.trim()) continue;
    included.set(s.idx, `${headerLine}${body}`);
    remaining -= headerLine.length + body.length;
  }

  // Emit in original document order so cross-references still read naturally
  return [...included.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, text]) => text)
    .join("")
    .trim();
}
