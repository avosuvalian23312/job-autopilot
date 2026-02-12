"use strict";

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// pdfjs-dist for extracting text positions
let pdfjsLib;
try {
  pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
} catch {
  pdfjsLib = require("pdfjs-dist/build/pdf.js");
}

function norm(s) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/[•·●]/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function chunkText(s, maxLen) {
  const t = String(s || "");
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen) + "\n...[TRUNCATED]";
}

/**
 * Extract resume lines with bounding boxes per page.
 * This is what lets us "erase" an old bullet line and draw a new one in the same spot.
 */
async function extractPdfLinesWithBoxes(pdfBytes, { maxPages = 15, yTolerance = 2.5 } = {}) {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes, disableWorker: true });
  const pdf = await loadingTask.promise;

  const pages = [];
  const pageCount = Math.min(pdf.numPages, maxPages);

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;
    const pageWidth = viewport.width;

    const textContent = await page.getTextContent();
    const items = (textContent?.items || []).filter((it) => it && it.str);

    // Build line groups by y coordinate (viewport coords: origin top-left)
    const groups = new Map();

    for (const it of items) {
      // Transform item -> viewport coordinate system
      const tx = pdfjsLib.Util.transform(viewport.transform, it.transform);
      const x = tx[4];
      const y = tx[5]; // y down
      const w = Math.max(0, Number(it.width || 0));
      const h = Math.max(0, Number(it.height || 10));

      const key = Math.round(y / yTolerance) * yTolerance;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ str: String(it.str), x, y, w, h });
    }

    // Convert groups -> lines sorted by y then x
    const lineKeys = Array.from(groups.keys()).sort((a, b) => a - b);
    const lines = [];

    for (const ky of lineKeys) {
      const parts = groups.get(ky).sort((a, b) => a.x - b.x);

      // Join parts with spacing heuristic
      let text = "";
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const prev = parts[i - 1];

        if (prev) {
          const gap = p.x - (prev.x + prev.w);
          if (gap > 2) text += " ";
        }
        text += p.str;

        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x + p.w);
        // y is "down"; estimate box using height
        minY = Math.min(minY, p.y - p.h);
        maxY = Math.max(maxY, p.y);
      }

      const clean = String(text).replace(/\s+/g, " ").trim();
      if (!clean) continue;

      lines.push({
        text: clean,
        ntext: norm(clean),
        // Box in viewport coords (top-left origin)
        box: {
          x: minX,
          yTop: minY,
          yBottom: maxY,
          width: Math.max(0, maxX - minX),
          height: Math.max(6, maxY - minY),
        },
      });
    }

    pages.push({
      pageNumber: pageNum,
      width: pageWidth,
      height: pageHeight,
      lines,
    });
  }

  // A readable "resume text" for the LLM (page-marked)
  const resumeText = pages
    .map((p) => {
      const pageLines = p.lines.map((l) => l.text).join("\n");
      return `--- PAGE ${p.pageNumber} ---\n${pageLines}`;
    })
    .join("\n\n");

  return { pages, resumeText };
}

/**
 * Find best matching line for a given "from" snippet.
 * We require a strong match to avoid editing wrong places.
 */
function findLineMatch(pages, fromText) {
  const target = norm(fromText);
  if (!target) return null;

  // 1) exact match
  for (const p of pages) {
    for (const line of p.lines) {
      if (line.ntext === target) {
        return { pageNumber: p.pageNumber, line };
      }
    }
  }

  // 2) contained / best overlap
  let best = null;
  let bestScore = 0;

  for (const p of pages) {
    for (const line of p.lines) {
      const a = line.ntext;
      const b = target;
      if (!a || !b) continue;

      const contains = a.includes(b) || b.includes(a);
      if (!contains) continue;

      // score = smaller length diff is better
      const score = 1 / (1 + Math.abs(a.length - b.length));
      if (score > bestScore) {
        bestScore = score;
        best = { pageNumber: p.pageNumber, line };
      }
    }
  }

  // Strong enough?
  if (best && bestScore >= 0.08) return best;
  return null;
}

function wrapText(font, text, fontSize, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines = [];
  let cur = words[0];

  for (let i = 1; i < words.length; i++) {
    const next = words[i];
    const cand = `${cur} ${next}`;
    const w = font.widthOfTextAtSize(cand, fontSize);
    if (w <= maxWidth) {
      cur = cand;
    } else {
      lines.push(cur);
      cur = next;
    }
  }
  lines.push(cur);
  return lines;
}

/**
 * Apply replacements:
 * replacements: [{ from: "exact old line", to: "new line" }]
 */
async function applyPdfReplacements(pdfBytes, pagesWithLines, replacements) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pdfPages = pdfDoc.getPages();

  const overlaysApplied = [];
  const misses = [];

  for (const rep of replacements || []) {
    const from = String(rep?.from || "").trim();
    const to = String(rep?.to || "").trim();
    if (!from || !to) continue;

    const hit = findLineMatch(pagesWithLines, from);
    if (!hit) {
      misses.push({ from });
      continue;
    }

    const pageIndex = hit.pageNumber - 1;
    const page = pdfPages[pageIndex];
    if (!page) {
      misses.push({ from });
      continue;
    }

    const { width: pageW, height: pageH } = page.getSize();
    const box = hit.line.box;

    // Convert viewport coords (top-left origin) -> pdf-lib coords (bottom-left origin)
    const x = clamp(box.x, 0, pageW);
    const rectW = clamp(box.width + 8, 10, pageW - x);
    const rectH = clamp(box.height + 2, 8, 40);

    // yBottom in viewport is "down" from top. Convert:
    const yPdfBottom = clamp(pageH - box.yBottom - 1, 0, pageH);

    // White-out old line
    page.drawRectangle({
      x,
      y: yPdfBottom,
      width: rectW,
      height: rectH,
      color: rgb(1, 1, 1),
    });

    // Choose a font size close to original line height
    const fontSize = clamp(Math.round((box.height || 11) * 0.95), 9, 12);
    const maxWidth = rectW - 6;

    // Preserve bullet if old starts with bullet char but new doesn't
    const oldStartsBullet = /^[•·●-]\s+/.test(String(hit.line.text || ""));
    const newStartsBullet = /^[•·●-]\s+/.test(to);
    const finalText = oldStartsBullet && !newStartsBullet ? `• ${to}` : to;

    const wrapped = wrapText(font, finalText, fontSize, maxWidth).slice(0, 2); // keep it tight
    const lineHeight = fontSize + 2;

    // draw from top line down
    const yTextTop = yPdfBottom + rectH - (fontSize + 2);
    for (let i = 0; i < wrapped.length; i++) {
      page.drawText(wrapped[i], {
        x: x + 2,
        y: yTextTop - i * lineHeight,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    }

    overlaysApplied.push({
      from,
      to: finalText,
      pageNumber: hit.pageNumber,
    });
  }

  const outBytes = await pdfDoc.save();
  return { pdfBytes: outBytes, overlaysApplied, misses };
}

module.exports = {
  extractPdfLinesWithBoxes,
  applyPdfReplacements,
  chunkText,
};
