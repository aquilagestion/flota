/**
 * Lógica compartida REGISTRO Km PDF (sin importar pdf-lib).
 * Web: UMD /vendor/pdf-lib. Nativo: import ESM de pdf-lib.
 */
import {
  EXPENSE_SHEET_TEMPLATE,
  LIFE_PROJECT_META,
  isLifeExpenseSheetTemplate,
} from "./expenseSheetTemplates";
import {
  formatKmCell_,
  registroKmProjectTitle_,
  resolveRegistroKmTemplateId_,
} from "./registroKmLifeTemplate";

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 28;
const FONT_SIZE = 8;
const TITLE_SIZE = 10;
const ROW_H = 16;
const HEADER_ROW_H = 28;

/** Inyectado por buildRegistroKmLifePdfBytesWithLib_ */
let rgb = null;
let LINE = null;
let HEADER_BG = null;

function dataUriToBytes_(dataUri) {
  const raw = String(dataUri || "").trim();
  const m = raw.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
  if (!m) return null;
  const b64 = m[2];
  const bin =
    typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return { mime: String(m[1] || "image/png").toLowerCase(), bytes };
}

async function embedLogo_(pdfDoc, dataUri) {
  const parsed = dataUriToBytes_(dataUri);
  if (!parsed?.bytes?.length) return null;
  try {
    if (parsed.mime.includes("jpeg") || parsed.mime.includes("jpg")) {
      return await pdfDoc.embedJpg(parsed.bytes);
    }
    return await pdfDoc.embedPng(parsed.bytes);
  } catch {
    try {
      return await pdfDoc.embedJpg(parsed.bytes);
    } catch {
      return null;
    }
  }
}

function drawFittedImage_(page, image, box) {
  if (!image || !box) return;
  const maxW = box.w;
  const maxH = box.h;
  const scale = Math.min(maxW / image.width, maxH / image.height, 1);
  const w = image.width * scale;
  const h = image.height * scale;
  const x = box.x + (maxW - w) / 2;
  const y = box.y + (maxH - h) / 2;
  page.drawImage(image, { x, y, width: w, height: h });
}

function sanitizePdfText_(s) {
  return String(s ?? "")
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrapText_(font, text, fontSize, maxWidth) {
  const raw = sanitizePdfText_(text).trim();
  if (!raw) return [""];
  const words = raw.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(trial, fontSize) <= maxWidth) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      if (font.widthOfTextAtSize(w, fontSize) <= maxWidth) {
        cur = w;
      } else {
        let chunk = "";
        for (const ch of w) {
          const t2 = chunk + ch;
          if (font.widthOfTextAtSize(t2, fontSize) <= maxWidth) chunk = t2;
          else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        cur = chunk;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function colWidths_(tableW) {
  const ratios = [0.11, 0.28, 0.18, 0.1, 0.1, 0.09, 0.14];
  return ratios.map((r) => tableW * r);
}

function drawCellText_(page, font, text, x, yTop, w, h, { size = FONT_SIZE, align = "left", boldFont = null } = {}) {
  const f = boldFont || font;
  const pad = 3;
  const lines = wrapText_(f, text, size, Math.max(4, w - pad * 2));
  const lineH = size + 2;
  const maxLines = Math.max(1, Math.floor((h - 4) / lineH));
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines && shown.length) {
    const last = shown[shown.length - 1];
    shown[shown.length - 1] = last.length > 2 ? `${last.slice(0, -2)}…` : "…";
  }
  let ty = yTop - pad - size;
  for (const line of shown) {
    let tx = x + pad;
    if (align === "center") {
      const tw = f.widthOfTextAtSize(line, size);
      tx = x + (w - tw) / 2;
    } else if (align === "right") {
      const tw = f.widthOfTextAtSize(line, size);
      tx = x + w - pad - tw;
    }
    page.drawText(line, {
      x: Math.max(x + 1, tx),
      y: ty,
      size,
      font: f,
      color: rgb(0.1, 0.1, 0.1),
    });
    ty -= lineH;
  }
}

function drawTableHeader_(page, fontBold, cols, x0, yTop) {
  let x = x0;
  const labels = [
    "Fecha",
    "Desplazamiento realizado",
    "Técnico",
    "Km iniciales vehículo",
    "Km finales vehículo",
    "Km recorridos",
    "Acción",
  ];
  for (let i = 0; i < cols.length; i += 1) {
    const w = cols[i];
    page.drawRectangle({
      x,
      y: yTop - HEADER_ROW_H,
      width: w,
      height: HEADER_ROW_H,
      borderColor: LINE,
      borderWidth: 0.7,
      color: HEADER_BG,
    });
    drawCellText_(page, fontBold, labels[i], x, yTop, w, HEADER_ROW_H, {
      size: 7.5,
      align: "center",
      boldFont: fontBold,
    });
    x += w;
  }
}

function rowHeightFor_(font, cells, cols) {
  let maxLines = 1;
  for (let i = 0; i < cells.length; i += 1) {
    const lines = wrapText_(font, cells[i], FONT_SIZE, Math.max(4, cols[i] - 6));
    maxLines = Math.max(maxLines, Math.min(lines.length, 3));
  }
  return Math.max(ROW_H, maxLines * (FONT_SIZE + 2) + 6);
}

function drawDataRow_(page, font, fontBold, cells, cols, x0, yTop, rowH, aligns) {
  let x = x0;
  for (let i = 0; i < cols.length; i += 1) {
    const w = cols[i];
    page.drawRectangle({
      x,
      y: yTop - rowH,
      width: w,
      height: rowH,
      borderColor: LINE,
      borderWidth: 0.6,
    });
    drawCellText_(page, font, cells[i], x, yTop, w, rowH, {
      size: FONT_SIZE,
      align: aligns[i] || "left",
      boldFont: i === 5 ? fontBold : null,
    });
    x += w;
  }
}

async function drawGroupPages_(pdfDoc, group, logos, fonts, periodLabel) {
  const { font, fontBold } = fonts;
  const templateId =
    group.templateId ||
    resolveRegistroKmTemplateId_(group.proyecto_nombre) ||
    EXPENSE_SHEET_TEMPLATE.GREFA_RELACION;
  const isLife = isLifeExpenseSheetTemplate(templateId);
  const titleProject = registroKmProjectTitle_(templateId, group.proyecto_nombre);
  const lifeMeta = LIFE_PROJECT_META[templateId] || null;

  const logoLife = isLife ? await embedLogo_(pdfDoc, logos?.lifeProject) : null;
  const logoGrefa = await embedLogo_(pdfDoc, logos?.grefa);
  const logoEu = isLife ? await embedLogo_(pdfDoc, logos?.lifeNatura) : null;

  const viajes = Array.isArray(group.viajes) ? group.viajes : [];
  const totalKm = viajes.reduce((acc, v) => acc + (Number(v?.km_recorridos) || 0), 0);
  const tableW = A4_W - MARGIN * 2;
  const cols = colWidths_(tableW);
  const aligns = ["center", "left", "left", "center", "center", "center", "left"];

  const headerTitle = `REGISTRO Km ${titleProject}.  VEHÍCULO     MARCA:   ${
    String(group.marca || "").trim() || "________"
  }         MODELO: ${String(group.modelo || "").trim() || "________"}              MATRÍCULA:${String(
    group.matricula || ""
  ).trim()}`;

  let rowIndex = 0;
  let pageIndex = 0;
  const minBlank = 12;

  while (rowIndex < viajes.length || pageIndex === 0) {
    const page = pdfDoc.addPage([A4_W, A4_H]);
    pageIndex += 1;
    let y = A4_H - MARGIN;

    const logoH = 42;
    if (isLife) {
      const third = tableW / 3;
      drawFittedImage_(page, logoLife, { x: MARGIN, y: y - logoH, w: third - 8, h: logoH });
      drawFittedImage_(page, logoGrefa, {
        x: MARGIN + third,
        y: y - logoH,
        w: third - 8,
        h: logoH,
      });
      drawFittedImage_(page, logoEu, {
        x: MARGIN + third * 2,
        y: y - logoH,
        w: third - 8,
        h: logoH,
      });
    } else if (logoGrefa) {
      drawFittedImage_(page, logoGrefa, {
        x: A4_W - MARGIN - 140,
        y: y - logoH,
        w: 140,
        h: logoH,
      });
    }
    y -= logoH + 8;

    if (lifeMeta?.projectLine) {
      page.drawText(sanitizePdfText_(lifeMeta.projectLine), {
        x: MARGIN,
        y: y - 8,
        size: 7,
        font,
        color: rgb(0.3, 0.3, 0.3),
      });
      y -= 12;
    }
    if (periodLabel) {
      page.drawText(sanitizePdfText_(`Periodo: ${periodLabel}`), {
        x: MARGIN,
        y: y - 8,
        size: 8,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= 12;
    }

    const titleLines = wrapText_(fontBold, headerTitle, TITLE_SIZE, tableW);
    for (const line of titleLines) {
      const tw = fontBold.widthOfTextAtSize(line, TITLE_SIZE);
      page.drawText(line, {
        x: MARGIN + Math.max(0, (tableW - tw) / 2),
        y: y - TITLE_SIZE,
        size: TITLE_SIZE,
        font: fontBold,
        color: rgb(0.05, 0.05, 0.05),
      });
      y -= TITLE_SIZE + 3;
    }
    y -= 6;

    drawTableHeader_(page, fontBold, cols, MARGIN, y);
    y -= HEADER_ROW_H;

    const footerReserve = 28;
    let drawnThisPage = 0;

    while (rowIndex < viajes.length && y - ROW_H > MARGIN + footerReserve) {
      const v = viajes[rowIndex];
      const cells = [
        String(v.fecha_viaje || ""),
        String(v.desplazamiento || `${v.origen || ""} → ${v.destino || ""}`),
        String(v.usuario_nombre || v.usuario_email || ""),
        formatKmCell_(v.km_inicial),
        formatKmCell_(v.km_final),
        formatKmCell_(v.km_recorridos),
        String(v.accion || ""),
      ];
      const rowH = rowHeightFor_(font, cells, cols);
      if (y - rowH < MARGIN + footerReserve && drawnThisPage > 0) break;
      drawDataRow_(page, font, fontBold, cells, cols, MARGIN, y, rowH, aligns);
      y -= rowH;
      rowIndex += 1;
      drawnThisPage += 1;
    }

    const remaining = viajes.length - rowIndex;
    if (remaining <= 0) {
      while (drawnThisPage < minBlank && y - ROW_H > MARGIN + footerReserve) {
        drawDataRow_(
          page,
          font,
          fontBold,
          ["", "", "", "", "", "", ""],
          cols,
          MARGIN,
          y,
          ROW_H,
          aligns
        );
        y -= ROW_H;
        drawnThisPage += 1;
      }
      if (y - ROW_H > MARGIN) {
        const totalCells = ["", "", "", "", "Total km", formatKmCell_(totalKm), ""];
        let x = MARGIN;
        for (let i = 0; i < cols.length; i += 1) {
          const w = cols[i];
          page.drawRectangle({
            x,
            y: y - ROW_H,
            width: w,
            height: ROW_H,
            borderColor: LINE,
            borderWidth: 0.7,
          });
          if (i === 4 || i === 5) {
            drawCellText_(page, fontBold, totalCells[i], x, y, w, ROW_H, {
              size: FONT_SIZE,
              align: i === 5 ? "center" : "right",
              boldFont: fontBold,
            });
          }
          x += w;
        }
      }
      break;
    }
  }
}

/**
 * @param {{ PDFDocument: any, StandardFonts: any, rgb: Function }} pdfLib
 * @returns {Promise<Uint8Array>}
 */
export async function buildRegistroKmLifePdfBytesWithLib_(pdfLib, {
  groups,
  logosByTemplate,
  logosFallback,
  periodLabel,
} = {}) {
  const list = Array.isArray(groups) ? groups : [];
  if (!list.length) throw new Error("No hay grupos para el PDF");
  if (!pdfLib?.PDFDocument || !pdfLib?.StandardFonts || typeof pdfLib.rgb !== "function") {
    throw new Error("pdf-lib no disponible");
  }
  rgb = pdfLib.rgb;
  LINE = rgb(0.2, 0.2, 0.2);
  HEADER_BG = rgb(0.92, 0.92, 0.92);

  const pdfDoc = await pdfLib.PDFDocument.create();
  const font = await pdfDoc.embedFont(pdfLib.StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(pdfLib.StandardFonts.HelveticaBold);
  const fonts = { font, fontBold };

  for (const g of list) {
    const templateId =
      g.templateId ||
      resolveRegistroKmTemplateId_(g.proyecto_nombre) ||
      EXPENSE_SHEET_TEMPLATE.GREFA_RELACION;
    const logos = (logosByTemplate && logosByTemplate[templateId]) || logosFallback || {};
    await drawGroupPages_(pdfDoc, { ...g, templateId }, logos, fonts, periodLabel);
  }

  return pdfDoc.save();
}
