function splitMultiTicketField_(value, { keepEmpty = false } = {}) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) {
    const arr = value.map((v) => String(v || "").trim());
    return keepEmpty ? arr : arr.filter(Boolean);
  }
  const s = String(value).trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        const arr = parsed.map((v) => String(v || "").trim());
        return keepEmpty ? arr : arr.filter(Boolean);
      }
    } catch {
      // fall through
    }
  }
  const parts = s.split(/[;,]/).map((v) => String(v || "").trim());
  return keepEmpty ? parts : parts.filter(Boolean);
}

function isHttpTicketUrl_(uri) {
  return /^https?:\/\//i.test(String(uri || "").trim());
}

/** URLs Drive en orden (sin mezclar previews locales). Puede incluir "" si el JSON es paralelo a ticketLocalUris. */
export function parseTicketDriveUrlsOrdered(record) {
  const src = record || {};
  const localsLen = Array.isArray(src.ticketLocalUris) ? src.ticketLocalUris.length : 0;
  const fromJson = splitMultiTicketField_(src.ticket_drive_urls_json, { keepEmpty: true });
  if (fromJson.length) {
    if (localsLen && fromJson.length === localsLen) return fromJson;
    return fromJson.filter(Boolean);
  }
  const fromMulti = splitMultiTicketField_(src.ticket_drive_urls);
  if (fromMulti.length) return fromMulti;
  const single = String(src.ticket_drive_url || "").trim();
  return single ? [single] : [];
}

/** Nombres de archivo Drive en orden, alineados con las URLs. */
export function parseTicketDriveFileNamesOrdered(record) {
  const src = record || {};
  const urls = parseTicketDriveUrlsOrdered(src);
  const fromJson = splitMultiTicketField_(src.ticket_drive_file_names_json, { keepEmpty: true });
  if (fromJson.length) {
    if (fromJson.length === urls.length) return fromJson;
    return fromJson.filter(Boolean);
  }
  const fromMulti = splitMultiTicketField_(src.ticket_drive_file_names);
  if (fromMulti.length) return fromMulti;
  const single = String(src.ticket_drive_file_name || "").trim();
  return single ? [single] : [];
}

/** Escribe campos Drive; `urls` puede ser paralelo (con "") a ticketLocalUris. */
export function ticketDriveFieldsFromLists(urls, fileNames = []) {
  const safeUrls = (Array.isArray(urls) ? urls : []).map((u) => String(u || "").trim());
  const namesIn = Array.isArray(fileNames) ? fileNames.map((n) => String(n || "").trim()) : [];
  while (namesIn.length < safeUrls.length) namesIn.push("");
  namesIn.length = safeUrls.length;
  const compactUrls = safeUrls.filter(Boolean);
  const compactNames = safeUrls.map((u, i) => (u ? namesIn[i] || "" : null)).filter((_, i) => !!safeUrls[i]);
  return {
    ticket_drive_url: compactUrls[0] || "",
    ticket_drive_urls: compactUrls.join(";"),
    ticket_drive_urls_json: JSON.stringify(safeUrls.length ? safeUrls : compactUrls),
    ticket_drive_file_name: compactNames[0] || "",
    ticket_drive_file_names: compactNames.join(";"),
    ticket_drive_file_names_json: JSON.stringify(namesIn.length ? namesIn : compactNames),
  };
}

/**
 * Evita persistir data:/blob: enormes cuando ya hay URL Drive paralela (p. ej. tras hydrate de preview).
 * Los adjuntos nuevos (sin Drive) se conservan para que el sync pueda subirlos.
 */
export function compactTicketLocalUrisForPersist(uris, driveUrlsParallel = []) {
  const list = Array.isArray(uris) ? uris : [];
  const drives = Array.isArray(driveUrlsParallel) ? driveUrlsParallel : [];
  return list
    .map((u, i) => {
      const s = String(u || "").trim();
      if (!s) return "";
      const d = String(drives[i] || "").trim();
      if (d && isHttpTicketUrl_(d) && (s.startsWith("data:") || s.startsWith("blob:"))) return d;
      return s;
    })
    .filter(Boolean);
}

/** True si alguna URI aún requiere subida a Drive (local/data/blob). */
export function ticketUrisNeedDriveUpload(uris) {
  const list = Array.isArray(uris) ? uris : [];
  return list.some((u) => {
    const s = String(u || "").trim();
    if (!s || isHttpTicketUrl_(s)) return false;
    return (
      s.startsWith("data:") ||
      s.startsWith("blob:") ||
      s.startsWith("file:") ||
      s.startsWith("content:")
    );
  });
}

/**
 * Realinea refs Drive al cambiar ticketLocalUris (quitar/añadir).
 * Conserva URL/nombre cuando la URI previa sigue en la lista (mismo orden relativo).
 * Si el JSON Drive no es paralelo a los locales, no reutiliza URLs compactas sueltas
 * (evita asociar un adjunto nuevo a una URL Drive antigua tras quitar+añadir).
 */
export function realignTicketDriveFields(prevForm, nextUris) {
  const prevUris = (Array.isArray(prevForm?.ticketLocalUris) ? prevForm.ticketLocalUris : [])
    .map((u) => String(u || "").trim())
    .filter(Boolean);
  const next = (Array.isArray(nextUris) ? nextUris : []).map((u) => String(u || "").trim()).filter(Boolean);
  const rawJson = splitMultiTicketField_(prevForm?.ticket_drive_urls_json, { keepEmpty: true });
  const parallelOk = !prevUris.length || rawJson.length === prevUris.length;
  const prevUrls = parallelOk
    ? (() => {
        const urls = parseTicketDriveUrlsOrdered(prevForm);
        while (urls.length < prevUris.length) {
          const i = urls.length;
          urls.push(isHttpTicketUrl_(prevUris[i]) ? prevUris[i] : "");
        }
        return urls;
      })()
    : prevUris.map((u) => (isHttpTicketUrl_(u) ? u : ""));
  const prevNames = parallelOk
    ? (() => {
        const names = parseTicketDriveFileNamesOrdered(prevForm);
        while (names.length < prevUris.length) names.push("");
        return names;
      })()
    : prevUris.map(() => "");

  const nextUrls = [];
  const nextNames = [];
  let pi = 0;
  for (const uri of next) {
    let matched = -1;
    for (let i = pi; i < prevUris.length; i++) {
      if (prevUris[i] === uri) {
        matched = i;
        break;
      }
    }
    if (matched >= 0) {
      const drive = String(prevUrls[matched] || "").trim();
      nextUrls.push(drive || (isHttpTicketUrl_(uri) ? uri : ""));
      nextNames.push(String(prevNames[matched] || "").trim());
      pi = matched + 1;
    } else {
      // Adjunto nuevo (p. ej. tras quitar todos): hueco Drive → sync debe subir.
      nextUrls.push(isHttpTicketUrl_(uri) ? uri : "");
      nextNames.push("");
    }
  }

  return {
    ticketLocalUris: next,
    ...ticketDriveFieldsFromLists(nextUrls, nextNames),
  };
}

/** Extrae URLs de tickets almacenadas en una línea o gasto. */
export function parseTicketUrlsFromRecord(record) {
  const urls = [];
  const src = record || {};
  const json = src.ticket_drive_urls_json;
  if (json) {
    try {
      const parsed = JSON.parse(String(json));
      if (Array.isArray(parsed)) {
        for (const u of parsed) {
          const s = String(u || "").trim();
          if (s) urls.push(s);
        }
      }
    } catch {
      // ignore
    }
  }
  const multi = src.ticket_drive_urls;
  if (multi) {
    for (const part of String(multi).split(/[;,]/)) {
      const s = String(part || "").trim();
      if (s) urls.push(s);
    }
  }
  const single = src.ticket_drive_url;
  if (single) {
    const s = String(single).trim();
    if (s) urls.push(s);
  }
  if (Array.isArray(src.ticketLocalUris)) {
    for (const u of src.ticketLocalUris) {
      const s = String(u || "").trim();
      if (s) urls.push(s);
    }
  }
  if (Array.isArray(src.ticket_urls)) {
    for (const u of src.ticket_urls) {
      const s = String(u || "").trim();
      if (s) urls.push(s);
    }
  }
  return [...new Set(urls)];
}

export function buildExpenseIndex_(expenses) {
  const map = {};
  const list = Array.isArray(expenses) ? expenses : [];
  for (const e of list) {
    const keys = [e?.id, e?.local_id, e?.id_gasto, e?.expense_id]
      .map((k) => String(k || "").trim())
      .filter(Boolean);
    for (const k of keys) map[k] = e;
  }
  return map;
}

/** Lista de adjuntos { label, url } para anexo PDF. */
export function collectTicketAttachmentsFromLines(lines, localExpenses = []) {
  const out = [];
  const seen = new Set();
  const byId = buildExpenseIndex_(localExpenses);
  const list = Array.isArray(lines) ? lines : [];
  let n = 0;

  for (const line of list) {
    const concept = String(line?.concepto || line?.tipo_gasto || "Gasto").trim() || "Gasto";
    const urls = [...parseTicketUrlsFromRecord(line)];
    const keys = [line?.id_gasto, line?.expense_id, line?.id]
      .map((k) => String(k || "").trim())
      .filter(Boolean);
    for (const k of keys) {
      const exp = byId[k];
      if (exp) urls.push(...parseTicketUrlsFromRecord(exp));
    }
    const unique = [...new Set(urls.map((u) => String(u || "").trim()).filter(Boolean))];
    for (const url of unique) {
      if (seen.has(url)) continue;
      seen.add(url);
      n += 1;
      out.push({ label: `${concept} — ticket ${n}`, url });
    }
  }
  return out;
}
