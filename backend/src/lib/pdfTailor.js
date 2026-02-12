// backend/src/lib/pdfTailor.js
"use strict";

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

let _pdfjs = null;
let _pdfjsPromise = null;

/**
 * pdfjs-dist v5+ ships ESM (.mjs). In CommonJS (your backend),
 * we must load it via dynamic import().
 *
 * We try legacy first (most Node-friendly), then modern build,
 * then fall back to old CommonJS paths for v2/v3 if someone pins later.
 */
async function getPdfJs() {
  if (_pdfjs) return _pdfjs;
  if (_pdfjsPromise) return _pdfjsPromise;

  const load = async () => {
    // --- v5+ (ESM) ---
    try {
      const mod = await import("pdfjs-dist/legacy/build/pdf.mjs");
      _pdfjs = mod?.default || mod;
      return _pdfjs;
    } catch (e1) {
      try {
        const mod = await import("pdfjs-dist/build/pdf.mjs");
        _pdfjs = mod?.default || mod;
        return _pdfjs;
      } catch (e2) {
        // --- v2/v3 (CommonJS) fallback ---
        try {
          // eslint-disable-next-line global-require
          _pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
          return _pdfjs;
        } catch (e3) {
          try {
            // eslint-disable-next-line global-require
            _pdfjs = require("pdfjs-dist/build/pdf.js");
            return _pdfjs;
          } catch (e4) {
            const msg =
              "pdfjs-dist is missing or incompatible. " +
              "For pdfjs-dist@5.x (your current version), CommonJS MUST use dynamic import of .mjs. " +
              "Tried: legacy/build/pdf.mjs, build/pdf.mjs, legacy/build/pdf.js, build/pdf.js";
            const err = new Error(msg);
            err.cause = {
              e1: e1?.message,
              e2: e2?.message,
              e3: e3?.message,
              e4: e4?.message,
            };
            throw err;
          }
        }
      }
    }
  };

  _pdfjsPromise = load();
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
 * Returns:
 *  - pages: [{ pageNumber, width, height, lines:[{ text, norm, x, y, width, height, fontSize }] }]
 *  - resumeText: page-marked text (good for AOAI prompts)
 */
async function extractPdfLinesWithBoxes(pdfBuffer, opts = {}) {
  const pdfjs = await getPdfJs();

  const maxPages = Number(opts.maxPages || 12);
  const yTolerance = Number(opts.yTolerance || 2.5);

  const loadingTask = pdfjs.getDocument({
    data: pdfBuffer, // Buffer is Uint8Array in Node -> ok
    disableWorker: true, // ✅ important in Functions/Node
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

    // Convert items -> positioned words
    const words = [];
    for (const it of items) {
      const str = String(it?.str || "");
      if (!str.trim()) continue;

      // Combine transforms into viewport space
      const tx = pdfjs.Util.transform(viewport.transform, it.transform);

      const x = tx[4];
      const yTopOrigin = tx[5];

      // Convert viewport(top-left origin) -> PDF(bottom-left origin)
      const y = viewport.height - yTopOrigin;

      const fontSize = Math.max(6, Math.hypot(tx[2], tx[3]) || 10);
      const w = Number(it.width || 0);
      const h = Number(it.height || fontSize);

      words.push({
        text: str,
        x,
        y,
        w,
        h,
        fontSize,
      });
    }

    // Group into lines by y
    words.sort((a, b) => {
      // top-to-bottom
      if (b.y !== a.y) return b.y - a.y;
      return a.x - b.x;
    });

    const lines = [];
    for (const w of words) {
      const existing = lines.find((ln) => Math.abs(ln.y - w.y) <= yTolerance);
      if (!existing) {
        lines.push({
          y: w.y,
          items: [w],
        });
      } else {
        existing.items.push(w);
      }
    }

    const finalLines = lines
      .map((ln) => {
        ln.items.sort((a, b) => a.x - b.x);

        // Join with spaces when needed
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

          // if there's a gap, insert a space
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
          fontSize: fs || 10,
        };
      })
      .filter(Boolean);

    pages.push({
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      lines: finalLines,
    });

    // page-marked resumeText
    resumeText += `\n\n[PAGE ${pageNumber}]\n` + finalLines.map((l) => l.text).join("\n");
  }

  return { pages, resumeText: resumeText.trim() };
}

/**
 * Overlay replacements on top of existing PDF (layout-preserving-ish).
 * Returns { pdfBytes, overlaysApplied, misses }
 */
async function applyPdfReplacements(originalPdfBuffer, pages, replacements = []) {
  const pdfDoc = await PDFDocument.load(originalPdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const overlaysApplied = [];
  const misses = [];

  const allLines = [];
  for (let i = 0; i < (pages || []).length; i++) {
    const p = pages[i];
    for (const ln of p.lines || []) {
      allLines.push({ pageIndex: i, ...ln });
    }
  }

  const used = new Set();

  for (const rep of replacements || []) {
    const from = norm(rep?.from);
    const to = String(rep?.to || "").trim();

    if (!from || !to) continue;

    // Find first unused exact line match
    const hit = allLines.find((ln, idx) => ln.norm === from && !used.has(idx));
    if (!hit) {
      misses.push({ from, reason: "not_found" });
      continue;
    }

    // mark used
    const idx = allLines.indexOf(hit);
    used.add(idx);

    const page = pdfDoc.getPage(hit.pageIndex);

    // white-out area (small padding)
    const padX = 1;
    const padY = 1;

    const rectX = hit.x - padX;
    const rectY = hit.y - padY;
    const rectW = hit.width + padX * 2;
    const rectH = hit.height + padY * 2;

    page.drawRectangle({
      x: rectX,
      y: rectY,
      width: rectW,
      height: rectH,
      color: rgb(1, 1, 1),
      opacity: 1,
    });

    // fit text roughly into original width
    let size = Math.max(7, hit.fontSize || 10);
    const maxW = Math.max(50, hit.width || 300);

    const wAt = (s, sz) => font.widthOfTextAtSize(String(s || ""), sz);
    const measured = wAt(to, size);

    if (measured > maxW) {
      const scale = maxW / measured;
      size = Math.max(7, size * scale * 0.98);
    }

    page.drawText(to, {
      x: hit.x,
      y: hit.y,
      size,
      font,
      color: rgb(0, 0, 0),
    });

    overlaysApplied.push({
      page: hit.pageIndex + 1,
      from,
      to,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return { pdfBytes, overlaysApplied, misses };
}

module.exports = {
  getPdfJs,
  extractPdfLinesWithBoxes,
  applyPdfReplacements,
  chunkText,
};
