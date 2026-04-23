function parseDateTimeFlexible_(value) {
  const s = String(value || "").trim();
  if (!s) return null;

  // Intento directo (ISO y variantes)
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // dd/MM/yyyyTHH:mm:ss
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})T(\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    d = new Date(
      `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}T${m[4]}:${m[5]}:${m[6]}`
    );
    if (!isNaN(d.getTime())) return d;
  }

  // dd/MM/yyyy HH:mm:ss
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (m) {
    d = new Date(
      `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}T${m[4]}:${m[5]}:${m[6]}`
    );
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function apiLiberacionCrear(payload) {
  payload = payload || {};
  const required = ["matricula", "desde_ts", "hasta_ts", "motivo", "responsable_email"];
  for (var i = 0; i < required.length; i++) {
    if (!payload[required[i]]) throw new Error("Falta campo: " + required[i]);
  }

  const desde = new Date(payload.desde_ts);
  const hasta = new Date(payload.hasta_ts);
  if (isNaN(desde.getTime()) || isNaN(hasta.getTime()) || desde >= hasta) {
    throw new Error("Rango de liberación inválido");
  }

  const email = normalizeEmail_(payload.responsable_email);
  const rol = normalizeRolSegunUsuarios_(email);
  if (rol !== "GESTOR" && rol !== "RESPONSABLE") {
    throw new Error("No autorizado para crear liberaciones");
  }

  const mat = normalizeMatricula_(payload.matricula);
  if (rol === "RESPONSABLE") {
    const assigned = getMatriculasACargo_(email); // { MAT: true }
    if (!assigned[mat]) {
      throw new Error("Solo puedes crear liberaciones de vehículos a tu cargo");
    }
  }

  const id = genId_("LIB");
  const sh = getSheet(CFG.SHEETS.LIBERACIONES);

  const rowObj = {
    id_liberacion: id,
    matricula: mat,
    desde_ts: formatDateTimeISO_(desde),
    hasta_ts: formatDateTimeISO_(hasta),
    motivo: String(payload.motivo || "").trim(),
    responsable_email: email,
    created_at: formatDateTimeISO_(new Date())
  };

  appendRowByHeaders_(sh, rowObj);
  return { id_liberacion: id };
}

/**
 * action=disponibilidad_mes&anio=2026&mes=3&user_email=...
 */
function apiDisponibilidadMes(anio, mes, userEmail) {
  const y = Number(anio);
  const m = Number(mes); // 1..12
  if (!y || !m || m < 1 || m > 12) throw new Error("Parámetros anio/mes inválidos");

  const requester = normalizeEmail_(userEmail || "");
  const rol = normalizeRolSegunUsuarios_(requester);

  const inicioMes = new Date(y, m - 1, 1, 0, 0, 0);
  const finMes = new Date(y, m, 0, 23, 59, 59);

  let flota = apiFlotaList();
  const solicitudes = rowsToObjects_(getSheet(CFG.SHEETS.SOLICITUDES));
  const liberaciones = rowsToObjects_(getSheet(CFG.SHEETS.LIBERACIONES));

  // Filtro de vehículos visibles por rol
  if (rol === "RESPONSABLE") {
    const assigned = getMatriculasACargo_(requester); // { MAT: true }
    flota = flota.filter(v => !!assigned[normalizeMatricula_(v.matricula)]);
  } else if (rol === "OPERARIO") {
    // Operario: solo vehículos donde él tenga solicitudes
    const mine = {};
    solicitudes.forEach(s => {
      const owner = normalizeEmail_(s.trabajador_email || s.usuario_email || "");
      if (owner === requester) mine[normalizeMatricula_(s.matricula)] = true;
    });
    flota = flota.filter(v => !!mine[normalizeMatricula_(v.matricula)]);
  }
  // GESTOR: sin filtro

  // Solicitudes aprobadas solapadas con el mes
  const usos = solicitudes
    .filter(s => String(s.estado || "").trim().toUpperCase() === CFG.ESTADOS.SOLICITUD_APROBADA)
    .map(s => {
      const ini = parseFechaHoraDesdeFila_(s.fecha_inicio, s.hora_inicio);
      const fin = parseFechaHoraDesdeFila_(s.fecha_fin, s.hora_fin);
      return {
        matricula: normalizeMatricula_(s.matricula),
        inicio: ini,
        fin: fin,
        trabajador: String(s.trabajador_nombre || ""),
        trabajador_email: normalizeEmail_(s.trabajador_email || s.usuario_email || "")
      };
    })
    .filter(u => u.inicio && u.fin && u.inicio < finMes && u.fin > inicioMes);

  // Si operario, limitar también eventos a los suyos
  const usosFiltrados = rol === "OPERARIO"
    ? usos.filter(u => u.trabajador_email === requester)
    : usos;

  // Liberaciones (parse robusto)
  const libs = liberaciones
    .map(l => {
      const ini = parseDateTimeFlexible_(l.desde_ts);
      const fin = parseDateTimeFlexible_(l.hasta_ts);
      return {
        matricula: normalizeMatricula_(l.matricula),
        inicio: ini,
        fin: fin
      };
    })
    .filter(l => l.inicio && l.fin && l.inicio < l.fin);

  const data = flota.map(v => {
    const mat = normalizeMatricula_(v.matricula);
    const eventosVeh = usosFiltrados.filter(u => u.matricula === mat);

    const eventos = eventosVeh.map(ev => {
      const hayLib = libs.some(l =>
        l.matricula === mat &&
        ev.inicio < l.fin &&
        ev.fin > l.inicio
      );
      return {
        desde: formatDateTimeISO_(ev.inicio),
        hasta: formatDateTimeISO_(ev.fin),
        trabajador: ev.trabajador,
        liberado_parcial: hayLib
      };
    });

    return {
      matricula: mat,
      eventos: eventos
    };
  });

  return { anio: y, mes: m, data: data };
}