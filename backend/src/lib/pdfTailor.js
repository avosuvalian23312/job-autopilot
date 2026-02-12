// src/lib/pdfTailor.js
"use strict";

/**
 * Option B Tailoring:
 * - Keep the original PDF page layout
 * - Identify bullet blocks (• / - / – etc) using pdfjs text extraction
 * - Overlay (white-out + draw) new bullet text in the same bounding box using pdf-lib
 *
 * NOTE:
 * - This works best for text-based PDFs with white background.
 * - Scanned image PDFs won't yield usable text layout via pdfjs.
 */

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

let _pdfjs = null;

function getPdfJs() {
  if (_pdfjs) return _pdfjs;

  // ✅ CommonJS-friendly path (works with pdfjs-dist 2.x/3.x)
  try {
    // eslint-disable-next-line global-require
    _pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
    return _pdfjs;
  } catch (e1) {
    // Fallback (some installs)
    try {
      // eslint-disable-next-line global-require
      _pdfjs = require("pdfjs-dist/build/pdf.js");
      return _pdfjs;
    } catch (e2) {
      const msg =
        "pdfjs-dist is missing or incompatible. Install it in backend/package.json dependencies. " +
        "Tried: pdfjs-dist/legacy/build/pdf.js and pdfjs-dist/build/pdf.js";
      const err = new Error(msg);
      err.cause = { e1: e1?.message, e2: e2?.message };
      throw err;
    }
  }
}

// ---------------------------
// Layout extraction (pdfjs)
// ---------------------------

const BULLET_STARTERS = ["•", "‣", "◦", "·", "●", "-", "–", "—", "*"];

function _normSpace(s) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function _isBulletLine(lineText) {
  const t = _normSpace(lineText);
  if (!t) return false;
  const first = t[0];
  if (BULLET_STARTERS.includes(first)) return true;
  // common pattern: "•Something" without space
  for (const b of BULLET_STARTERS) {
    if (t.startsWith(b)) return true;
    if (t.startsWith(`${b} `)) return true;
  }
  return false;
}

function _safeNumber(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Extract lines with bounding boxes from PDF bytes.
 * Returns:
 * {
 *   pageCount,
 *   pages: [
 *     { pageIndex, width, height, lines: [{ text, x0,y0,x1,y1, items:[...] }] }
 *   ]
 * }
 */
async function extractPdfLayout(pdfBytes, { maxPages = 10 } = {}) {
  const pdfjs = getPdfJs();

  // pdfjs expects Uint8Array
  const data = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);

  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true, // ✅ safest for Azure Functions
  });

  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages || 0, maxPages);

  const pages = [];

  for (let p = 1; p <= pageCount; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.0 });
    const tc = await page.getTextContent({ includeMarkedContent: false });

    // Convert items into positioned tokens
    const tokens = (tc.items || [])
      .map((it) => {
        const str = _normSpace(it.str);
        if (!str) return null;

        // transform = [a,b,c,d,e,f]
        const tr = it.transform || [1, 0, 0, 1, 0, 0];
        const x = _safeNumber(tr[4], 0);
        const y = _safeNumber(tr[5], 0);

        // Width/height may exist; otherwise approximate from transform
        const w = _safeNumber(it.width, Math.abs(tr[0]) * str.length * 2);
        const h = _safeNumber(it.height, Math.abs(tr[3]) || 10);

        return {
          str,
          x,
          y,
          w,
          h,
        };
      })
      .filter(Boolean);

    // Group into lines by Y with tolerance
    tokens.sort((a, b) => b.y - a.y || a.x - b.x);

    const yTol = 2.0;
    const linesRaw = [];
    for (const t of tokens) {
      let line = null;
      for (const candidate of linesRaw) {
        if (Math.abs(candidate._y - t.y) <= yTol) {
          line = candidate;
          break;
        }
      }
      if (!line) {
        line = { _y: t.y, tokens: [] };
        linesRaw.push(line);
      }
      line.tokens.push(t);
    }

    // Sort tokens in each line by x and build text + bbox
    const lines = linesRaw
      .map((lr) => {
        lr.tokens.sort((a, b) => a.x - b.x);

        // Build text with gap-sensitive spacing
        let text = "";
        let prev = null;
        for (const tok of lr.tokens) {
          if (!prev) {
            text = tok.str;
          } else {
            const gap = tok.x - (prev.x + prev.w);
            text += gap > 4 ? " " + tok.str : tok.str.startsWith(" ") ? tok.str : " " + tok.str;
          }
          prev = tok;
        }
        text = _normSpace(text);

        const x0 = Math.min(...lr.tokens.map((t) => t.x));
        const y0 = Math.min(...lr.tokens.map((t) => t.y));
        const x1 = Math.max(...lr.tokens.map((t) => t.x + t.w));
        const y1 = Math.max(...lr.tokens.map((t) => t.y + t.h));

        return {
          text,
          x0,
          y0,
          x1,
          y1,
          tokens: lr.tokens,
        };
      })
      .filter((l) => l.text);

    pages.push({
      pageIndex: p - 1,
      width: viewport.width,
      height: viewport.height,
      lines,
    });
  }

  return { pageCount: pdf.numPages || 0, pages };
}

/**
 * Finds bullet blocks: a bullet-starting line + its wrapped continuation lines.
 * Returns bullets:
 * [{ id, pageIndex, x0,y0,x1,y1, lineCount, lines:[...], rawText }]
 */
function extractBulletBlocks(layout, { maxBullets = 40 } = {}) {
  const bullets = [];
  let bulletId = 0;

  for (const pg of layout.pages || []) {
    const lines = [...(pg.lines || [])].sort((a, b) => b.y0 - a.y0);

    // detect bullet blocks by indentation pattern
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (!_isBulletLine(L.text)) continue;

      const startX = L.x0;
      const blockLines = [L];

      // collect following lines that look like continuation (indented)
      const maxFollow = 6; // limit per bullet
      for (let k = 1; k <= maxFollow; k++) {
        const next = lines[i + k];
        if (!next) break;

        // if next is a new bullet, stop
        if (_isBulletLine(next.text)) break;

        // continuation: close vertically + more indented than the bullet starter
        const dy = Math.abs(next.y0 - (blockLines[blockLines.length - 1].y0));
        const isClose = dy <= 18; // typical line spacing
        const isIndented = next.x0 >= startX + 8;

        if (isClose && isIndented) {
          blockLines.push(next);
        } else {
          break;
        }
      }

      const x0 = Math.min(...blockLines.map((l) => l.x0));
      const y0 = Math.min(...blockLines.map((l) => l.y0));
      const x1 = Math.max(...blockLines.map((l) => l.x1));
      const y1 = Math.max(...blockLines.map((l) => l.y1));

      const rawText = blockLines.map((l) => l.text).join(" ");

      bullets.push({
        id: `b${bulletId++}`,
        pageIndex: pg.pageIndex,
        x0,
        y0,
        x1,
        y1,
        lineCount: blockLines.length,
        lines: blockLines,
        rawText: _normSpace(rawText),
      });

      if (bullets.length >= maxBullets) return bullets;
    }
  }

  return bullets;
}

// ---------------------------
// Overlay editing (pdf-lib)
// ---------------------------

function wrapTextToWidth(font, text, fontSize, maxWidth) {
  const words = _normSpace(text).split(" ").filter(Boolean);
  const lines = [];
  let cur = "";

  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    const width = font.widthOfTextAtSize(next, fontSize);
    if (width <= maxWidth) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fitWrappedLines(font, text, maxWidth, targetLineCount, baseFontSize) {
  let fontSize = baseFontSize;
  let lines = wrapTextToWidth(font, text, fontSize, maxWidth);

  while (lines.length > targetLineCount && fontSize > 7) {
    fontSize -= 0.5;
    lines = wrapTextToWidth(font, text, fontSize, maxWidth);
  }

  // still too many lines → truncate last line
  if (lines.length > targetLineCount) {
    lines = lines.slice(0, targetLineCount);
    let last = lines[lines.length - 1] || "";
    while (font.widthOfTextAtSize(`${last}…`, fontSize) > maxWidth && last.length > 0) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = last ? `${last}…` : "…";
  }

  // too few lines → fine (keeps structure visually)
  return { fontSize, lines };
}

/**
 * Apply bullet edits by overlaying new text in the bullet block bbox.
 *
 * edits: [{ bulletId, text }]
 * bulletBlocks: from extractBulletBlocks()
 */
async function applyBulletEdits(pdfBytes, bulletBlocks, edits, opts = {}) {
  const {
    padding = 1.5,
    fillColor = rgb(1, 1, 1), // white out
    textColor = rgb(0, 0, 0),
    fontName = StandardFonts.Helvetica,
    defaultFontSize = 10,
    lineGap = 1.15, // multiplier
  } = opts;

  const editMap = new Map((edits || []).map((e) => [String(e.bulletId), String(e.text || "")]));
  if (editMap.size === 0) return pdfBytes;

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(fontName);

  for (const b of bulletBlocks || []) {
    const newText = editMap.get(String(b.id));
    if (!newText || !_normSpace(newText)) continue;

    const page = pdfDoc.getPage(b.pageIndex);
    if (!page) continue;

    // BBox in PDF user space (pdfjs scale=1 matches)
    const x = b.x0 - padding;
    const y = b.y0 - padding;
    const w = (b.x1 - b.x0) + padding * 2;
    const h = (b.y1 - b.y0) + padding * 2;

    // 1) white-out old text
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: fillColor,
      borderColor: fillColor,
    });

    // 2) re-draw bullet text (wrap to same width)
    const maxTextWidth = Math.max(20, w - 4); // avoid negative
    const baseFontSize = defaultFontSize;

    // preserve bullet symbol at start if user didn’t include
    const cleaned = _normSpace(newText);
    const finalText = _isBulletLine(cleaned) ? cleaned : `• ${cleaned}`;

    const { fontSize, lines } = fitWrappedLines(font, finalText, maxTextWidth, b.lineCount, baseFontSize);

    // Place text starting near top of bbox
    const startX = b.x0;
    const startY = b.y1 - (fontSize * 0.9); // baseline-ish

    const stepY = fontSize * lineGap;

    for (let i = 0; i < lines.length; i++) {
      const yy = startY - i * stepY;
      if (yy < y) break;

      page.drawText(lines[i], {
        x: startX,
        y: yy,
        size: fontSize,
        font,
        color: textColor,
      });
    }
  }

  const out = await pdfDoc.save();
  return out;
}

module.exports = {
  // existing export
  getPdfJs,

  // new exports for Option B
  extractPdfLayout,
  extractBulletBlocks,
  applyBulletEdits,
  wrapTextToWidth,
};
