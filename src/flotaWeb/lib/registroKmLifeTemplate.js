/**
 * Plantilla «REGISTRO Km» LIFE (modelo Excel Plantilla kilometraje).
 * Logos fijos: GREFA + Natura 2000. Logo de proyecto LIFE cambia según proyecto.
 */
import {
  EXPENSE_SHEET_TEMPLATE,
  LIFE_PROJECT_META,
  isLifeExpenseSheetTemplate,
  resolveExpenseSheetTemplate,
} from "./expenseSheetTemplates";

function escapeHtml_(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attrSrc_(value) {
  return String(value ?? "")
    .replace(/"/g, "&quot;")
    .replace(/</g, "")
    .replace(/[\n\r]/g, "");
}

/** Título corto del proyecto para la cabecera del registro. */
export function registroKmProjectTitle_(templateId, proyectoNombre) {
  if (templateId === EXPENSE_SHEET_TEMPLATE.LIFE_EMG_PYGARGUS) return "LIFE SOS PYGARGUS";
  if (templateId === EXPENSE_SHEET_TEMPLATE.LIFE_EMG_ABILAS) return "LIFE ABILAS";
  if (templateId === EXPENSE_SHEET_TEMPLATE.LIFE_EMG_RHODOPES) return "LIFE RHODOPE VULTURE";
  const raw = String(proyectoNombre || "")
    .trim()
    .replace(/^\d+\.\s*/, "");
  return raw || "PROYECTO";
}

export function resolveRegistroKmTemplateId_(proyectoNombre) {
  return resolveExpenseSheetTemplate(proyectoNombre, []);
}

/**
 * Agrupa viajes por (proyecto, matrícula) para generar un bloque/página por vehículo.
 */
export function groupViajesForRegistroKm_(viajes) {
  const map = new Map();
  for (const v of Array.isArray(viajes) ? viajes : []) {
    const proyecto = String(v?.proyecto_nombre || "").trim() || "Sin proyecto";
    const matricula = String(v?.matricula || "")
      .trim()
      .toUpperCase() || "SIN-MATRICULA";
    const key = `${proyecto}||${matricula}`;
    if (!map.has(key)) {
      map.set(key, {
        proyecto_nombre: proyecto,
        id_proyecto: String(v?.id_proyecto || "").trim(),
        matricula,
        viajes: [],
      });
    }
    map.get(key).viajes.push(v);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.viajes.sort((a, b) => {
      const fa = String(a?.fecha_viaje || "");
      const fb = String(b?.fecha_viaje || "");
      if (fa < fb) return -1;
      if (fa > fb) return 1;
      return 0;
    });
  }
  groups.sort((a, b) => {
    const c = a.proyecto_nombre.localeCompare(b.proyecto_nombre);
    if (c) return c;
    return a.matricula.localeCompare(b.matricula);
  });
  return groups;
}

export function formatKmCell_(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 100) / 100).replace(".", ",");
}

function blankKmRowHtml_() {
  const cell = '<td style="border:1px solid #333;padding:4px 3px;font-size:9px;">&nbsp;</td>';
  return `<tr>${cell.repeat(7)}</tr>`;
}

function buildKmTableRowsHtml_(viajes, minRows = 12) {
  const list = Array.isArray(viajes) ? viajes : [];
  const rows = [];
  for (const v of list) {
    rows.push(`<tr>
      <td style="border:1px solid #333;padding:4px 3px;font-size:9px;text-align:center;white-space:nowrap;">${escapeHtml_(v.fecha_viaje || "")}</td>
      <td style="border:1px solid #333;padding:4px 3px;font-size:9px;">${escapeHtml_(v.desplazamiento || `${v.origen || ""} → ${v.destino || ""}`)}</td>
      <td style="border:1px solid #333;padding:4px 3px;font-size:9px;">${escapeHtml_(v.usuario_nombre || v.usuario_email || "")}</td>
      <td style="border:1px solid #333;padding:4px 3px;font-size:9px;text-align:center;">${escapeHtml_(formatKmCell_(v.km_inicial))}</td>
      <td style="border:1px solid #333;padding:4px 3px;font-size:9px;text-align:center;">${escapeHtml_(formatKmCell_(v.km_final))}</td>
      <td style="border:1px solid #333;padding:4px 3px;font-size:9px;text-align:center;font-weight:700;">${escapeHtml_(formatKmCell_(v.km_recorridos))}</td>
      <td style="border:1px solid #333;padding:4px 3px;font-size:9px;">${escapeHtml_(v.accion || "")}</td>
    </tr>`);
  }
  while (rows.length < minRows) rows.push(blankKmRowHtml_());
  return rows.join("");
}

function buildOneRegistroKmBlockHtml_({
  templateId,
  proyectoNombre,
  matricula,
  marca,
  modelo,
  viajes,
  logos,
  periodLabel,
  pageBreakBefore,
}) {
  const isLife = isLifeExpenseSheetTemplate(templateId);
  const titleProject = registroKmProjectTitle_(templateId, proyectoNombre);
  const lifeMeta = LIFE_PROJECT_META[templateId] || null;
  const logoLife = String(logos?.lifeProject || "").trim();
  const logoGrefa = String(logos?.grefa || "").trim();
  const logoEu = String(logos?.lifeNatura || "").trim();
  const totalKm = (Array.isArray(viajes) ? viajes : []).reduce(
    (acc, v) => acc + (Number(v?.km_recorridos) || 0),
    0
  );

  const headerTitle = `REGISTRO Km ${titleProject}.  VEHÍCULO     MARCA:   ${String(marca || "").trim() || "________"}         MODELO: ${String(modelo || "").trim() || "________"}              MATRÍCULA:${String(matricula || "").trim()}`;

  const logosHtml = isLife
    ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;">
        <div style="flex:1;text-align:left;">${logoLife ? `<img src="${attrSrc_(logoLife)}" style="max-height:56px;max-width:170px;" />` : ""}</div>
        <div style="flex:1;text-align:center;">${logoGrefa ? `<img src="${attrSrc_(logoGrefa)}" style="max-height:50px;max-width:140px;" />` : ""}</div>
        <div style="flex:1;text-align:right;">${logoEu ? `<img src="${attrSrc_(logoEu)}" style="max-height:50px;max-width:150px;" />` : ""}</div>
      </div>`
    : `<div style="display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-bottom:10px;">
        ${logoGrefa ? `<img src="${attrSrc_(logoGrefa)}" style="max-height:50px;max-width:140px;" />` : ""}
      </div>`;

  return `
  <section class="km-registro-page" style="page-break-before:${pageBreakBefore ? "always" : "auto"};page-break-inside:avoid;width:210mm;min-height:297mm;box-sizing:border-box;padding:10mm 10mm 12mm;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;">
    ${logosHtml}
    ${lifeMeta?.projectLine ? `<div style="font-size:8px;color:#444;margin-bottom:6px;">${escapeHtml_(lifeMeta.projectLine)}</div>` : ""}
    ${periodLabel ? `<div style="font-size:9px;color:#333;margin-bottom:4px;">Periodo: ${escapeHtml_(periodLabel)}</div>` : ""}
    <div style="font-size:10px;font-weight:700;text-align:center;margin:6px 0 10px;line-height:1.35;text-transform:uppercase;">
      ${escapeHtml_(headerTitle)}
    </div>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
      <colgroup>
        <col style="width:11%" />
        <col style="width:28%" />
        <col style="width:18%" />
        <col style="width:10%" />
        <col style="width:10%" />
        <col style="width:9%" />
        <col style="width:14%" />
      </colgroup>
      <thead>
        <tr>
          <th style="border:1px solid #333;padding:5px 3px;font-size:9px;background:#eee;">Fecha</th>
          <th style="border:1px solid #333;padding:5px 3px;font-size:9px;background:#eee;">Desplazamiento realizado</th>
          <th style="border:1px solid #333;padding:5px 3px;font-size:9px;background:#eee;">Técnico</th>
          <th style="border:1px solid #333;padding:5px 3px;font-size:9px;background:#eee;">Km iniciales vehículo</th>
          <th style="border:1px solid #333;padding:5px 3px;font-size:9px;background:#eee;">Km finales vehículo</th>
          <th style="border:1px solid #333;padding:5px 3px;font-size:9px;background:#eee;">Km recorridos</th>
          <th style="border:1px solid #333;padding:5px 3px;font-size:9px;background:#eee;">Acción</th>
        </tr>
      </thead>
      <tbody>
        ${buildKmTableRowsHtml_(viajes, Math.max(12, (viajes || []).length))}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="border:1px solid #333;padding:5px 3px;font-size:9px;font-weight:700;text-align:right;">Total km</td>
          <td style="border:1px solid #333;padding:5px 3px;font-size:9px;font-weight:700;text-align:center;">${escapeHtml_(formatKmCell_(totalKm))}</td>
          <td style="border:1px solid #333;padding:5px 3px;font-size:9px;">&nbsp;</td>
        </tr>
      </tfoot>
    </table>
  </section>`;
}

/**
 * HTML completo del registro km (uno o varios bloques por matrícula/proyecto).
 * @param {object} opts
 * @param {Array} opts.groups - [{ proyecto_nombre, matricula, marca, modelo, viajes, templateId? }]
 * @param {object} opts.logosByTemplate - { [templateId]: { grefa, lifeProject, lifeNatura } }
 * @param {object} opts.logosFallback - logos por defecto
 * @param {string} opts.periodLabel
 */
export function buildRegistroKmLifeHtml({
  groups,
  logosByTemplate,
  logosFallback,
  periodLabel,
  documentTitle,
}) {
  const list = Array.isArray(groups) ? groups : [];
  const blocks = list.map((g, idx) => {
    const templateId =
      g.templateId || resolveRegistroKmTemplateId_(g.proyecto_nombre) || EXPENSE_SHEET_TEMPLATE.GREFA_RELACION;
    const logos =
      (logosByTemplate && logosByTemplate[templateId]) || logosFallback || {};
    return buildOneRegistroKmBlockHtml_({
      templateId,
      proyectoNombre: g.proyecto_nombre,
      matricula: g.matricula,
      marca: g.marca,
      modelo: g.modelo,
      viajes: g.viajes,
      logos,
      periodLabel,
      pageBreakBefore: idx > 0,
    });
  });

  const title = escapeHtml_(documentTitle || "Registro Km LIFE");
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .km-registro-page { page-break-inside: avoid; }
  </style>
</head>
<body>
${blocks.join("\n") || "<div style='padding:24px;font-family:Arial;'>Sin viajes para el registro.</div>"}
</body>
</html>`;
}
