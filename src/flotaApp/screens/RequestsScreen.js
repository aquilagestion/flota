import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { AuthContext } from "../auth/AuthContext";
import { canApproveRequests, isGestor, isResponsable } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { theme } from "../ui/theme";
import { SelectField, TextField } from "../ui/form/Fields";

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Solicitudes de uso</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Menú</Text>
      </Pressable>
    </View>
  );
}

function normalizeEstado_(v) {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  if (s === "APROBADA" || s === "RECHAZADA" || s === "PENDIENTE" || s === "CANCELADA") return s;
  return "PENDIENTE";
}

/** Respuesta POST del router (jsonOk): datos en .data o en la raíz. */
function solicitudServerData_(res) {
  if (res == null || typeof res !== "object") return {};
  const inner = res.data;
  if (inner != null && typeof inner === "object" && !Array.isArray(inner)) return inner;
  return res;
}

function truncMsg_(s, max = 420) {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function normalizeHeaderKey_(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Cabeceras de SOLICITUDES: mayúsculas, espacios y tildes (p. ej. "Trabajador e-mail" → trabajador_email). */
function readFieldCI_(row, canonical) {
  const want = normalizeHeaderKey_(canonical);
  if (!row || typeof row !== "object") return undefined;
  for (const k of Object.keys(row)) {
    if (normalizeHeaderKey_(k) === want) return row[k];
  }
  return undefined;
}

function parseItem_(x) {
  const fechaInicio = String(readFieldCI_(x, "fecha_inicio") ?? x?.fecha_inicio ?? x?.fecha_desde ?? "").trim();
  const horaInicio = String(readFieldCI_(x, "hora_inicio") ?? x?.hora_inicio ?? "").trim();
  const fechaFin = String(readFieldCI_(x, "fecha_fin") ?? x?.fecha_fin ?? x?.fecha_hasta ?? "").trim();
  const horaFin = String(readFieldCI_(x, "hora_fin") ?? x?.hora_fin ?? "").trim();
  const rawEstado = readFieldCI_(x, "estado") ?? x?.estado;
  return {
    id_solicitud: String(readFieldCI_(x, "id_solicitud") ?? x?.id_solicitud ?? x?.id ?? "").trim(),
    estado: normalizeEstado_(rawEstado ?? ""),
    matricula: String(readFieldCI_(x, "matricula") ?? x?.matricula ?? "").trim(),
    trabajador_email: String(readFieldCI_(x, "trabajador_email") ?? x?.trabajador_email ?? x?.usuario_email ?? "")
      .trim()
      .toLowerCase(),
    trabajador_nombre: String(readFieldCI_(x, "trabajador_nombre") ?? x?.trabajador_nombre ?? x?.usuario_nombre ?? "").trim(),
    fecha_inicio: normalizeDateToDmy_(fechaInicio),
    hora_inicio: horaInicio,
    fecha_fin: normalizeDateToDmy_(fechaFin),
    hora_fin: horaFin,
    motivo: String(readFieldCI_(x, "motivo") ?? x?.motivo ?? "").trim(),
    motivo_rechazo: String(readFieldCI_(x, "motivo_rechazo") ?? x?.motivo_rechazo ?? "").trim(),
  };
}

function parseDateFlexible_(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    const yyyy = dmy[3];
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Combina fecha (dd/mm/yyyy o yyyy-mm-dd) con hora HH:mm.
 * Si no hay hora: inicio = 00:00 del día; fin = 23:59:59.999 del día (para rangos “día completo”).
 */
function combineDateTime_(dateValue, timeValue, endOfDayIfNoTime) {
  const d = parseDateFlexible_(dateValue);
  if (!d) return null;
  const t = String(timeValue || "").trim();
  if (!/^\d{2}:\d{2}$/.test(t)) {
    if (endOfDayIfNoTime) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    }
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }
  const [hh, mm] = t.split(":").map((x) => Number(x));
  const out = new Date(d);
  out.setHours(hh || 0, mm || 0, 0, 0);
  return out;
}

function ymdFromParts_(y, monthIndex, day) {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function formatYmdToEsDmy(ymd) {
  const raw = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || "—";
  const [y, m, d] = raw.split("-");
  return `${d}/${m}/${y}`;
}

function normalizeDateToDmy_(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatYmdToEsDmy(raw);
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const p1 = Number(m[1]);
    const p2 = Number(m[2]);
    const yyyy = m[3];
    if (!p1 || !p2 || p1 > 31 || p2 > 31) return raw;
    if (p2 > 12 && p1 >= 1 && p1 <= 12) {
      return `${String(p2).padStart(2, "0")}/${String(p1).padStart(2, "0")}/${yyyy}`;
    }
    if (p1 > 12 && p2 >= 1 && p2 <= 12) {
      return `${String(p1).padStart(2, "0")}/${String(p2).padStart(2, "0")}/${yyyy}`;
    }
    // Ambiguo (ambos <= 12): mantener orden recibido pero normalizar padding.
    return `${String(p1).padStart(2, "0")}/${String(p2).padStart(2, "0")}/${yyyy}`;
  }
  const d = parseDateFlexible_(raw);
  if (d) {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return raw;
}

/** Convierte yyyy-mm-dd a dd/mm/yyyy para el payload del servidor si hace falta. */
function toDmyForPayload_(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${d}/${m}/${y}`;
  }
  return raw;
}

function formatTimeHmFromDate_(d) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function notifyEmailsFromFlotaRow_(v) {
  const raw = String(v?.["e-mail_de_notificaciones"] || v?.email_de_notificaciones || "").trim();
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
}

function displayDateLabel_(raw) {
  const s = String(raw || "").trim();
  if (!s) return "—";
  return normalizeDateToDmy_(s) || "—";
}

/** FLOTA columna activo (p. ej. R): NO / false / 0 → no entra en “disponibles”. */
function flotaVehiculoEstaActivo_(v) {
  const a = String(v?.activo ?? "SI")
    .trim()
    .toUpperCase();
  if (a === "NO" || a === "N" || a === "FALSE" || a === "0") return false;
  return true;
}

function formatHoraMostrar_(hm) {
  const t = String(hm || "").trim();
  return /^\d{2}:\d{2}$/.test(t) ? t : "";
}

function vehicleLabel_(v) {
  const mat = String(v?.matricula || "").trim().toUpperCase();
  const marca = String(v?.marca || "").trim();
  const modelo = String(v?.modelo || "").trim();
  const parts = [mat, marca, modelo].filter(Boolean);
  return parts.join(" · ");
}

function todayDmy_() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function bestUserName_(user) {
  const candidates = [
    user?.displayName,
    user?.nombre,
    user?.name,
    user?.fullName,
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (candidates.length) return candidates[0];
  const email = String(user?.email || "").trim().toLowerCase();
  const local = email.split("@")[0] || "";
  if (!local) return "";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function rangesOverlap_(aStart, aEnd, bStart, bEnd) {
  const a0 = aStart?.getTime?.();
  const a1 = (aEnd || aStart)?.getTime?.();
  const b0 = bStart?.getTime?.();
  const b1 = (bEnd || bStart)?.getTime?.();
  if (![a0, a1, b0, b1].every((n) => typeof n === "number" && !Number.isNaN(n))) return false;
  return a0 <= b1 && b0 <= a1;
}

/** Misma regla que el servidor al crear: APROBADA o PENDIENTE bloquean el intervalo. */
function itemsReservanVehiculo_(items) {
  return (Array.isArray(items) ? items : []).filter((x) => x.estado === "APROBADA" || x.estado === "PENDIENTE");
}

function findSolapeReserva_(mat, dtStart, dtEnd, items) {
  const matN = String(mat || "").trim().toUpperCase();
  for (const x of itemsReservanVehiculo_(items)) {
    const reqMat = String(x?.matricula || "").trim().toUpperCase();
    if (reqMat !== matN) continue;
    const reqStart = combineDateTime_(x?.fecha_inicio, x?.hora_inicio, false);
    const reqEnd = combineDateTime_(x?.fecha_fin, x?.hora_fin, true);
    if (!reqStart || !reqEnd) continue;
    if (rangesOverlap_(dtStart, dtEnd, reqStart, reqEnd)) return x;
  }
  return null;
}

function monthLabel_(dateObj) {
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(dateObj);
}

function getMonthGrid_(dateObj) {
  const y = dateObj.getFullYear();
  const m = dateObj.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstWeekday = (new Date(y, m, 1).getDay() + 6) % 7; // Lunes=0
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function MonthDatePickerModal({ visible, title, selectedYmd, onPickYmd, onClose }) {
  const [monthDate, setMonthDate] = useState(() => new Date());
  useEffect(() => {
    if (!visible) return;
    const raw = String(selectedYmd || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const parts = raw.split("-").map(Number);
      setMonthDate(new Date(parts[0], parts[1] - 1, 1));
    } else {
      const d = new Date();
      setMonthDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [visible, selectedYmd]);
  const cells = useMemo(() => getMonthGrid_(monthDate), [monthDate]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={[styles.message, { marginBottom: 6 }]}>Selecciona un día</Text>
          <View style={styles.row}>
            <Pressable style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton]} onPress={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
              <Text style={styles.tabNavText}>◀ Mes</Text>
            </Pressable>
            <Pressable style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton]} onPress={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
              <Text style={styles.tabNavText}>Mes ▶</Text>
            </Pressable>
          </View>
          <Text style={[styles.message, { fontWeight: "800", marginTop: 4, textTransform: "capitalize" }]}>{monthLabel_(monthDate)}</Text>
          <View style={styles.weekHeader}>
            {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
              <Text key={`mph-${d}`} style={styles.weekHeaderText}>
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {cells.map((day, idx) => {
              if (!day) return <View key={`mpv-${idx}`} style={[styles.dayPickCell, styles.dayCellVoid]} />;
              const ymd = ymdFromParts_(monthDate.getFullYear(), monthDate.getMonth(), day);
              const sel = String(selectedYmd || "").trim() === ymd;
              return (
                <Pressable key={`mpd-${idx}-${day}`} style={[styles.dayPickCell, sel && styles.dayPickSelected]} onPress={() => onPickYmd(ymd)}>
                  <Text style={styles.dayPickText}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable style={[styles.buttonSecondary, { marginTop: 12 }]} onPress={onClose}>
            <Text style={styles.buttonTextSmall}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function OptionalTimeModal({ visible, title, valueHm, onSave, onClear, onClose }) {
  const [draft, setDraft] = useState(() => new Date(1970, 0, 1, 9, 0, 0, 0, 0));
  useEffect(() => {
    if (!visible) return;
    const t = String(valueHm || "").trim();
    if (/^\d{2}:\d{2}$/.test(t)) {
      const [h, m] = t.split(":").map((x) => Number(x));
      setDraft(new Date(1970, 0, 1, h || 0, m || 0, 0, 0));
    } else {
      setDraft(new Date(1970, 0, 1, 9, 0, 0, 0, 0));
    }
  }, [visible, valueHm]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <DateTimePicker
            value={draft}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(_, date) => {
              if (date) setDraft(date);
            }}
          />
          <View style={styles.row}>
            <Pressable
              style={[styles.buttonSecondary, styles.flex1]}
              onPress={() => {
                onClear();
                onClose();
              }}
            >
              <Text style={styles.buttonTextSmall}>Sin hora</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.flex1]}
              onPress={() => {
                onSave(formatTimeHmFromDate_(draft));
                onClose();
              }}
            >
              <Text style={styles.buttonTextSmall}>Guardar</Text>
            </Pressable>
          </View>
          <Pressable style={[styles.buttonSecondary, { marginTop: 8 }]} onPress={onClose}>
            <Text style={styles.buttonTextSmall}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function dayBounds_(monthDate, dayNumber) {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const start = new Date(y, m, dayNumber, 0, 0, 0, 0);
  const end = new Date(y, m, dayNumber, 23, 59, 59, 999);
  return { start, end };
}

export default function RequestsScreen({ navigation }) {
  const { user, role } = React.useContext(AuthContext);
  const allowed = canApproveRequests(role);
  const gestor = isGestor(role);
  const responsable = isResponsable(role);
  const [vista, setVista] = useState("SOLICITUDES");
  const [estadoFiltro, setEstadoFiltro] = useState("PENDIENTE");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [assignedSet, setAssignedSet] = useState(new Set());
  const [vehiclesCatalog, setVehiclesCatalog] = useState([]);
  const [vehiculoFiltro, setVehiculoFiltro] = useState("TODOS");
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [fechaModalTarget, setFechaModalTarget] = useState(null);
  const [timeModalTarget, setTimeModalTarget] = useState(null);
  const [matricula, setMatricula] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [matriculas, setMatriculas] = useState([]);
  const [dispDesde, setDispDesde] = useState("");
  const [dispHasta, setDispHasta] = useState("");
  const [dispHoraDesde, setDispHoraDesde] = useState("");
  const [dispHoraHasta, setDispHoraHasta] = useState("");
  const [dispResult, setDispResult] = useState(null);
  const [dispModal, setDispModal] = useState({
    visible: false,
    rangeLabel: "",
    available: [],
    busy: [],
  });
  const [dayDetailModal, setDayDetailModal] = useState({
    visible: false,
    title: "",
    dayYmd: "",
    available: [],
    busy: [],
  });
  const [busyDetailModal, setBusyDetailModal] = useState({
    visible: false,
    vehicle: null,
  });
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState({ visible: false, item: null, motivo: "", sending: false });

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    const byEstado = items.filter((x) => (estadoFiltro ? x.estado === estadoFiltro : true));
    if (!q) return byEstado;
    return byEstado.filter((x) => `${x.matricula} ${x.trabajador_email} ${x.motivo}`.toLowerCase().includes(q));
  }, [items, query, estadoFiltro]);

  const pendingApprovalList = useMemo(() => {
    return items.filter((x) => {
      if (x.estado !== "PENDIENTE") return false;
      if (gestor) return true;
      // RESPONSABLE: solicitud_list en Apps Script ya devuelve solo filas a tu cargo (o tuyas como solicitante).
      if (responsable && !gestor) return true;
      return false;
    });
  }, [items, gestor, responsable]);

  const pendingFiltered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return pendingApprovalList;
    return pendingApprovalList.filter((x) => `${x.matricula} ${x.trabajador_email} ${x.motivo}`.toLowerCase().includes(q));
  }, [pendingApprovalList, query]);

  const vehiclesCatalogActiva = useMemo(() => {
    const list = Array.isArray(vehiclesCatalog) ? vehiclesCatalog : [];
    return list.filter(flotaVehiculoEstaActivo_);
  }, [vehiclesCatalog]);

  const monthCells = useMemo(() => getMonthGrid_(monthCursor), [monthCursor]);

  const calendarStatsByDay = useMemo(() => {
    const reservas = itemsReservanVehiculo_(items);
    const activeList = vehiclesCatalogActiva;
    const activeMats = new Set(activeList.map((v) => String(v?.matricula || "").trim().toUpperCase()).filter(Boolean));
    const totalVehicles = activeList.length;
    const byDay = {};
    for (const day of monthCells) {
      if (!day) continue;
      const { start, end } = dayBounds_(monthCursor, day);
      if (vehiculoFiltro === "TODOS") {
        const usedSet = new Set();
        for (const x of reservas) {
          const mat = String(x.matricula || "").trim().toUpperCase();
          if (!activeMats.has(mat)) continue;
          const reqStart = combineDateTime_(x.fecha_inicio, x.hora_inicio, false);
          const reqEnd = combineDateTime_(x.fecha_fin, x.hora_fin, true);
          if (!reqStart || !reqEnd) continue;
          if (!rangesOverlap_(start, end, reqStart, reqEnd)) continue;
          usedSet.add(mat);
        }
        const used = usedSet.size;
        byDay[day] = {
          busy: used > 0,
          used,
          free: Math.max(totalVehicles - used, 0),
          total: totalVehicles,
        };
      } else {
        const busy = reservas.some((x) => {
          const mat = String(x.matricula || "").trim().toUpperCase();
          if (mat !== vehiculoFiltro) return false;
          const reqStart = combineDateTime_(x.fecha_inicio, x.hora_inicio, false);
          const reqEnd = combineDateTime_(x.fecha_fin, x.hora_fin, true);
          if (!reqStart || !reqEnd) return false;
          return rangesOverlap_(start, end, reqStart, reqEnd);
        });
        byDay[day] = { busy };
      }
    }
    return byDay;
  }, [items, vehiclesCatalog, vehiclesCatalogActiva, vehiculoFiltro, monthCells, monthCursor]);

  const load = async () => {
    setLoading(true);
    try {
      let assignedNow = new Set();
      let mats = [];
      try {
        const flotaRes = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
        const flota = Array.isArray(flotaRes?.data) ? flotaRes.data : Array.isArray(flotaRes) ? flotaRes : [];
        const catalog = flota
          .map((v) => ({
            matricula: String(v?.matricula || "").trim().toUpperCase(),
            marca: String(v?.marca || "").trim(),
            modelo: String(v?.modelo || "").trim(),
            activo: String(v?.activo ?? "SI").trim(),
          }))
          .filter((x) => x.matricula);
        const seen = new Set();
        const uniqCatalog = catalog.filter((x) => {
          if (seen.has(x.matricula)) return false;
          seen.add(x.matricula);
          return true;
        });
        setVehiclesCatalog(uniqCatalog);
        mats = flota
          .map((v) => String(v?.matricula || "").trim().toUpperCase())
          .filter(Boolean);
        setMatriculas(Array.from(new Set(mats)).sort());
      } catch {
        setMatriculas([]);
      }
      if (responsable && !gestor) {
        const flotaRes = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
        const flota = Array.isArray(flotaRes?.data) ? flotaRes.data : Array.isArray(flotaRes) ? flotaRes : [];
        const me = String(user?.email || "").trim().toLowerCase();
        const mine = flota.filter((v) => {
          const resp = String(v?.responsable || "").trim().toLowerCase();
          const notifyEmails = notifyEmailsFromFlotaRow_(v);
          return !!me && (resp === me || notifyEmails.includes(me));
        });
        assignedNow = new Set(mine.map((v) => String(v?.matricula || "").trim().toUpperCase()).filter(Boolean));
        setAssignedSet(assignedNow);
      } else {
        setAssignedSet(new Set());
      }

      const res = await sheetsApi.get("solicitud_list", {
        estado: "",
        trabajador_email: "",
        user_email: user?.email || "",
      });
      const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      // No filtrar de nuevo en el cliente: apiSolicitudList (Apps Script) ya aplica rol + matrículas a cargo.
      // Un segundo filtro aquí vaciaba el listado si FLOTA y getMatriculasACargo_ no coincidían al milímetro.
      const next = rows.map(parseItem_);
      setItems(next);
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudieron cargar solicitudes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.email, responsable, gestor]);

  const crearSolicitud = async () => {
    const mat = String(matricula || "").trim().toUpperCase();
    const fiRaw = String(fechaInicio || "").trim();
    const hi = String(horaInicio || "").trim();
    const ffRaw = String(fechaFin || "").trim();
    const hf = String(horaFin || "").trim();
    const mot = String(motivo || "").trim();
    if (!mat || !fiRaw || !ffRaw || !mot) {
      Alert.alert("Datos incompletos", "Completa matrícula, fecha de inicio, fecha de fin y motivo. Las horas son opcionales.");
      return;
    }
    if (hi && !/^\d{2}:\d{2}$/.test(hi)) {
      Alert.alert("Hora inicio", "Usa formato HH:mm o deja la hora vacía.");
      return;
    }
    if (hf && !/^\d{2}:\d{2}$/.test(hf)) {
      Alert.alert("Hora fin", "Usa formato HH:mm o deja la hora vacía.");
      return;
    }
    const fi = toDmyForPayload_(fiRaw);
    const ff = toDmyForPayload_(ffRaw);
    const dtStart = combineDateTime_(fiRaw, hi, false);
    const dtEnd = combineDateTime_(ffRaw, hf, true);
    if (!dtStart || !dtEnd || dtEnd.getTime() < dtStart.getTime()) {
      Alert.alert("Rango inválido", "La fecha de fin debe ser igual o posterior a la de inicio (y las horas, si las indicas, deben cerrar un intervalo válido).");
      return;
    }

    const solape = findSolapeReserva_(mat, dtStart, dtEnd, items);
    if (solape) {
      const tipo = solape.estado === "PENDIENTE" ? "pendiente de aprobación" : "aprobada";
      const hi = formatHoraMostrar_(solape.hora_inicio);
      const hf = formatHoraMostrar_(solape.hora_fin);
      Alert.alert(
        "Vehículo no disponible",
        `Ya hay una solicitud ${tipo} para ${mat} que solapa con el periodo elegido (${String(solape.fecha_inicio || "").trim()}${hi ? ` ${hi}` : ""} → ${String(solape.fecha_fin || "").trim()}${hf ? ` ${hf}` : ""}). Cambia fechas, horas o matrícula.`
      );
      return;
    }

    const payload = {
      matricula: mat,
      trabajador_email: String(user?.email || "").trim().toLowerCase(),
      trabajador_nombre: bestUserName_(user),
      fecha_solicitud: todayDmy_(),
      fecha_inicio: fi,
      hora_inicio: hi,
      fecha_fin: ff,
      hora_fin: hf,
      motivo: mot,
      estado: "PENDIENTE",
      // Compatibilidad backend anterior.
      fecha_desde: fi,
      fecha_hasta: ff,
      user_email: String(user?.email || "").trim().toLowerCase(),
    };

    try {
      setCreating(true);
      const resCrear = await sheetsApi.post("solicitud_crear", payload, { user_email: user?.email || "" });
      const d = solicitudServerData_(resCrear);
      const mailOk = d.email_notificado === true || d.email_notificado === "true";
      const dest = String(d.email_destino || d.emails_tras_validar_responsable_usuarios || "").trim();
      const aviso = truncMsg_(d.email_aviso || "");
      const msg = mailOk
        ? `Correo de aviso enviado (según servidor) a: ${dest || "destinatarios"}.`
        : `Correo de aviso NO enviado.\n\nMotivo / detalle del servidor:\n${aviso || "sin detalle (revisa permisos Mail/Gmail del proyecto Apps Script y despliegue como tú)."}`;
      Alert.alert("Solicitud creada", `La solicitud se ha registrado.\n\n${msg}`);
      setMotivo("");
      setMatricula("");
      setFechaInicio("");
      setHoraInicio("");
      setFechaFin("");
      setHoraFin("");
      await load();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo crear la solicitud.");
    } finally {
      setCreating(false);
    }
  };

  const resolver = async (item, estado, motivoRechazoOpt) => {
    if (!allowed) {
      Alert.alert("Permisos insuficientes", "Solo pueden resolver solicitudes quienes el servidor autorice (normalmente RESPONSABLE del vehículo o GESTOR). Tu usuario debe tener rol RESPONSABLE en USUARIOS para los vehículos a tu cargo.");
      return;
    }
    if (responsable && !gestor) {
      const mat = String(item?.matricula || "").trim().toUpperCase();
      if (!assignedSet.has(mat)) {
        Alert.alert("Permisos insuficientes", "Solo puedes resolver solicitudes de vehículos a tu cargo.");
        return;
      }
    }
    try {
      if (estado === "APROBADA") {
        const approvedRes = await sheetsApi.get("solicitud_list", {
          estado: "APROBADA",
          trabajador_email: "",
          user_email: user?.email || "",
        });
        const approvedRows = Array.isArray(approvedRes?.data) ? approvedRes.data : Array.isArray(approvedRes) ? approvedRes : [];
        const currentMat = String(item?.matricula || "").trim().toUpperCase();
        const itemStart = combineDateTime_(item?.fecha_inicio, item?.hora_inicio, false);
        const itemEnd = combineDateTime_(item?.fecha_fin, item?.hora_fin, true);
        const conflict = approvedRows
          .map(parseItem_)
          .find((x) => {
            if (String(x?.id_solicitud || "") === String(item?.id_solicitud || "")) return false;
            if (String(x?.matricula || "").trim().toUpperCase() !== currentMat) return false;
            return rangesOverlap_(
              itemStart,
              itemEnd,
              combineDateTime_(x?.fecha_inicio, x?.hora_inicio, false),
              combineDateTime_(x?.fecha_fin, x?.hora_fin, true)
            );
          });
        if (conflict) {
          Alert.alert(
            "Solape detectado",
            `Ya existe una solicitud APROBADA para ${currentMat} en ese rango (${conflict.fecha_inicio || "-"} ${conflict.hora_inicio || ""} → ${conflict.fecha_fin || "-"} ${conflict.hora_fin || ""})`
          );
          return;
        }
      }

      const resRes = await sheetsApi.post(
        "solicitud_resolver",
        {
          id_solicitud: item.id_solicitud,
          estado: estado,
          resuelto_por_email: user?.email || "",
          trabajador_email: String(item?.trabajador_email || "").trim().toLowerCase(),
          motivo_rechazo: estado === "RECHAZADA" ? String(motivoRechazoOpt || "").trim() : "",
        },
        { user_email: user?.email || "" }
      );
      const dr = solicitudServerData_(resRes);
      const mailSol =
        dr.email_solicitante_enviado === true || dr.email_solicitante_enviado === "true";
      const avSol = truncMsg_(dr.email_solicitante_aviso || "");
      const destSol = String(dr.email_solicitante_destino || "").trim();
      Alert.alert(
        "Resolución registrada",
        mailSol
          ? `Correo al solicitante enviado a: ${destSol || "email del solicitante"}.`
          : `Correo al solicitante NO enviado.\n\n${avSol || "sin detalle"}\n\nDestino intentado: ${destSol || "—"}`
      );
      await load();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo resolver la solicitud.");
    }
  };

  const availabilityForRange_ = (start, end) => {
    const reservas = itemsReservanVehiculo_(items);
    const pool =
      vehiculoFiltro === "TODOS"
        ? vehiclesCatalogActiva
        : vehiclesCatalogActiva.filter((v) => String(v?.matricula || "").trim().toUpperCase() === vehiculoFiltro);
    const available = [];
    const busy = [];
    for (const v of pool) {
      const mat = String(v?.matricula || "").trim().toUpperCase();
      if (!mat) continue;
      const overlap = reservas.find((x) => {
        const reqMat = String(x?.matricula || "").trim().toUpperCase();
        if (reqMat !== mat) return false;
        const reqStart = combineDateTime_(x?.fecha_inicio, x?.hora_inicio, false);
        const reqEnd = combineDateTime_(x?.fecha_fin, x?.hora_fin, true);
        if (!reqStart || !reqEnd) return false;
        return rangesOverlap_(start, end, reqStart, reqEnd);
      });
      if (overlap) busy.push({ ...v, overlap });
      else if (flotaVehiculoEstaActivo_(v)) available.push(v);
    }
    return { available, busy };
  };

  const calcularDisponibilidades = () => {
    const fromRaw = String(dispDesde || "").trim();
    const toRaw = String(dispHasta || "").trim();
    const fromHourRaw = String(dispHoraDesde || "").trim();
    const toHourRaw = String(dispHoraHasta || "").trim();
    if (!fromRaw || !toRaw) {
      Alert.alert("Datos incompletos", "Indica fecha desde y fecha hasta.");
      return;
    }
    const fromDate = parseDateFlexible_(fromRaw);
    const toDate = parseDateFlexible_(toRaw);
    if (!fromDate || !toDate) {
      Alert.alert("Formato inválido", "Usa fechas válidas (por ejemplo dd/mm/aaaa).");
      return;
    }
    const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0, 0);
    const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59, 999);
    if (fromHourRaw) {
      if (!/^\d{2}:\d{2}$/.test(fromHourRaw)) {
        Alert.alert("Hora inválida", "Hora desde debe tener formato HH:mm.");
        return;
      }
      const [hh, mm] = fromHourRaw.split(":").map((x) => Number(x));
      start.setHours(hh || 0, mm || 0, 0, 0);
    }
    if (toHourRaw) {
      if (!/^\d{2}:\d{2}$/.test(toHourRaw)) {
        Alert.alert("Hora inválida", "Hora hasta debe tener formato HH:mm.");
        return;
      }
      const [hh, mm] = toHourRaw.split(":").map((x) => Number(x));
      end.setHours(hh || 0, mm || 0, 59, 999);
    }
    if (end.getTime() < start.getTime()) {
      Alert.alert("Rango inválido", "La fecha hasta debe ser igual o posterior a la fecha desde.");
      return;
    }

    const reservas = itemsReservanVehiculo_(items);
    const available = [];
    const busy = [];
    for (const v of vehiclesCatalog) {
      const mat = String(v?.matricula || "").trim().toUpperCase();
      if (!mat) continue;
      const overlap = reservas.find((x) => {
        const reqMat = String(x?.matricula || "").trim().toUpperCase();
        if (reqMat !== mat) return false;
        const reqStart = combineDateTime_(x?.fecha_inicio, x?.hora_inicio, false);
        const reqEnd = combineDateTime_(x?.fecha_fin, x?.hora_fin, true);
        if (!reqStart || !reqEnd) return false;
        return rangesOverlap_(start, end, reqStart, reqEnd);
      });
      if (overlap) busy.push({ ...v, overlap });
      else if (flotaVehiculoEstaActivo_(v)) available.push(v);
    }

    const next = {
      from: fromRaw,
      to: toRaw,
      fromHour: fromHourRaw,
      toHour: toHourRaw,
      available,
      busy,
    };
    setDispResult(next);
    setDispModal({
      visible: true,
      rangeLabel: `${displayDateLabel_(next.from)} ${next.fromHour || ""} → ${displayDateLabel_(next.to)} ${next.toHour || ""}`.trim(),
      available: next.available,
      busy: next.busy,
    });
  };

  const dateModalTitle =
    fechaModalTarget === "inicio"
      ? "Fecha de inicio"
      : fechaModalTarget === "fin"
        ? "Fecha de fin"
        : fechaModalTarget === "dispDesde"
          ? "Disponibilidad · fecha desde"
          : fechaModalTarget === "dispHasta"
            ? "Disponibilidad · fecha hasta"
            : "";

  const dateModalSelected =
    fechaModalTarget === "inicio"
      ? fechaInicio
      : fechaModalTarget === "fin"
        ? fechaFin
        : fechaModalTarget === "dispDesde"
          ? dispDesde
          : fechaModalTarget === "dispHasta"
            ? dispHasta
            : "";

  const timeModalTitle =
    timeModalTarget === "HI"
      ? "Hora de inicio (opcional)"
      : timeModalTarget === "HF"
        ? "Hora de fin (opcional)"
        : timeModalTarget === "DD"
          ? "Hora desde (opcional)"
          : timeModalTarget === "DH"
            ? "Hora hasta (opcional)"
            : "";

  const timeModalValue =
    timeModalTarget === "HI"
      ? horaInicio
      : timeModalTarget === "HF"
        ? horaFin
        : timeModalTarget === "DD"
          ? dispHoraDesde
          : timeModalTarget === "DH"
            ? dispHoraHasta
            : "";

  const solicitudesList = vista === "PENDIENTES" ? pendingFiltered : filtered;

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.navigate("Menu")} />
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Vista</Text>
        <View style={[styles.row, styles.tabRowWrap]}>
          <Pressable
            style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton, vista === "SOLICITUDES" && styles.buttonActive]}
            onPress={() => setVista("SOLICITUDES")}
          >
            <Text style={styles.tabNavText}>Solicitudes</Text>
          </Pressable>
          {allowed ? (
            <Pressable
              style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton, vista === "PENDIENTES" && styles.buttonActive]}
              onPress={() => setVista("PENDIENTES")}
            >
              <Text style={styles.tabNavText}>Pendientes</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton, vista === "CALENDARIO" && styles.buttonActive]}
            onPress={() => setVista("CALENDARIO")}
          >
            <Text style={styles.tabNavText}>Calendario</Text>
          </Pressable>
          <Pressable
            style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton, vista === "DISPONIBILIDADES" && styles.buttonActive]}
            onPress={() => setVista("DISPONIBILIDADES")}
          >
            <Text style={styles.tabNavText}>Disponibilidades</Text>
          </Pressable>
        </View>
      </View>
      {vista === "SOLICITUDES" ? (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Formulario de solicitud</Text>
            <SelectField
              label="Matrícula"
              value={matricula}
              onChange={setMatricula}
              options={[
                { value: "", label: "Selecciona..." },
                ...vehiclesCatalogActiva.map((v) => ({
                  value: String(v?.matricula || "").trim().toUpperCase(),
                  label: vehicleLabel_(v),
                })),
              ]}
            />
            <Text style={[styles.sectionTitle, { marginTop: 4 }]}>Fecha de inicio</Text>
            <Pressable style={styles.dateTapRow} onPress={() => setFechaModalTarget("inicio")}>
              <Text style={styles.dateTapValue}>{fechaInicio ? displayDateLabel_(fechaInicio) : "Toca para elegir fecha"}</Text>
            </Pressable>
            <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Hora inicio (opcional)</Text>
            <Pressable style={styles.buttonSecondary} onPress={() => setTimeModalTarget("HI")}>
              <Text style={styles.buttonTextSmall}>{horaInicio || "Toca para indicar hora (o dejar sin hora)"}</Text>
            </Pressable>
            {horaInicio ? (
              <Pressable onPress={() => setHoraInicio("")} style={styles.linkClearWrap}>
                <Text style={styles.linkClear}>Quitar hora de inicio</Text>
              </Pressable>
            ) : null}
            <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Fecha de fin</Text>
            <Pressable style={styles.dateTapRow} onPress={() => setFechaModalTarget("fin")}>
              <Text style={styles.dateTapValue}>{fechaFin ? displayDateLabel_(fechaFin) : "Toca para elegir fecha"}</Text>
            </Pressable>
            <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Hora fin (opcional)</Text>
            <Pressable style={styles.buttonSecondary} onPress={() => setTimeModalTarget("HF")}>
              <Text style={styles.buttonTextSmall}>{horaFin || "Toca para indicar hora (o dejar sin hora)"}</Text>
            </Pressable>
            {horaFin ? (
              <Pressable onPress={() => setHoraFin("")} style={styles.linkClearWrap}>
                <Text style={styles.linkClear}>Quitar hora de fin</Text>
              </Pressable>
            ) : null}
            <TextField label="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Describe el uso previsto" />
            <Pressable style={[styles.button, creating && { opacity: 0.7 }]} onPress={crearSolicitud} disabled={creating}>
              <Text style={styles.buttonTextSmall}>{creating ? "Enviando..." : "Crear solicitud"}</Text>
            </Pressable>
            {!allowed ? (
              <Text style={[styles.message, { marginTop: 8 }]}>
                Tu rol puede crear solicitudes. La aprobación o rechazo corresponde al responsable del vehículo (rol RESPONSABLE en USUARIOS y vínculo en FLOTA); el GESTOR puede tener permiso extra según el servidor.
              </Text>
            ) : null}
          </View>

        <View style={styles.card}>
          <SelectField
            label="Estado"
            value={estadoFiltro}
            onChange={setEstadoFiltro}
            options={[
              { value: "PENDIENTE", label: "PENDIENTE" },
              { value: "APROBADA", label: "APROBADA" },
              { value: "RECHAZADA", label: "RECHAZADA" },
              { value: "CANCELADA", label: "CANCELADA" },
            ]}
          />
          <TextField label="Buscar" value={query} onChangeText={setQuery} placeholder="matrícula, email o motivo" />
          <Pressable style={styles.buttonSecondary} onPress={load}>
            <Text style={styles.buttonTextSmall}>Recargar</Text>
          </Pressable>
        </View>
        </>
      ) : null}
      {vista === "PENDIENTES" && allowed ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pendientes de aprobación</Text>
          <Text style={styles.message}>
            Solo solicitudes en estado PENDIENTE que el servidor te asigna: si eres RESPONSABLE (en USUARIOS), las de vehículos a tu cargo en FLOTA; si eres GESTOR, todas las pendientes del listado cargado.
          </Text>
          <TextField label="Buscar" value={query} onChangeText={setQuery} placeholder="matrícula, email o motivo" />
          <Pressable style={styles.buttonSecondary} onPress={load}>
            <Text style={styles.buttonTextSmall}>Recargar</Text>
          </Pressable>
        </View>
      ) : null}
      {vista === "CALENDARIO" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Calendario de uso (almanaque)</Text>
          <SelectField
            label="Vehículo"
            value={vehiculoFiltro}
            onChange={setVehiculoFiltro}
            options={[
              { value: "TODOS", label: "Todos los vehículos" },
              ...vehiclesCatalog.map((x) => ({
                value: x.matricula,
                label: `${x.matricula}${x.modelo ? ` · ${x.modelo}` : ""}`,
              })),
            ]}
          />
          <View style={styles.row}>
            <Pressable
              style={[styles.buttonSecondary, styles.flex1]}
              onPress={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
            >
              <Text style={styles.buttonText}>Mes anterior</Text>
            </Pressable>
            <Pressable
              style={[styles.buttonSecondary, styles.flex1]}
              onPress={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
            >
              <Text style={styles.buttonText}>Mes siguiente</Text>
            </Pressable>
          </View>
          <Text style={[styles.sectionTitle, { textTransform: "capitalize", marginTop: 10 }]}>{monthLabel_(monthCursor)}</Text>
          <View style={styles.weekHeader}>
            {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
              <Text key={d} style={styles.weekHeaderText}>
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {monthCells.map((day, idx) => {
              if (!day) return <View key={`void-${idx}`} style={[styles.dayCell, styles.dayCellVoid]} />;
              const stat = calendarStatsByDay[day] || { busy: false, used: 0, free: 0, total: 0 };
              const isBusy = !!stat.busy;
              return (
                <Pressable
                  key={`day-${day}`}
                  style={[styles.dayCell, isBusy ? styles.dayBusy : styles.dayFree]}
                  onPress={() => {
                    const { start, end } = dayBounds_(monthCursor, day);
                    const out = availabilityForRange_(start, end);
                    const dd = String(day).padStart(2, "0");
                    const mm = String(monthCursor.getMonth() + 1).padStart(2, "0");
                    const yyyy = monthCursor.getFullYear();
                    const dayYmd = ymdFromParts_(monthCursor.getFullYear(), monthCursor.getMonth(), day);
                    setDayDetailModal({
                      visible: true,
                      title: `${dd}/${mm}/${yyyy}`,
                      dayYmd,
                      available: out.available,
                      busy: out.busy,
                    });
                  }}
                >
                  <Text style={styles.dayNumber}>{day}</Text>
                  {vehiculoFiltro === "TODOS" ? (
                    <>
                      <Text style={styles.dayDetailBusy}>Uso: {stat.used}</Text>
                      <Text style={styles.dayDetailFree}>Libre: {stat.free}</Text>
                    </>
                  ) : (
                    <Text style={styles.dayState}>{isBusy ? "EN USO" : "LIBRE"}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.message, { marginTop: 10 }]}>
            Leyenda: <Text style={{ color: "#ffd0d0" }}>rojo = en uso</Text> · <Text style={{ color: "#c9ffd9" }}>verde = libre</Text>
          </Text>
          <Pressable style={styles.buttonSecondary} onPress={load}>
            <Text style={styles.buttonText}>Recargar</Text>
          </Pressable>
        </View>
      ) : vista === "DISPONIBILIDADES" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Disponibilidades</Text>
          <Text style={styles.message}>
            Solo se listan como disponibles vehículos con activo distinto de NO en FLOTA. Los ocupados muestran datos de la reserva aprobada.
          </Text>
          <Text style={[styles.sectionTitle, { marginTop: 2 }]}>Fecha desde</Text>
          <Pressable style={styles.dateTapRow} onPress={() => setFechaModalTarget("dispDesde")}>
            <Text style={styles.dateTapValue}>{dispDesde ? displayDateLabel_(dispDesde) : "Toca para elegir fecha"}</Text>
          </Pressable>
          <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Hora desde (opcional)</Text>
          <Pressable style={styles.buttonSecondary} onPress={() => setTimeModalTarget("DD")}>
            <Text style={styles.buttonTextSmall}>{dispHoraDesde || "Toca para indicar hora (o dejar sin hora)"}</Text>
          </Pressable>
          {dispHoraDesde ? (
            <Pressable onPress={() => setDispHoraDesde("")} style={styles.linkClearWrap}>
              <Text style={styles.linkClear}>Quitar hora desde</Text>
            </Pressable>
          ) : null}
          <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Fecha hasta</Text>
          <Pressable style={styles.dateTapRow} onPress={() => setFechaModalTarget("dispHasta")}>
            <Text style={styles.dateTapValue}>{dispHasta ? displayDateLabel_(dispHasta) : "Toca para elegir fecha"}</Text>
          </Pressable>
          <Text style={[styles.sectionTitle, { marginTop: 10 }]}>Hora hasta (opcional)</Text>
          <Pressable style={styles.buttonSecondary} onPress={() => setTimeModalTarget("DH")}>
            <Text style={styles.buttonTextSmall}>{dispHoraHasta || "Toca para indicar hora (o dejar sin hora)"}</Text>
          </Pressable>
          {dispHoraHasta ? (
            <Pressable onPress={() => setDispHoraHasta("")} style={styles.linkClearWrap}>
              <Text style={styles.linkClear}>Quitar hora hasta</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.button} onPress={calcularDisponibilidades}>
            <Text style={styles.buttonTextSmall}>Comprobar disponibilidades</Text>
          </Pressable>
          {dispResult ? <Text style={[styles.message, { marginTop: 8 }]}>Resultado: {dispResult.available.length} disponibles · {dispResult.busy.length} ocupados.</Text> : null}
        </View>
      ) : null}

      {loading ? <Text style={styles.message}>Cargando...</Text> : null}

      {(vista === "SOLICITUDES" || vista === "PENDIENTES") && !loading
        ? solicitudesList.map((x) => (
            <View key={x.id_solicitud || `${x.trabajador_email}-${x.matricula}-${x.fecha_inicio}-${x.hora_inicio}`} style={styles.card}>
              <Text style={styles.sectionTitle}>{x.matricula || "Sin matrícula"} · {x.estado}</Text>
              <Text style={styles.message}>{x.trabajador_nombre || "-"}</Text>
              <Text style={styles.message}>{x.trabajador_email || "-"}</Text>
              <Text style={styles.message}>
                {displayDateLabel_(x.fecha_inicio)} {x.hora_inicio || ""} → {displayDateLabel_(x.fecha_fin)} {x.hora_fin || ""}
              </Text>
              <Text style={styles.message}>{x.motivo || "-"}</Text>
              {x.estado === "RECHAZADA" && x.motivo_rechazo ? <Text style={styles.message}>Motivo rechazo: {x.motivo_rechazo}</Text> : null}
              {allowed && x.estado === "PENDIENTE" ? (
                <View style={styles.row}>
                  <Pressable style={styles.button} onPress={() => resolver(x, "APROBADA")}>
                    <Text style={styles.buttonTextSmall}>Aprobar</Text>
                  </Pressable>
                  <Pressable
                    style={styles.buttonDanger}
                    onPress={() =>
                      setRejectModal({
                        visible: true,
                        item: x,
                        motivo: "",
                        sending: false,
                      })
                    }
                  >
                    <Text style={styles.buttonTextSmall}>Rechazar</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        : null}

      <MonthDatePickerModal
        visible={!!fechaModalTarget}
        title={dateModalTitle}
        selectedYmd={dateModalSelected}
        onPickYmd={(ymd) => {
          if (fechaModalTarget === "inicio") setFechaInicio(ymd);
          else if (fechaModalTarget === "fin") setFechaFin(ymd);
          else if (fechaModalTarget === "dispDesde") setDispDesde(ymd);
          else if (fechaModalTarget === "dispHasta") setDispHasta(ymd);
          setFechaModalTarget(null);
        }}
        onClose={() => setFechaModalTarget(null)}
      />
      <OptionalTimeModal
        visible={!!timeModalTarget}
        title={timeModalTitle}
        valueHm={timeModalValue}
        onSave={(hm) => {
          if (timeModalTarget === "HI") setHoraInicio(hm);
          else if (timeModalTarget === "HF") setHoraFin(hm);
          else if (timeModalTarget === "DD") setDispHoraDesde(hm);
          else if (timeModalTarget === "DH") setDispHoraHasta(hm);
        }}
        onClear={() => {
          if (timeModalTarget === "HI") setHoraInicio("");
          else if (timeModalTarget === "HF") setHoraFin("");
          else if (timeModalTarget === "DD") setDispHoraDesde("");
          else if (timeModalTarget === "DH") setDispHoraHasta("");
        }}
        onClose={() => setTimeModalTarget(null)}
      />

      <Modal
        visible={dayDetailModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setDayDetailModal((p) => ({ ...p, visible: false }))}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Disponibilidad {dayDetailModal.title}</Text>
            <Text style={styles.modalSub}>Disponibles: {dayDetailModal.available.length}</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {dayDetailModal.available.map((v) => (
                <Pressable
                  key={`disp-${v.matricula}`}
                  style={styles.modalPickRow}
                  onPress={() => {
                    const ymd = String(dayDetailModal.dayYmd || "").trim();
                    setDayDetailModal((p) => ({ ...p, visible: false }));
                    setVista("SOLICITUDES");
                    setMatricula(String(v.matricula || "").trim().toUpperCase());
                    if (ymd) {
                      setFechaInicio(ymd);
                      setFechaFin(ymd);
                      setHoraInicio("");
                      setHoraFin("");
                    }
                  }}
                >
                  <Text style={styles.okText}>{[v.matricula, v.marca, v.modelo].filter(Boolean).join(" · ")}</Text>
                  <Text style={styles.modalPickHint}>Toca para abrir el formulario con esta fecha</Text>
                </Pressable>
              ))}
              {dayDetailModal.available.length === 0 ? <Text style={styles.message}>Sin vehículos disponibles</Text> : null}
            </ScrollView>

            <Text style={[styles.modalSub, { marginTop: 8 }]}>Ocupados: {dayDetailModal.busy.length}</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {dayDetailModal.busy.map((v) => {
                const ov = v?.overlap;
                const hi = ov ? formatHoraMostrar_(ov.hora_inicio) : "";
                const hf = ov ? formatHoraMostrar_(ov.hora_fin) : "";
                return (
                  <Pressable
                    key={`busy-${v.matricula}-${ov?.id_solicitud || ""}`}
                    style={styles.busyBlock}
                    onPress={() =>
                      setBusyDetailModal({
                        visible: true,
                        vehicle: v,
                      })
                    }
                  >
                    <Text style={styles.warnText}>{[v.matricula, v.marca, v.modelo].filter(Boolean).join(" · ")}</Text>
                    {ov ? (
                      <>
                        <Text style={styles.messageSmall}>
                          {displayDateLabel_(String(ov.fecha_inicio || "").trim())}
                          {hi ? ` ${hi}` : ""} → {displayDateLabel_(String(ov.fecha_fin || "").trim())}
                          {hf ? ` ${hf}` : ""}
                        </Text>
                        <Text style={styles.messageSmall} numberOfLines={2}>
                          {String(ov.trabajador_nombre || "").trim() || "—"} · {String(ov.motivo || "").trim() || "—"}
                        </Text>
                      </>
                    ) : null}
                  </Pressable>
                );
              })}
              {dayDetailModal.busy.length === 0 ? <Text style={styles.message}>Sin vehículos ocupados</Text> : null}
            </ScrollView>

            <Pressable style={[styles.buttonSecondary, { marginTop: 10 }]} onPress={() => setDayDetailModal((p) => ({ ...p, visible: false }))}>
              <Text style={styles.buttonTextSmall}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dispModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setDispModal((p) => ({ ...p, visible: false }))}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Disponibilidades</Text>
            <Text style={styles.modalSub}>Rango: {dispModal.rangeLabel || "—"}</Text>
            <Text style={styles.modalSub}>Disponibles: {dispModal.available.length}</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {dispModal.available.map((v) => (
                <Pressable
                  key={`disp-r-${v.matricula}`}
                  style={styles.modalPickRow}
                  onPress={() => {
                    setDispModal((p) => ({ ...p, visible: false }));
                    setVista("SOLICITUDES");
                    setMatricula(String(v?.matricula || "").trim().toUpperCase());
                    if (dispDesde) setFechaInicio(dispDesde);
                    if (dispHasta) setFechaFin(dispHasta);
                    setHoraInicio(String(dispHoraDesde || "").trim());
                    setHoraFin(String(dispHoraHasta || "").trim());
                  }}
                >
                  <Text style={styles.okText}>{[v.matricula, v.marca, v.modelo].filter(Boolean).join(" · ")}</Text>
                  <Text style={styles.modalPickHint}>Toca para abrir formulario de solicitud con este vehículo</Text>
                </Pressable>
              ))}
              {dispModal.available.length === 0 ? <Text style={styles.message}>Sin vehículos disponibles</Text> : null}
            </ScrollView>
            <Text style={[styles.modalSub, { marginTop: 8 }]}>Ocupados: {dispModal.busy.length}</Text>
            <ScrollView style={{ maxHeight: 220 }}>
              {dispModal.busy.map((v) => {
                const ov = v?.overlap;
                const hi = ov ? formatHoraMostrar_(ov.hora_inicio) : "";
                const hf = ov ? formatHoraMostrar_(ov.hora_fin) : "";
                return (
                  <View key={`busy-r-${v.matricula}-${ov?.id_solicitud || ""}`} style={styles.busyBlock}>
                    <Text style={styles.warnText}>{[v.matricula, v.marca, v.modelo].filter(Boolean).join(" · ")}</Text>
                    {ov ? (
                      <>
                        <Text style={styles.messageSmall}>
                          Inicio: {displayDateLabel_(String(ov.fecha_inicio || "").trim())}
                          {hi ? ` · ${hi}` : ""}
                        </Text>
                        <Text style={styles.messageSmall}>
                          Fin: {displayDateLabel_(String(ov.fecha_fin || "").trim())}
                          {hf ? ` · ${hf}` : ""}
                        </Text>
                        <Text style={styles.messageSmall}>
                          Solicitante: {String(ov.trabajador_nombre || "").trim() || "—"} ({String(ov.trabajador_email || "").trim() || "—"})
                        </Text>
                        <Text style={styles.messageSmall}>Motivo: {String(ov.motivo || "").trim() || "—"}</Text>
                      </>
                    ) : (
                      <Text style={styles.messageSmall}>Sin detalle de reserva</Text>
                    )}
                  </View>
                );
              })}
              {dispModal.busy.length === 0 ? <Text style={styles.message}>Sin vehículos ocupados</Text> : null}
            </ScrollView>
            <Pressable style={[styles.buttonSecondary, { marginTop: 10 }]} onPress={() => setDispModal((p) => ({ ...p, visible: false }))}>
              <Text style={styles.buttonTextSmall}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={rejectModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectModal({ visible: false, item: null, motivo: "", sending: false })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Motivo del rechazo</Text>
            <Text style={styles.message}>
              {rejectModal.item
                ? `${rejectModal.item.matricula || "-"} · ${rejectModal.item.trabajador_nombre || rejectModal.item.trabajador_email || "-"}`
                : ""}
            </Text>
            <TextField
              label="Motivo"
              value={rejectModal.motivo}
              onChangeText={(t) => setRejectModal((p) => ({ ...p, motivo: t }))}
              placeholder="Indica por qué se rechaza"
            />
            <View style={styles.row}>
              <Pressable
                style={[styles.buttonSecondary, styles.flex1]}
                onPress={() => setRejectModal({ visible: false, item: null, motivo: "", sending: false })}
                disabled={rejectModal.sending}
              >
                <Text style={styles.buttonTextSmall}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonDanger, styles.flex1, rejectModal.sending && styles.buttonDisabled]}
                disabled={rejectModal.sending}
                onPress={async () => {
                  const motivo = String(rejectModal.motivo || "").trim();
                  if (!motivo) {
                    Alert.alert("Motivo obligatorio", "Para rechazar debes indicar el motivo.");
                    return;
                  }
                  const item = rejectModal.item;
                  setRejectModal((p) => ({ ...p, sending: true }));
                  try {
                    await resolver(item, "RECHAZADA", motivo);
                    setRejectModal({ visible: false, item: null, motivo: "", sending: false });
                  } catch (e) {
                    setRejectModal((p) => ({ ...p, sending: false }));
                  }
                }}
              >
                <Text style={styles.buttonTextSmall}>{rejectModal.sending ? "Enviando..." : "Confirmar rechazo"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={busyDetailModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setBusyDetailModal({ visible: false, vehicle: null })}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Detalle de ocupación</Text>
            <Text style={styles.modalSub}>
              {[busyDetailModal.vehicle?.matricula, busyDetailModal.vehicle?.marca, busyDetailModal.vehicle?.modelo].filter(Boolean).join(" · ") || "-"}
            </Text>
            <Text style={styles.message}>Estado reserva: {busyDetailModal.vehicle?.overlap?.estado || "-"}</Text>
            <Text style={styles.message}>
              Inicio: {displayDateLabel_(String(busyDetailModal.vehicle?.overlap?.fecha_inicio || "").trim())}
              {formatHoraMostrar_(busyDetailModal.vehicle?.overlap?.hora_inicio)
                ? ` · ${formatHoraMostrar_(busyDetailModal.vehicle?.overlap?.hora_inicio)}`
                : ""}
            </Text>
            <Text style={styles.message}>
              Fin: {displayDateLabel_(String(busyDetailModal.vehicle?.overlap?.fecha_fin || "").trim())}
              {formatHoraMostrar_(busyDetailModal.vehicle?.overlap?.hora_fin)
                ? ` · ${formatHoraMostrar_(busyDetailModal.vehicle?.overlap?.hora_fin)}`
                : ""}
            </Text>
            <Text style={styles.message}>
              Solicitante: {busyDetailModal.vehicle?.overlap?.trabajador_nombre || "-"} · {busyDetailModal.vehicle?.overlap?.trabajador_email || "-"}
            </Text>
            <Text style={styles.message}>Motivo: {busyDetailModal.vehicle?.overlap?.motivo || "-"}</Text>
            <Pressable style={[styles.buttonSecondary, { marginTop: 10 }]} onPress={() => setBusyDetailModal({ visible: false, vehicle: null })}>
              <Text style={styles.buttonTextSmall}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 26 },
  header: { alignItems: "center", marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
  backBtn: { borderColor: "#4f88bf", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 },
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 14, marginBottom: 8 },
  message: { color: theme.colors.subtext, marginBottom: 6 },
  messageSmall: { color: theme.colors.subtext, fontSize: 11, marginBottom: 3, lineHeight: 15 },
  busyBlock: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  row: { flexDirection: "row", gap: 8 },
  tabRowWrap: { flexWrap: "wrap" },
  flex1: { flex: 1 },
  button: { flex: 1, marginTop: 6, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 10 },
  buttonDanger: { flex: 1, marginTop: 6, backgroundColor: "#9a3e3e", borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: "#d06b6b" },
  buttonSecondary: { marginTop: 2, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.border },
  buttonActive: { borderColor: "#5fb7ff", borderWidth: 1 },
  tabNavButton: { paddingVertical: 6, paddingHorizontal: 4 },
  tabNavText: { color: theme.colors.text, fontWeight: "800", fontSize: 11, textAlign: "center" },
  buttonText: { color: theme.colors.text, fontWeight: "900" },
  buttonTextSmall: { color: theme.colors.text, fontWeight: "800", fontSize: 11 },
  dayPickCell: {
    width: "14.2857%",
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.card2,
  },
  dayPickSelected: { backgroundColor: "#1e4a6e", borderColor: "#5fb7ff", borderWidth: 2 },
  dayPickText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  linkClearWrap: { marginTop: 4, alignSelf: "flex-start" },
  linkClear: { color: "#8ec8ff", fontWeight: "800", fontSize: 12, textDecorationLine: "underline" },
  dateTapRow: {
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
  },
  dateTapValue: { color: theme.colors.text, fontWeight: "800", fontSize: 15 },
  weekHeader: { flexDirection: "row", marginTop: 8, marginBottom: 6 },
  weekHeaderText: { flex: 1, textAlign: "center", color: theme.colors.subtext, fontWeight: "800", fontSize: 11 },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: { width: "14.2857%", borderWidth: 1, borderColor: theme.colors.border, minHeight: 64, padding: 3 },
  dayCellVoid: { backgroundColor: "transparent", borderColor: "transparent" },
  dayBusy: { backgroundColor: "#7e2f2f" },
  dayFree: { backgroundColor: "#2e6a43" },
  dayNumber: { color: "#fff", fontWeight: "900", fontSize: 11 },
  dayDetailBusy: { color: "#ffd9d9", fontSize: 9, marginTop: 2 },
  dayDetailFree: { color: "#d9ffe5", fontSize: 9 },
  dayState: { color: "#fff", fontSize: 9, fontWeight: "800", marginTop: 6 },
  okText: { color: "#c9ffd9", fontSize: 12, marginBottom: 4 },
  warnText: { color: "#ffd0d0", fontSize: 12, marginBottom: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" },
  modalCard: { backgroundColor: theme.colors.card, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, padding: 14 },
  modalTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 6 },
  modalSub: { color: theme.colors.text, fontWeight: "800", marginBottom: 6 },
  modalPickRow: {
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#3d7a52",
    backgroundColor: "rgba(60, 120, 80, 0.2)",
  },
  modalPickHint: { color: theme.colors.subtext, fontSize: 11, marginTop: 4 },
});
