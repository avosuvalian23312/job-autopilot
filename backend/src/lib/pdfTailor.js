// backend/src/lib/pdfTailor.js
"use strict";

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

let _pdfjs = null;
let _pdfjsPromise = null;

/**
 * pdfjs-dist v5 is ESM (pdf.mjs).
 * This loader supports both older CJS builds and v5+ ESM builds.
 */
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
    // 1) Older CommonJS builds
    let mod =
      tryRequire("pdfjs-dist/legacy/build/pdf.js") ||
      tryRequire("pdfjs-dist/build/pdf.js");

    // 2) pdfjs-dist v5+ (ESM .mjs)
    if (!mod) {
      mod =
        (await tryImport("pdfjs-dist/legacy/build/pdf.mjs")) ||
        (await tryImport("pdfjs-dist/build/pdf.mjs"));
    }

    if (!mod) {
      throw new Error(
        "pdfjs-dist is missing/incompatible. Tried: legacy/build/pdf.js, build/pdf.js, legacy/build/pdf.mjs, build/pdf.mjs"
      );
    }

    // Handle default export, and some bundling variants
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
 * Extract positioned lines using pdfjs text items.
 * Returns a "layout" object compatible with your applyPrepare.js:
 * {
 *   pages: [
 *     { pageIndex, pageNumber, width, height, lines:[{text, x,y,width,height,fontSize}] }
 *   ]
 * }
 */
async function extractPdfLayout(pdfBuffer, opts = {}) {
  const pdfjs = await getPdfJs();

  const maxPages = Number(opts.maxPages || 12);
  const yTolerance = Number(opts.yTolerance || 2.5);

  const loadingTask = pdfjs.getDocument({
    data: pdfBuffer,
    disableWorker: true, // important in Azure Functions
  });

  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, maxPages);

  const pages = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();

    const items = Array.isArray(textContent.items) ? textContent.items : [];
    const Util = pdfjs.Util;

    // Collect "words" with positions
    const words = [];
    for (const it of items) {
      const str = String(it?.str || "");
      if (!str.trim()) continue;

      // transform into viewport space
      const tx = Util.transform(viewport.transform, it.transform);

      const x = tx[4];
      const yTopOrigin = tx[5];

      // convert to PDF-like bottom-left origin
      const y = viewport.height - yTopOrigin;

      const fontSize = Math.max(6, Math.hypot(tx[2], tx[3]) || 10);
      const w = Number(it.width || 0);
      const h = Number(it.height || fontSize);

      words.push({ text: str, x, y, w, h, fontSize });
    }

    // Sort top-to-bottom, then left-to-right
    words.sort((a, b) => {
      if (b.y !== a.y) return b.y - a.y;
      return a.x - b.x;
    });

    // Group into lines by y
    const rawLines = [];
    for (const w of words) {
      const existing = rawLines.find((ln) => Math.abs(ln.y - w.y) <= yTolerance);
      if (!existing) rawLines.push({ y: w.y, items: [w] });
      else existing.items.push(w);
    }

    const lines = rawLines
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
          x: Number.isFinite(minX) ? minX : 0,
          y: ln.y,
          width: Number.isFinite(maxX - minX) ? maxX - minX : 500,
          height: maxH || fs * 1.2,
          fontSize: fs || 10,
        };
      })
      .filter(Boolean);

    pages.push({
      pageIndex: pageNumber - 1,
      pageNumber,
      width: viewport.width,
      height: viewport.height,
      lines,
    });
  }

  return { pages };
}

/**
 * Extract bullet blocks from a layout.
 * Each bullet block includes line slots so applyBulletEdits can rewrite within same boxes.
 *
 * Output shape (used by your applyPrepare):
 * [{ id, pageIndex, rawText, lineCount, lines:[{x,y,width,height,fontSize}], prefix }]
 */
function extractBulletBlocks(layout, opts = {}) {
  const maxBullets = Number(opts.maxBullets || 60);

  const bulletRe = /^([•∙●▪■\-–—])\s+(.*)$/;

  const blocks = [];
  let bIndex = 0;

  for (const pg of layout?.pages || []) {
    const pageIndex = pg.pageIndex;
    const lines = Array.isArray(pg.lines) ? pg.lines.slice() : [];

    // sort top -> bottom (higher y first)
    lines.sort((a, b) => (b.y !== a.y ? b.y - a.y : a.x - b.x));

    let current = null;

    for (const ln of lines) {
      const t = String(ln.text || "").trim();
      if (!t) continue;

      const m = bulletRe.exec(t);

      if (m) {
        // new bullet starts
        if (current) {
          blocks.push(current);
          if (blocks.length >= maxBullets) return blocks;
        }

        const prefix = `${m[1]} `;
        const body = String(m[2] || "").trim();

        current = {
          id: `b${bIndex++}`,
          pageIndex,
          prefix,
          rawText: body,
          lineCount: 1,
          lines: [
            {
              x: ln.x,
              y: ln.y,
              width: ln.width,
              height: ln.height,
              fontSize: ln.fontSize,
            },
          ],
        };
        continue;
      }

      // Continuation line heuristics:
      // - must have an active bullet
      // - typically indented compared to bullet line
      // - and close-ish vertically (pdfjs already grouped by y)
      if (current) {
        const firstX = current.lines[0]?.x ?? 0;
        const isIndented = ln.x > firstX + 6;

        if (isIndented) {
          current.rawText = norm(`${current.rawText} ${t}`);
          current.lineCount += 1;
          current.lines.push({
            x: ln.x,
            y: ln.y,
            width: ln.width,
            height: ln.height,
            fontSize: ln.fontSize,
          });
          continue;
        }

        // if not indented, end current bullet
        blocks.push(current);
        if (blocks.length >= maxBullets) return blocks;
        current = null;
      }
    }

    if (current) {
      blocks.push(current);
      if (blocks.length >= maxBullets) return blocks;
    }
  }

  return blocks.slice(0, maxBullets);
}

/**
 * Apply bullet edits by overwriting the bullet lines' rectangles and writing new text
 * wrapped across the same number of lines.
 *
 * edits shape: [{ bulletId, text }]
 * returns: Buffer (PDF bytes)
 */
async function applyBulletEdits(originalPdfBuffer, bulletBlocks, edits, opts = {}) {
  const defaultFontSize = Number(opts.defaultFontSize || 10);
  const lineGap = Number(opts.lineGap || 1.15);

  const pdfDoc = await PDFDocument.load(originalPdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const blockById = new Map((bulletBlocks || []).map((b) => [String(b.id), b]));

  const measure = (s, size) => font.widthOfTextAtSize(String(s || ""), size);

  const wrapToSlots = (fullText, slots, fontSize) => {
    const words = String(fullText || "").split(/\s+/).filter(Boolean);
    const linesOut = [];
    let wi = 0;

    for (let si = 0; si < slots.length; si++) {
      const maxW = Math.max(40, Number(slots[si]?.width || 240));
      let line = "";

      while (wi < words.length) {
        const next = line ? `${line} ${words[wi]}` : words[wi];
        if (measure(next, fontSize) <= maxW) {
          line = next;
          wi += 1;
          continue;
        }
        break;
      }

      linesOut.push(line);
      if (wi >= words.length) break;
    }

    // If overflow, add ellipsis on last line
    if (wi < words.length && linesOut.length) {
      const lastIdx = linesOut.length - 1;
      let base = linesOut[lastIdx] || "";
      const maxW = Math.max(40, Number(slots[lastIdx]?.width || 240));

      // try to fit "…" at end
      const ell = "…";
      while (base && measure(`${base}${ell}`, fontSize) > maxW) {
        base = base.split(" ").slice(0, -1).join(" ");
      }
      linesOut[lastIdx] = base ? `${base}${ell}` : ell;
    }

    return linesOut;
  };

  for (const e of edits || []) {
    const bulletId = String(e?.bulletId || "").trim();
    const newText = String(e?.text || "").trim();
    if (!bulletId || !newText) continue;

    const block = blockById.get(bulletId);
    if (!block) continue;

    const page = pdfDoc.getPage(block.pageIndex);
    const slots = Array.isArray(block.lines) ? block.lines : [];
    if (!slots.length) continue;

    // Choose a font size close to original
    const avgFs =
      slots.reduce((acc, s) => acc + (Number(s.fontSize) || defaultFontSize), 0) /
      slots.length;
    let fontSize = Math.max(7, Math.min(12, avgFs || defaultFontSize));

    // White-out each slot rectangle
    for (const s of slots) {
      const padX = 1;
      const padY = 1;
      const x = Number(s.x || 0) - padX;
      const y = Number(s.y || 0) - padY;
      const w = Number(s.width || 240) + padX * 2;
      const h = Number(s.height || fontSize * 1.2) + padY * 2;

      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        color: rgb(1, 1, 1),
        opacity: 1,
      });
    }

    const full = `${String(block.prefix || "• ")}${newText}`;

    // Wrap to available slots
    let wrapped = wrapToSlots(full, slots, fontSize);

    // If first line is too wide even alone, scale font down a bit
    if (wrapped[0] && measure(wrapped[0], fontSize) > Math.max(40, slots[0].width || 240)) {
      const maxW = Math.max(40, slots[0].width || 240);
      const measured = measure(wrapped[0], fontSize);
      const scale = maxW / measured;
      fontSize = Math.max(7, fontSize * scale * 0.98);
      wrapped = wrapToSlots(full, slots, fontSize);
    }

    // Draw wrapped lines into their original slots
    for (let i = 0; i < wrapped.length; i++) {
      const lineText = wrapped[i];
      if (!lineText) continue;

      const s = slots[i];
      page.drawText(lineText, {
        x: Number(s.x || 0),
        y: Number(s.y || 0),
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        lineHeight: fontSize * lineGap,
      });
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

module.exports = {
  // pdfjs
  getPdfJs,

  // Layout (your applyPrepare imports THIS name)
  extractPdfLayout,

  // Bullet tooling (your applyPrepare imports THESE names)
  extractBulletBlocks,
  applyBulletEdits,

  // Utilities
  chunkText,
};
