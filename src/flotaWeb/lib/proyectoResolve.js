/**
 * Nombre de proyecto = columna B (nombre_proyecto) de la hoja PROYECTOS.
 * Los gastos pueden guardar id en departamento_o_proyecto; aquí se resuelve siempre al nombre visible.
 */

export function buildProyectoNombreByIdMap(rows) {
  const map = new Map();
  const list = Array.isArray(rows) ? rows : [];
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    const values = Object.values(r).map((v) => String(v || "").trim());
    const colB = values.length >= 2 ? values[1] : "";
    const id = String(r.id_proyecto || r.id || (values.length ? values[0] : "")).trim();
    const name = String(r.nombre_proyecto || r.nombre || r.proyecto || colB).trim();
    if (!id || !name) continue;
    map.set(id, name);
    if (!map.has(name)) map.set(name, name);
  }
  return map;
}

export function resolveProyectoNombreParaGasto(raw, proyectoById) {
  const src = raw && typeof raw === "object" ? raw : {};
  const map = proyectoById instanceof Map ? proyectoById : buildProyectoNombreByIdMap(proyectoById);

  const custom = String(src.departamento_o_proyecto_custom || "").trim();
  const dept = String(src.departamento_o_proyecto || "").trim();
  if (dept === "__OTRO__") return custom;

  const explicit = String(src.proyecto_nombre || src.proyecto_colaborador_nombre || "").trim();
  if (explicit) return explicit;

  const id = String(src.id_proyecto || src.proyecto_colaborador_id || "").trim();
  if (id && map.has(id)) return map.get(id);

  if (dept) {
    if (map.has(dept)) return map.get(dept);
    return dept;
  }
  return custom;
}

/** Al guardar gasto: valor del desplegable → etiqueta (columna B) si es id de PROYECTOS. */
export function departamentoProyectoLabelForSave(value, custom, projectOptions = [], deptOptions = []) {
  if (String(value || "").trim() === "__OTRO__") return String(custom || "").trim();
  const v = String(value || "").trim();
  if (!v) return "";
  const fromProj = (Array.isArray(projectOptions) ? projectOptions : []).find((o) => String(o?.value || "").trim() === v);
  if (fromProj?.label) return String(fromProj.label).trim();
  const fromDept = (Array.isArray(deptOptions) ? deptOptions : []).find((o) => String(o?.value || "").trim() === v);
  if (fromDept?.label) return String(fromDept.label).trim();
  return v;
}

/** Valor de desplegable Departamento/Proyecto a partir del nombre del viaje. */
export function departamentoSelectFromProyectoNombre(proyectoNombre, projectOptions = [], deptOptions = []) {
  const name = String(proyectoNombre || "").trim();
  if (!name) return { value: "", custom: "" };
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const target = norm(name);
  const proj = (Array.isArray(projectOptions) ? projectOptions : []).find(
    (o) => norm(o?.label) === target || norm(o?.value) === target
  );
  if (proj) return { value: String(proj.label || proj.value || "").trim(), custom: "" };
  const dept = (Array.isArray(deptOptions) ? deptOptions : []).find(
    (o) => norm(o?.label) === target || norm(o?.value) === target
  );
  if (dept) return { value: String(dept.label || dept.value || "").trim(), custom: "" };
  return { value: "__OTRO__", custom: name };
}

export async function fetchProyectoRowsColumnaB(apiGet, email, opts = {}) {
  const user_email = String(email || "").trim().toLowerCase();
  if (typeof apiGet !== "function") return [];
  const apiParams = {
    solo_activos: String(opts.solo_activos || "NO"),
    ...(user_email ? { user_email } : {}),
  };
  try {
    const res = await apiGet("proyecto_list_columna_b", apiParams);
    const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    if (rows.length) return rows;
  } catch {
    // fallback legacy
  }
  try {
    const res = await apiGet("proyecto_list", apiParams);
    return Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}

/** Caché de sesión (~10 min) para no bloquear cada PDF con proyecto_list. */
let proyectoRowsCache_ = { at: 0, email: "", rows: null };
const PROYECTO_ROWS_CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchProyectoRowsColumnaBCached(apiGet, email, opts = {}) {
  const user_email = String(email || "").trim().toLowerCase();
  const now = Date.now();
  if (
    !opts.force &&
    Array.isArray(proyectoRowsCache_.rows) &&
    proyectoRowsCache_.rows.length &&
    proyectoRowsCache_.email === user_email &&
    now - proyectoRowsCache_.at < PROYECTO_ROWS_CACHE_TTL_MS
  ) {
    return proyectoRowsCache_.rows;
  }
  const rows = await fetchProyectoRowsColumnaB(apiGet, email, opts);
  if (rows.length) {
    proyectoRowsCache_ = { at: now, email: user_email, rows };
  }
  return rows;
}

/** True si alguna línea aún parece id de proyecto y conviene el mapa PROYECTOS. */
export function linesNeedProyectoMapResolve_(lines) {
  const list = Array.isArray(lines) ? lines : [];
  for (const ln of list) {
    const label = String(
      ln?.proyecto || ln?.proyecto_nombre || ln?.departamento_o_proyecto || ""
    ).trim();
    if (!label || label === "__OTRO__") {
      const id = String(ln?.id_proyecto || ln?.proyecto_colaborador_id || "").trim();
      if (id) return true;
      continue;
    }
    // Ids típicos (sin espacios, cortos o con prefijo) → resolver a nombre columna B.
    if (/^(PROJ|PRY|P)-/i.test(label) || (/^[A-Z0-9_-]{2,24}$/i.test(label) && !/\s/.test(label) && label.length <= 16)) {
      return true;
    }
  }
  return false;
}

function isProyectoActivo_(activo) {
  const s = String(activo == null ? "" : activo)
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s) return true;
  if (s === "SI" || s === "S" || s === "TRUE" || s === "1" || s === "YES" || s === "Y") return true;
  return !(s === "NO" || s === "N" || s === "0" || s === "FALSE" || s === "INACTIVO");
}

/** Nombre visible: columna B de PROYECTOS (nombre_proyecto). */
export function nombreProyectoColumnaB(row) {
  if (!row || typeof row !== "object") return "";
  const values = Object.values(row).map((v) => String(v || "").trim());
  const colB = values.length >= 2 ? values[1] : "";
  return String(row.nombre_proyecto || row.nombre || row.proyecto || colB).trim();
}

/** Id del desplegable: columna A (id_proyecto) o el nombre si no hay id. */
export function idProyectoColumnaA(row) {
  if (!row || typeof row !== "object") return "";
  const values = Object.values(row).map((v) => String(v || "").trim());
  const id = String(row.id_proyecto || row.id || (values.length ? values[0] : "")).trim();
  const name = nombreProyectoColumnaB(row);
  return id || name;
}

/**
 * Opciones { value, label } para desplegables (Grabar gasto / Grabar viajes).
 * label = columna B; value = id columna A. Orden = filas de la hoja PROYECTOS (sin ordenar).
 */
export function mapProjectSelectOptions(rows, opts = {}) {
  const includeInactive = opts.includeInactive !== false;
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  const seen = new Set();
  for (const r of list) {
    if (!r || typeof r !== "object") continue;
    if (!includeInactive && !isProyectoActivo_(r.activo)) continue;
    const name = nombreProyectoColumnaB(r);
    if (!name) continue;
    const value = idProyectoColumnaA(r) || name;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push({ value, label: name });
  }
  return out;
}

/** Carga PROYECTOS (columna B) con la misma API que Grabar gasto. Usa caché opcional si falla la red. */
export async function loadProjectSelectOptions(apiGet, email, opts = {}) {
  const user_email = String(email || "").trim().toLowerCase();
  const { readCache, writeCache, onCacheHit, includeInactive, solo_activos, ...rest } = opts || {};
  void rest;
  let cached = [];
  if (typeof readCache === "function" && user_email) {
    try {
      cached = await readCache(user_email);
      if (Array.isArray(cached) && cached.length && typeof onCacheHit === "function") {
        onCacheHit(cached);
      }
    } catch {
      cached = [];
    }
  }
  try {
    const rows = await fetchProyectoRowsColumnaB(apiGet, email, { solo_activos: solo_activos || "NO" });
    const options = mapProjectSelectOptions(rows, {
      includeInactive: includeInactive !== false,
    });
    if (options.length && typeof writeCache === "function" && user_email) {
      try {
        await writeCache(user_email, options);
      } catch {
        // noop
      }
    }
    if (options.length) return options;
    if (cached.length) return cached;
    return [];
  } catch (err) {
    if (cached.length) return cached;
    throw err;
  }
}
