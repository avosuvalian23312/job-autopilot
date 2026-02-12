// backend/src/lib/pdfTailor.js
"use strict";

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

let _pdfjs = null;
let _pdfjsPromise = null;

async function getPdfJs() {
  if (_pdfjs) return _pdfjs;
  if (_pdfjsPromise) return _pdfjsPromise;

  const tryRequire = (p) => {
    try {
      // eslint-disable-next-line global-require
      return require(p);
    } catch {
      return null;
    }
  };

  const tryImport = async (p) => {
    try {
      return await import(p);
    } catch {
      return null;
    }
  };

  _pdfjsPromise = (async () => {
    // 1) CommonJS builds (older pdfjs-dist)
    let mod =
      tryRequire("pdfjs-dist/legacy/build/pdf.js") ||
      tryRequire("pdfjs-dist/build/pdf.js");

    // 2) ESM builds (pdfjs-dist v5+) -> pdf.mjs
    if (!mod) {
      mod =
        (await tryImport("pdfjs-dist/legacy/build/pdf.mjs")) ||
        (await tryImport("pdfjs-dist/build/pdf.mjs"));
    }

    if (!mod) {
      throw new Error(
        "pdfjs-dist is missing or incompatible. Tried legacy/build/pdf.js, build/pdf.js, legacy/build/pdf.mjs, build/pdf.mjs"
      );
    }

    // Handle default export + some versions nesting under pdfjsLib
    let lib = mod.default || mod;
    if (lib && lib.pdfjsLib && lib.pdfjsLib.getDocument) lib = lib.pdfjsLib;

    _pdfjs = lib;
    return _pdfjs;
  })();

  return _pdfjsPromise;
}

function norm(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function chunkText(text, maxLen = 14000) {
  const s = String(text || "");
  if (s.length <= maxLen) return s;
  const chunks = [];
  let i = 0;
  while (i < s.length) {
    chunks.push(s.slice(i, i + maxLen));
    i += maxLen;
  }
  return chunks.join("\n\n---CHUNK---\n\n");
}

/**
 * Extract lines with approximate bounding boxes using pdfjs text items.
 */
async function extractPdfLinesWithBoxes(pdfBuffer, opts = {}) {
  const pdfjs = await getPdfJs();

  const maxPages = Number(opts.maxPages || 12);
  const yTolerance = Number(opts.yTolerance || 2.5);

  const loadingTask = pdfjs.getDocument({
    data: pdfBuffer,
    disableWorker: true
  });

  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, maxPages);

  const pages = [];
  let resumeText = "";

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    const items = Array.isArray(textContent.items) ? textContent.items : [];
    const Util = pdfjs.Util;

    const words = [];
    for (const it of items) {
      const str = String(it?.str || "");
      if (!str.trim()) continue;

      const tx = Util.transform(viewport.transform, it.transform);

      const x = tx[4];
      const yTopOrigin = tx[5];
      const y = viewport.height - yTopOrigin;

      const fontSize = Math.max(6, Math.hypot(tx[2], tx[3]) || 10);
      const w = Number(it.width || 0);
      const h = Number(it.height || fontSize);

      words.push({ text: str, x, y, w, h, fontSize });
    }

    words.sort((a, b) => {
      if (b.y !== a.y) return b.y - a.y;
      return a.x - b.x;
    });

    const lines = [];
    for (const w of words) {
      const existing = lines.find((ln) => Math.abs(ln.y - w.y) <= yTolerance);
      if (!existing) lines.push({ y: w.y, items: [w] });
      else existing.items.push(w);
    }

    const finalLines = lines
      .map((ln) => {
        ln.items.sort((a, b) => a.x - b.x);

        let text = "";
        let lastX = null;

        let minX = Infinity;
        let maxX = -Infinity;
        let maxH = 0;
        let fs = 10;

        for (const it of ln.items) {
          const t = String(it.text || "");
          if (!t) continue;

          minX = Math.min(minX, it.x);
          maxX = Math.max(maxX, it.x + (it.w || 0));
          maxH = Math.max(maxH, it.h || it.fontSize || 10);
          fs = Math.max(fs, it.fontSize || 10);

          if (lastX == null) {
            text += t;
            lastX = it.x + (it.w || 0);
            continue;
          }

          const gap = it.x - lastX;
          if (gap > 1.5) text += " ";
          text += t;
          lastX = it.x + (it.w || 0);
        }

        text = norm(text);
        if (!text) return null;

        return {
          text,
          norm: text,
          x: Number.isFinite(minX) ? minX : 0,
          y: ln.y,
          width: Number.isFinite(maxX - minX) ? maxX - minX : 500,
          height: maxH || fs * 1.2,
          fontSize: fs || 10
        };
      })
      .filter(Boolean);

    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      lines: finalLines
    });

    resumeText += `\n\n[PAGE ${pageNumber}]\n` + finalLines.map((l) => l.text).join("\n");
  }

  return { pages, resumeText: resumeText.trim() };
}

/**
 * Overlay replacements on top of existing PDF.
 */
async function applyPdfReplacements(originalPdfBuffer, pages, replacements = []) {
  const pdfDoc = await PDFDocument.load(originalPdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const overlaysApplied = [];
  const misses = [];

  const allLines = [];
  for (let i = 0; i < (pages || []).length; i++) {
    const p = pages[i];
    for (const ln of p.lines || []) allLines.push({ pageIndex: i, ...ln });
  }

  const used = new Set();

  for (const rep of replacements || []) {
    const from = norm(rep?.from);
    const to = String(rep?.to || "").trim();
    if (!from || !to) continue;

    const hit = allLines.find((ln, idx) => ln.norm === from && !used.has(idx));
    if (!hit) {
      misses.push({ from, reason: "not_found" });
      continue;
    }

    const idx = allLines.indexOf(hit);
    used.add(idx);

    const page = pdfDoc.getPage(hit.pageIndex);

    const padX = 1;
    const padY = 1;

    page.drawRectangle({
      x: hit.x - padX,
      y: hit.y - padY,
      width: hit.width + padX * 2,
      height: hit.height + padY * 2,
      color: rgb(1, 1, 1),
      opacity: 1
    });

    let size = Math.max(7, hit.fontSize || 10);
    const maxW = Math.max(50, hit.width || 300);

    const wAt = (s, sz) => font.widthOfTextAtSize(String(s || ""), sz);
    const measured = wAt(to, size);

    if (measured > maxW) {
      const scale = maxW / measured;
      size = Math.max(7, size * scale * 0.98);
    }

    page.drawText(to, { x: hit.x, y: hit.y, size, font, color: rgb(0, 0, 0) });

    overlaysApplied.push({ page: hit.pageIndex + 1, from, to });
  }

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, overlaysApplied, misses };
}

module.exports = {
  getPdfJs,
  extractPdfLinesWithBoxes,

  // ✅ Backwards-compatible alias so old code doesn’t crash:
  extractPdfLayout: extractPdfLinesWithBoxes,

  applyPdfReplacements,
  chunkText
};
