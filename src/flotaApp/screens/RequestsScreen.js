import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import { AuthContext } from "../auth/AuthContext";
import { canApproveRequests, canCancelOwnPendingRequest, canLiberateRequestRow, isGestor, isResponsable } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { theme } from "../ui/theme";
import { useResponsiveLayout } from "../ui/responsiveLayout";
import { SelectField, TextField } from "../ui/form/Fields";
import {
  enrichUseRequestsGovernance_,
  slaBadgeColors_,
} from "../lib/solicitudSla";

const IS_WEB = Platform.OS === "web";
/** Escala sobre el tamaño visual actual en web (tras patch ×2 + zoom 0.75). */
function wScale_(baseStyle, factor) {
  if (!IS_WEB || !factor || factor === 1) return null;
  const flat = StyleSheet.flatten(baseStyle) || {};
  const out = {};
  if (typeof flat.fontSize === "number") out.fontSize = flat.fontSize * factor;
  if (typeof flat.lineHeight === "number") out.lineHeight = flat.lineHeight * factor;
  return out;
}

/** Reducción −33 % respecto a la escala anterior (×2 / ×2.5 / ×1.75). */
const FS_SHRINK = 0.67;
const FS_SOL = IS_WEB ? 2 * FS_SHRINK : 1;
const FS_PEND = IS_WEB ? 2.5 * FS_SHRINK : 1;
const FS_CAL = IS_WEB ? 2.5 * FS_SHRINK : 1;
const FS_DAY = IS_WEB ? 1.75 * FS_SHRINK : 1;
const FS_DISP = IS_WEB ? 2.5 * FS_SHRINK : 1;

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Text style={[styles.title, wScale_(styles.title, FS_SOL)]}>Solicitudes de uso</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={[styles.backText, wScale_(styles.backText, FS_SOL)]}>Menú</Text>
      </Pressable>
    </View>
  );
}

function normalizeEstado_(v) {
  const s = String(v || "")
    .trim()
    .toUpperCase();
  if (
    s === "APROBADA" ||
    s === "RECHAZADA" ||
    s === "PENDIENTE" ||
    s === "CANCELADA" ||
    s === "LIBERADA"
  ) {
    return s;
  }
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
  return `${t.slice(0, max)}...`;
}

/** Alert compatible con web (window.alert) y nativo. */
function notifyUser_(title, message) {
  const t = String(title || "").trim();
  const m = String(message || "").trim();
  const text = m ? `${t}\n\n${m}` : t;
  if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(text);
    return;
  }
  Alert.alert(t || "Aviso", m || "");
}

function normalizeHeaderKey_(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Cabeceras de SOLICITUDES: mayúsculas, espacios y tildes (p. ej. "Trabajador e-mail" -> trabajador_email). */
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
    fecha_solicitud: normalizeDateToDmy_(
      String(readFieldCI_(x, "fecha_solicitud") ?? x?.fecha_solicitud ?? "").trim()
    ),
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
 * Si no hay hora: inicio = 00:00 del día; fin = 23:59:59.999 del día (para rangos "día completo").
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || "-";
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

/** Convierte dd/mm/yyyy o yyyy-mm-dd a yyyy-mm-dd para el date picker. */
function toYmdForPicker_(value) {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
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
  if (!s) return "-";
  return normalizeDateToDmy_(s) || "-";
}

/** FLOTA columna activo (p. ej. R): NO / false / 0 -> no entra en "disponibles". */
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
              <Text style={styles.tabNavText}>{"< Mes"}</Text>
            </Pressable>
            <Pressable style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton]} onPress={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
              <Text style={styles.tabNavText}>{"Mes >"}</Text>
            </Pressable>
          </View>
          <Text style={styles.monthYearTitle}>{monthLabel_(monthDate)}</Text>
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

/** Selector de rango Desde-Hasta en un solo calendario (dos toques). */
function RangeDatePickerModal({ visible, title, startYmd, endYmd, onConfirm, onClose }) {
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  useEffect(() => {
    if (!visible) return;
    const s = String(startYmd || "").trim();
    const e = String(endYmd || "").trim();
    setDraftStart(/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");
    setDraftEnd(/^\d{4}-\d{2}-\d{2}$/.test(e) ? e : "");
    const anchor = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : /^\d{4}-\d{2}-\d{2}$/.test(e) ? e : "";
    if (anchor) {
      const parts = anchor.split("-").map(Number);
      setMonthDate(new Date(parts[0], parts[1] - 1, 1));
    } else {
      const d = new Date();
      setMonthDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [visible, startYmd, endYmd]);
  const cells = useMemo(() => getMonthGrid_(monthDate), [monthDate]);
  const inRange_ = (ymd) => {
    if (!draftStart || !draftEnd) return false;
    const a = draftStart <= draftEnd ? draftStart : draftEnd;
    const b = draftStart <= draftEnd ? draftEnd : draftStart;
    return ymd >= a && ymd <= b;
  };
  const onDay_ = (ymd) => {
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(ymd);
      setDraftEnd("");
      return;
    }
    if (ymd < draftStart) {
      setDraftEnd(draftStart);
      setDraftStart(ymd);
    } else {
      setDraftEnd(ymd);
    }
  };
  const canConfirm = /^\d{4}-\d{2}-\d{2}$/.test(draftStart) && /^\d{4}-\d{2}-\d{2}$/.test(draftEnd);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalBackdropElevated}>
        <View style={[styles.modalCard, IS_WEB && styles.rangeModalCard]}>
          <Text style={[styles.modalTitle, wScale_(styles.modalTitle, FS_DISP)]}>{title || "Rango de fechas"}</Text>
          <Text style={[styles.message, wScale_(styles.message, FS_DISP), { marginBottom: 6 }]}>
            {draftStart && !draftEnd
              ? `Desde ${displayDateLabel_(draftStart)} - elige la fecha hasta`
              : draftStart && draftEnd
                ? `${displayDateLabel_(draftStart)} -> ${displayDateLabel_(draftEnd)}`
                : "Toca la fecha desde y después la fecha hasta"}
          </Text>
          <View style={styles.row}>
            <Pressable style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton]} onPress={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}>
              <Text style={[styles.tabNavText, wScale_(styles.tabNavText, FS_DISP)]}>{"< Mes"}</Text>
            </Pressable>
            <Pressable style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton]} onPress={() => setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}>
              <Text style={[styles.tabNavText, wScale_(styles.tabNavText, FS_DISP)]}>{"Mes >"}</Text>
            </Pressable>
          </View>
          <Text style={[styles.monthYearTitle, wScale_(styles.monthYearTitle, FS_DISP / 2)]}>{monthLabel_(monthDate)}</Text>
          <View style={styles.weekHeader}>
            {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
              <Text key={`rph-${d}`} style={[styles.weekHeaderText, wScale_(styles.weekHeaderText, FS_DISP / 2)]}>
                {d}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {cells.map((day, idx) => {
              if (!day) return <View key={`rpv-${idx}`} style={[styles.dayPickCell, styles.dayCellVoid]} />;
              const ymd = ymdFromParts_(monthDate.getFullYear(), monthDate.getMonth(), day);
              const isStart = draftStart === ymd;
              const isEnd = draftEnd === ymd;
              const mid = inRange_(ymd) && !isStart && !isEnd;
              return (
                <Pressable
                  key={`rpd-${idx}-${day}`}
                  style={[
                    styles.dayPickCell,
                    mid && styles.dayPickInRange,
                    (isStart || isEnd) && styles.dayPickSelected,
                  ]}
                  onPress={() => onDay_(ymd)}
                >
                  <Text style={[styles.dayPickText, wScale_(styles.dayPickText, FS_DISP / 2)]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.row, { marginTop: 12 }]}>
            <Pressable style={[styles.buttonSecondary, styles.flex1]} onPress={onClose}>
              <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, FS_DISP)]}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.flex1, !canConfirm && styles.buttonDisabled]}
              disabled={!canConfirm}
              onPress={() => {
                const a = draftStart <= draftEnd ? draftStart : draftEnd;
                const b = draftStart <= draftEnd ? draftEnd : draftStart;
                onConfirm?.(a, b);
                onClose?.();
              }}
            >
              <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, FS_DISP)]}>Aplicar rango</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Selector de hora opcional. En web DateTimePicker no pinta UI: usamos input time + HH:mm. */
function OptionalTimeModal({ visible, title, valueHm, onSave, onClear, onClose }) {
  const [draftHm, setDraftHm] = useState("09:00");
  useEffect(() => {
    if (!visible) return;
    const t = String(valueHm || "").trim();
    setDraftHm(/^\d{2}:\d{2}$/.test(t) ? t : "09:00");
  }, [visible, valueHm]);

  const applyDraftFromParts_ = (hhRaw, mmRaw) => {
    let hh = Number(String(hhRaw || "").replace(/\D/g, "").slice(0, 2));
    let mm = Number(String(mmRaw || "").replace(/\D/g, "").slice(0, 2));
    if (!Number.isFinite(hh)) hh = 0;
    if (!Number.isFinite(mm)) mm = 0;
    hh = Math.max(0, Math.min(23, hh));
    mm = Math.max(0, Math.min(59, mm));
    setDraftHm(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  };

  const hh = draftHm.slice(0, 2);
  const mm = draftHm.slice(3, 5);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.modalBackdropElevated}>
        <View style={[styles.modalCard, IS_WEB && { maxWidth: 420, width: "92%", alignSelf: "center" }]}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={[styles.message, { marginBottom: 8 }]}>Formato HH:mm (opcional). Puedes dejar sin hora.</Text>

          {IS_WEB ? (
            <View style={{ marginBottom: 12 }}>
              {React.createElement("input", {
                type: "time",
                value: draftHm,
                onChange: (e) => {
                  const next = String(e?.target?.value || "").trim();
                  if (/^\d{2}:\d{2}$/.test(next)) setDraftHm(next);
                },
                style: {
                  width: "100%",
                  boxSizing: "border-box",
                  background: theme.colors.input,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: 10,
                  color: theme.colors.text,
                  fontSize: 18,
                  fontWeight: 700,
                  padding: "12px 14px",
                  marginBottom: 10,
                },
              })}
            </View>
          ) : (
            <DateTimePicker
              value={(() => {
                const h = Number(hh) || 0;
                const m = Number(mm) || 0;
                return new Date(1970, 0, 1, h, m, 0, 0);
              })()}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, date) => {
                if (date) setDraftHm(formatTimeHmFromDate_(date));
              }}
            />
          )}

          <View style={[styles.row, { gap: 10, marginBottom: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Hora (0-23)</Text>
              <TextInput
                style={[styles.ocuparInput, { textAlign: "center", fontSize: 18 }]}
                value={hh}
                onChangeText={(t) => applyDraftFromParts_(t, mm)}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="HH"
                placeholderTextColor={theme.colors.subtext}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Minutos (0-59)</Text>
              <TextInput
                style={[styles.ocuparInput, { textAlign: "center", fontSize: 18 }]}
                value={mm}
                onChangeText={(t) => applyDraftFromParts_(hh, t)}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="mm"
                placeholderTextColor={theme.colors.subtext}
              />
            </View>
          </View>

          <Text style={[styles.message, { marginBottom: 10 }]}>Seleccionada: {draftHm}</Text>

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
                onSave(draftHm);
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
  const { user, role, syncRoleFromUsersSheet } = React.useContext(AuthContext);
  const layout = useResponsiveLayout();
  const allowed = canApproveRequests(role);
  const gestor = isGestor(role);
  const responsable = isResponsable(role);

  useFocusEffect(
    useCallback(() => {
      syncRoleFromUsersSheet?.();
    }, [syncRoleFromUsersSheet])
  );
  const [vista, setVista] = useState("SOLICITUDES");
  const [estadoFiltro, setEstadoFiltro] = useState("PENDIENTE");
  const [pendientesSubFiltro, setPendientesSubFiltro] = useState("TODAS");
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
  const [dispRangeModal, setDispRangeModal] = useState(false);
  const [solRangeModal, setSolRangeModal] = useState(false);
  const [ocuparRangeModal, setOcuparRangeModal] = useState(false);
  const [timeModalTarget, setTimeModalTarget] = useState(null);
  const [matricula, setMatricula] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [horaFin, setHoraFin] = useState("");
  const [motivo, setMotivo] = useState("");
  const [matriculas, setMatriculas] = useState([]);
  const [flotaError, setFlotaError] = useState(null);
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
  const [ocuparModal, setOcuparModal] = useState({
    visible: false,
    matricula: "",
    fechaInicio: "",
    fechaFin: "",
    horaInicio: "",
    horaFin: "",
    motivo: "",
    usuarioEmail: "",
    usuarioNombre: "",
    sending: false,
    error: "",
  });
  const [usuariosCatalog, setUsuariosCatalog] = useState([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState({ visible: false, item: null, motivo: "", sending: false });
  const [liberateModal, setLiberateModal] = useState({
    visible: false,
    item: null,
    fechaInicio: "",
    fechaFin: "",
    motivo: "",
    sending: false,
  });

  const filtered = useMemo(() => {
    const me = String(user?.email || "").trim().toLowerCase();
    const scoped = !allowed && me
      ? items.filter((x) => String(x?.trabajador_email || "").trim().toLowerCase() === me)
      : items;
    const q = String(query || "").trim().toLowerCase();
    const byEstado = scoped.filter((x) => (estadoFiltro ? x.estado === estadoFiltro : true));
    if (!q) return byEstado;
    return byEstado.filter((x) => `${x.matricula} ${x.trabajador_email} ${x.motivo}`.toLowerCase().includes(q));
  }, [items, query, estadoFiltro, allowed, user?.email]);

  const pendingApprovalList = useMemo(() => {
    return items.filter((x) => x.actionableForViewer && x.estado === "PENDIENTE");
  }, [items]);

  const pendingFiltered = useMemo(() => {
    let list = pendingApprovalList;
    if (gestor && vista === "PENDIENTES") {
      if (pendientesSubFiltro === "RETRASADAS") {
        list = list.filter((x) => x.sla?.level === "warn" || x.sla?.level === "critical");
      } else if (pendientesSubFiltro === "SIN_RESPONSABLE") {
        list = list.filter((x) => !x.vehicleHasActiveApprover);
      } else if (pendientesSubFiltro === "ESCALADO") {
        list = list.filter((x) => x.needsGestorEscalation);
      }
    }
    const q = String(query || "").trim().toLowerCase();
    if (!q) return list;
    return list.filter((x) => `${x.matricula} ${x.trabajador_email} ${x.motivo}`.toLowerCase().includes(q));
  }, [pendingApprovalList, query, gestor, vista, pendientesSubFiltro]);

  const vehiclesCatalogActiva = useMemo(() => {
    const list = Array.isArray(vehiclesCatalog) ? vehiclesCatalog : [];
    const activas = list.filter(flotaVehiculoEstaActivo_);
    // Si no hay activas (p.ej. todos marcados como NO), devolver todas para no dejar el selector vacío.
    return activas.length > 0 ? activas : list;
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

  const occupyDraftRange = useMemo(() => {
    const a = String(ocuparModal?.fechaInicio || "").trim();
    const b = String(ocuparModal?.fechaFin || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
    return a <= b ? { start: a, end: b } : { start: b, end: a };
  }, [ocuparModal?.fechaInicio, ocuparModal?.fechaFin]);

  const loadFlota = async () => {
    setFlotaError(null);
    try {
      const flotaRes = await sheetsApi.get("flota_list", { user_email: user?.email || "" });
      const raw = Array.isArray(flotaRes?.data) ? flotaRes.data : Array.isArray(flotaRes) ? flotaRes : [];
      const catalog = raw
        .map((v) => ({
          matricula: String(v?.matricula || "").trim().toUpperCase(),
          marca: String(v?.marca || "").trim(),
          modelo: String(v?.modelo || "").trim(),
          activo: String(v?.activo ?? "SI").trim(),
          responsable: String(v?.responsable || "").trim(),
          email_responsable: String(v?.["e-mail_de_notificaciones"] || v?.email_de_notificaciones || "").trim(),
          telefono: String(v?.telefono || v?.tel || "").trim(),
        }))
        .filter((x) => x.matricula);
      const seen = new Set();
      const uniqCatalog = catalog.filter((x) => {
        if (seen.has(x.matricula)) return false;
        seen.add(x.matricula);
        return true;
      });
      setVehiclesCatalog(uniqCatalog);
      const mats = raw.map((v) => String(v?.matricula || "").trim().toUpperCase()).filter(Boolean);
      setMatriculas(Array.from(new Set(mats)).sort());
      return raw;
    } catch (flotaErr) {
      const errMsg = flotaErr?.message || String(flotaErr);
      console.warn("[RequestsScreen] flota_list error:", errMsg);
      setFlotaError(errMsg);
      setMatriculas([]);
      return [];
    }
  };

  const load = async () => {
    setLoading(true);
    setFlotaError(null);
    try {
      let assignedNow = new Set();
      let flota = [];
      let usuarios = [];
      // Cargamos flota y solicitudes en paralelo - si flota falla, las solicitudes siguen cargando.
      const [flotaResult] = await Promise.allSettled([loadFlota()]);
      flota = flotaResult.status === "fulfilled" ? (flotaResult.value || []) : [];
      if (allowed) {
        try {
          const usuRes = await sheetsApi.usuariosAprobadoresUsoList(user?.email || "");
          usuarios = Array.isArray(usuRes?.data) ? usuRes.data : Array.isArray(usuRes) ? usuRes : [];
        } catch {
          // Fallback: no marcar falso "sin responsable" si el propio viewer puede aprobar.
          const me = String(user?.email || "").trim().toLowerCase();
          usuarios =
            me && (responsable || gestor)
              ? [{ email: me, rol: String(role || "").trim().toUpperCase(), activo: "SI" }]
              : [];
        }
      }
      if (responsable && !gestor) {
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
        trabajador_email: allowed ? "" : String(user?.email || "").trim().toLowerCase(),
        user_email: user?.email || "",
      });
      const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      const parsed = rows.map(parseItem_);
      const enriched = enrichUseRequestsGovernance_(parsed, {
        flota,
        usuarios,
        viewerEmail: user?.email || "",
        viewerRole: role || "",
      });
      setItems(enriched);
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudieron cargar solicitudes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [user?.email, responsable, gestor, allowed, role]);

  // Si flota falló (timeout), reintenta automáticamente una vez tras 6 segundos.
  useEffect(() => {
    if (!flotaError || vehiclesCatalog.length > 0) return;
    const t = setTimeout(() => {
      console.log("[RequestsScreen] Reintentando flota_list automáticamente...");
      loadFlota();
    }, 6000);
    return () => clearTimeout(t);
  }, [flotaError]);

  const cargarUsuariosParaOcupar = async () => {
    if (usuariosCatalog.length > 0) return;
    try {
      const res = await sheetsApi.get("usuarios_list", { user_email: user?.email || "" });
      const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      const activos = rows
        .filter((u) => String(u?.activo ?? "SI").trim().toUpperCase() === "SI")
        .map((u) => ({
          email: String(u?.email || "").trim().toLowerCase(),
          nombre: String(u?.nombre || u?.name || "").trim(),
          rol: String(u?.rol || "").trim(),
        }))
        .filter((u) => u.email);
      setUsuariosCatalog(activos);
    } catch {
      // No bloquear si falla - el campo de texto libre sigue disponible.
    }
  };

  const abrirOcuparModal = (params = {}) => {
    if (!gestor) {
      notifyUser_("Solo GESTOR", "Solo el rol GESTOR puede grabar ocupaciones directas.");
      return;
    }
    setOcuparModal({
      visible: true,
      matricula: params.matricula || "",
      fechaInicio: params.fechaInicio || "",
      fechaFin: params.fechaFin || "",
      horaInicio: "",
      horaFin: "",
      motivo: "",
      usuarioEmail: "",
      usuarioNombre: "",
      sending: false,
      error: "",
    });
    cargarUsuariosParaOcupar();
  };

  const ocuparDirecto = async () => {
    const { matricula: mat, fechaInicio: fiRaw, fechaFin: ffRaw, horaInicio: hi, horaFin: hf, motivo: mot, usuarioEmail, usuarioNombre } = ocuparModal;
    if (!mat || !fiRaw || !ffRaw || !mot) {
      setOcuparModal((p) => ({ ...p, error: "Completa matricula, fechas y motivo." }));
      return;
    }
    const fi = toDmyForPayload_(fiRaw);
    const ff = toDmyForPayload_(ffRaw);
    if (!fi || !ff) {
      setOcuparModal((p) => ({ ...p, error: "Fechas invalidas. Usa el calendario de rango." }));
      return;
    }
    let hiOut = String(hi || "").trim();
    let hfOut = String(hf || "").trim();
    if (hiOut && !/^\d{2}:\d{2}$/.test(hiOut)) {
      setOcuparModal((p) => ({ ...p, error: "Hora inicio: usa HH:mm o déjala vacía." }));
      return;
    }
    if (hfOut && !/^\d{2}:\d{2}$/.test(hfOut)) {
      setOcuparModal((p) => ({ ...p, error: "Hora fin: usa HH:mm o déjala vacía." }));
      return;
    }
    // Horas opcionales: si faltan, normalizar a día completo.
    if (!hiOut && !hfOut) {
      hiOut = "00:00";
      hfOut = "23:59";
    } else {
      if (!hiOut) hiOut = "00:00";
      if (!hfOut) hfOut = "23:59";
    }
    // Si no se seleccionó usuario, el conductor es el gestor/responsable que marca
    const conductorEmail = usuarioEmail || user?.email || "";
    const conductorNombre = usuarioNombre || user?.displayName || "";
    setOcuparModal((p) => ({ ...p, sending: true, error: "" }));
    try {
      await sheetsApi.post("solicitud_ocupar", {
        matricula: mat.trim().toUpperCase(),
        trabajador_email: conductorEmail,
        trabajador_nombre: conductorNombre,
        fecha_inicio: fi,
        fecha_fin: ff,
        fecha_desde: fi,
        fecha_hasta: ff,
        hora_inicio: hiOut,
        hora_fin: hfOut,
        motivo: mot,
        resuelto_por_email: user?.email || "",
        user_email: user?.email || "",
      });
      setOcuparModal({ visible: false, matricula: "", fechaInicio: "", fechaFin: "", horaInicio: "", horaFin: "", motivo: "", usuarioEmail: "", usuarioNombre: "", sending: false, error: "" });
      Alert.alert("Ocupación registrada", `${mat.trim().toUpperCase()} marcado como ocupado${conductorNombre ? ` · ${conductorNombre}` : ""}.`);
      load();
    } catch (err) {
      setOcuparModal((p) => ({ ...p, sending: false, error: String(err?.message || err) }));
    }
  };

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
        `Ya hay una solicitud ${tipo} para ${mat} que solapa con el periodo elegido (${String(solape.fecha_inicio || "").trim()}${hi ? ` ${hi}` : ""} -> ${String(solape.fecha_fin || "").trim()}${hf ? ` ${hf}` : ""}). Cambia fechas, horas o matrícula.`
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
            `Ya existe una solicitud APROBADA para ${currentMat} en ese rango (${conflict.fecha_inicio || "-"} ${conflict.hora_inicio || ""} -> ${conflict.fecha_fin || "-"} ${conflict.hora_fin || ""})`
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
          : `Correo al solicitante NO enviado.\n\n${avSol || "sin detalle"}\n\nDestino intentado: ${destSol || "-"}`
      );
      await load();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo resolver la solicitud.");
    }
  };

  const openLiberateModal_ = (item) => {
    setLiberateModal({
      visible: true,
      item,
      fechaInicio: String(item?.fecha_inicio || "").trim(),
      fechaFin: String(item?.fecha_fin || "").trim(),
      motivo: "Liberación de reserva",
      sending: false,
    });
  };

  const confirmarLiberacion_ = async () => {
    if (liberateModal.sending) return;
    const item = liberateModal.item;
    if (!item?.id_solicitud) {
      notifyUser_("Error", "No hay solicitud seleccionada.");
      return;
    }
    if (!canLiberateRequestRow(item, user?.email, role, assignedSet)) {
      notifyUser_("Permisos insuficientes", "No puedes liberar esta reserva.");
      return;
    }
    const fi = String(liberateModal.fechaInicio || "").trim();
    const ff = String(liberateModal.fechaFin || "").trim();
    if (!fi || !ff) {
      notifyUser_("Fechas obligatorias", "Indica el rango a liberar (solo fechas, dd/mm/aaaa).");
      return;
    }
    try {
      setLiberateModal((p) => ({ ...p, sending: true }));
      const res = await sheetsApi.liberacionCrear(
        {
          id_solicitud: item.id_solicitud,
          fecha_inicio_liberacion: toDmyForPayload_(fi),
          fecha_fin_liberacion: toDmyForPayload_(ff),
          hora_inicio_liberacion: "",
          hora_fin_liberacion: "",
          motivo: String(liberateModal.motivo || "").trim() || "Liberación de reserva",
        },
        user?.email || ""
      );
      const dr = solicitudServerData_(res);
      const estadoFinal = String(dr.estado_final_solicitud_original || "").trim().toUpperCase();
      setLiberateModal({
        visible: false,
        item: null,
        fechaInicio: "",
        fechaFin: "",
        motivo: "",
        sending: false,
      });
      notifyUser_(
        "Reserva liberada",
        estadoFinal === "LIBERADA"
          ? "Liberación total: el vehículo queda libre en ese rango de fechas."
          : "Liberación parcial aplicada: se ajustaron los tramos que siguen ocupados."
      );
      await load();
    } catch (e) {
      setLiberateModal((p) => ({ ...p, sending: false }));
      notifyUser_("Error al liberar", e?.message || "No se pudo liberar la reserva.");
    }
  };

  const cancelarPropia_ = async (item) => {
    if (!canCancelOwnPendingRequest(item, user?.email)) {
      notifyUser_("Permisos insuficientes", "Solo puedes retirar tus solicitudes PENDIENTE.");
      return;
    }
    const ask =
      Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm("Retirar solicitud\n\nCancelar esta solicitud pendiente?")
        : null;
    const runCancel_ = async () => {
      try {
        await sheetsApi.cancelarSolicitud(item.id_solicitud, user?.email || "");
        notifyUser_("Retirada", "Solicitud cancelada.");
        await load();
      } catch (e) {
        notifyUser_("Error", e?.message || "No se pudo cancelar.");
      }
    };
    if (Platform.OS === "web") {
      if (ask) await runCancel_();
      return;
    }
    Alert.alert("Retirar solicitud", "Cancelar esta solicitud pendiente?", [
      { text: "No", style: "cancel" },
      {
        text: "Si, retirar",
        style: "destructive",
        onPress: () => {
          runCancel_();
        },
      },
    ]);
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
      rangeLabel: `${displayDateLabel_(next.from)} ${next.fromHour || ""} -> ${displayDateLabel_(next.to)} ${next.toHour || ""}`.trim(),
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
            : fechaModalTarget === "libIni"
              ? "Liberación · fecha inicio"
              : fechaModalTarget === "libFin"
                ? "Liberación · fecha fin"
                : fechaModalTarget === "ocuparInicio"
                  ? "Ocupación · fecha inicio"
                  : fechaModalTarget === "ocuparFin"
                    ? "Ocupación · fecha fin"
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
            : fechaModalTarget === "libIni"
              ? toYmdForPicker_(liberateModal.fechaInicio)
              : fechaModalTarget === "libFin"
                ? toYmdForPicker_(liberateModal.fechaFin)
                : fechaModalTarget === "ocuparInicio"
                  ? ocuparModal.fechaInicio
                  : fechaModalTarget === "ocuparFin"
                    ? ocuparModal.fechaFin
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
            : timeModalTarget === "LIB_HI"
              ? "Liberación · hora inicio"
              : timeModalTarget === "LIB_HF"
                ? "Liberación · hora fin"
                : timeModalTarget === "OC_HI"
                  ? "Ocupación · hora inicio"
                  : timeModalTarget === "OC_HF"
                    ? "Ocupación · hora fin"
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
            : timeModalTarget === "LIB_HI"
              ? liberateModal.horaInicio
              : timeModalTarget === "LIB_HF"
                ? liberateModal.horaFin
                : timeModalTarget === "OC_HI"
                  ? ocuparModal.horaInicio
                  : timeModalTarget === "OC_HF"
                    ? ocuparModal.horaFin
                    : "";

  const solicitudesList = vista === "PENDIENTES" ? pendingFiltered : filtered;

  const canGrabarOcupacion = isGestor(role);
  const renderDisponibleVehicleCard_ = (v, fs, opts = {}) => {
    const mat = String(v?.matricula || "").trim().toUpperCase();
    const marca = String(v?.marca || "").trim();
    const modelo = String(v?.modelo || "").trim();
    const lineaVehiculo = [mat, marca, modelo].filter(Boolean).join(" · ");
    const respNombre = String(v?.responsable || "").trim();
    const respMail = String(v?.email_responsable || "").trim();
    const respTel = String(v?.telefono || "").trim();
    return (
      <View key={opts.key || `disp-card-${mat}`} style={styles.dispVehicleCard}>
        <Text style={[styles.dispVehicleTitle, wScale_(styles.okText, fs)]} numberOfLines={1}>
          {lineaVehiculo || mat || "-"}
        </Text>
        <Text style={[styles.modalRespText, wScale_(styles.modalRespText, fs)]} numberOfLines={1}>
          Responsable: {respNombre || "-"}
        </Text>
        <Text style={[styles.modalRespText, wScale_(styles.modalRespText, fs)]} numberOfLines={1}>
          Correo: {respMail || "-"}
        </Text>
        <Text style={[styles.modalRespText, wScale_(styles.modalRespText, fs)]} numberOfLines={1}>
          Telefono: {respTel || "-"}
        </Text>
        <View style={styles.dispCardActions}>
          <Pressable style={[styles.button, styles.dispCardActionBtn]} onPress={opts.onSolicitud}>
            <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, fs)]} numberOfLines={1}>Abrir solicitud</Text>
          </Pressable>
          {canGrabarOcupacion ? (
            <Pressable style={[styles.dispOcuparBtn, styles.dispCardActionBtn]} onPress={opts.onOcupar}>
              <Text style={[styles.ocuparBtnText, wScale_(styles.ocuparBtnText, fs)]} numberOfLines={1}>Generar ocupacion</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={layout.contentContainerStyle}>
      <Header onBack={() => navigation.navigate("Menu")} />
      <View style={styles.card}>
        <Text style={[styles.sectionTitle, wScale_(styles.sectionTitle, vista === "PENDIENTES" ? FS_PEND : vista === "CALENDARIO" ? FS_CAL : vista === "DISPONIBILIDADES" ? FS_DISP : FS_SOL)]}>Vista</Text>
        <View style={[styles.row, styles.tabRowWrap]}>
          <Pressable
            style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton, vista === "SOLICITUDES" && styles.buttonActive]}
            onPress={() => setVista("SOLICITUDES")}
          >
            <Text style={[styles.tabNavText, wScale_(styles.tabNavText, vista === "SOLICITUDES" ? FS_SOL : vista === "PENDIENTES" ? FS_PEND : vista === "CALENDARIO" ? FS_CAL : FS_DISP)]}>Solicitudes</Text>
          </Pressable>
          {allowed ? (
            <Pressable
              style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton, vista === "PENDIENTES" && styles.buttonActive]}
              onPress={() => setVista("PENDIENTES")}
            >
              <Text style={[styles.tabNavText, wScale_(styles.tabNavText, vista === "PENDIENTES" ? FS_PEND : FS_SOL)]}>Pendientes</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton, vista === "CALENDARIO" && styles.buttonActive]}
            onPress={() => setVista("CALENDARIO")}
          >
            <Text style={[styles.tabNavText, wScale_(styles.tabNavText, vista === "CALENDARIO" ? FS_CAL : FS_SOL)]}>Calendario</Text>
          </Pressable>
          <Pressable
            style={[styles.buttonSecondary, styles.flex1, styles.tabNavButton, vista === "DISPONIBILIDADES" && styles.buttonActive]}
            onPress={() => setVista("DISPONIBILIDADES")}
          >
            <Text style={[styles.tabNavText, wScale_(styles.tabNavText, vista === "DISPONIBILIDADES" ? FS_DISP : FS_SOL)]}>Disponibilidades</Text>
          </Pressable>
        </View>
      </View>
      {flotaError ? (
        <View style={[styles.card, { borderColor: "#d06b6b" }]}>
          <Text style={[styles.message, { color: "#ffd0d0", marginBottom: 6 }]}>
            [!] No se pudo cargar el catálogo de vehículos: {flotaError}
          </Text>
          <Pressable style={styles.buttonSecondary} onPress={load}>
            <Text style={styles.buttonTextSmall}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}
      {vista === "SOLICITUDES" ? (
        <>
          <View style={styles.card}>
            <Text style={[styles.sectionTitle, wScale_(styles.sectionTitle, FS_SOL)]}>Formulario de solicitud</Text>
            {/* Matrícula - etiqueta + selector estrecho en la misma fila */}
            <View style={[styles.inlineLabelRow, layout.inlineLabelRowNative && styles.inlineLabelRowStack]}>
              <Text style={[styles.inlineLabel, wScale_(styles.inlineLabel, FS_SOL)]}>Matrícula</Text>
              <View style={layout.matriculaFieldStyle}>
                <SelectField
                  textScale={FS_SOL}
                  value={matricula}
                  onChange={setMatricula}
                  options={[
                    { value: "", label: "Selecciona..." },
                    ...vehiclesCatalogActiva.map((v) => ({
                      value: String(v?.matricula || "").trim().toUpperCase(),
                      label: [String(v?.matricula || "").trim().toUpperCase(), v?.marca, v?.modelo].filter(Boolean).join(" · "),
                    })),
                  ]}
                />
              </View>
              {/* Responsable del vehículo seleccionado */}
              {matricula ? (() => {
                const veh = vehiclesCatalog.find((v) => v.matricula === matricula);
                if (!veh) return null;
                const parts = [veh.responsable, veh.email_responsable, veh.telefono].filter(Boolean);
                if (!parts.length) return null;
                return (
                  <Text style={[styles.responsableInfo, wScale_(styles.responsableInfo, FS_SOL)]} numberOfLines={2}>{parts.join(" · ")}</Text>
                );
              })() : null}
            </View>
            {/* Rango de fechas en un solo calendario + horas */}
            <View style={styles.inlineLabelRow}>
              <Text style={[styles.inlineLabel, wScale_(styles.inlineLabel, FS_SOL)]}>Fechas</Text>
              <Pressable style={[styles.dateTapRow, styles.solDateNarrow]} onPress={() => setSolRangeModal(true)}>
                <Text style={[styles.dateTapValue, wScale_(styles.dateTapValue, FS_SOL)]}>
                  {fechaInicio && fechaFin
                    ? `${displayDateLabel_(fechaInicio)} -> ${displayDateLabel_(fechaFin)}`
                    : "Desde / hasta (mismo calendario)"}
                </Text>
              </Pressable>
            </View>
            <View style={styles.inlineLabelRow}>
              <Text style={[styles.inlineLabel, wScale_(styles.inlineLabel, FS_SOL)]}>Horas</Text>
              <View style={[styles.dateTimeRow, styles.solHoursNarrowRow]}>
                <View style={styles.solTimeGroup}>
                  <Pressable style={[styles.timeTapBtn, styles.solTimeNarrow, horaInicio ? styles.timeTapBtnSet : null]} onPress={() => setTimeModalTarget("HI")}>
                    <Text style={[styles.dateTapValue, wScale_(styles.dateTapValue, FS_SOL)]}>{horaInicio || "Hora inicio"}</Text>
                  </Pressable>
                  {horaInicio ? (
                    <Pressable onPress={() => setHoraInicio("")} style={styles.timeClearBtn}>
                      <Text style={[styles.timeClearText, wScale_(styles.timeClearText, FS_SOL)]}>X</Text>
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.solTimeGroup}>
                  <Pressable style={[styles.timeTapBtn, styles.solTimeNarrow, horaFin ? styles.timeTapBtnSet : null]} onPress={() => setTimeModalTarget("HF")}>
                    <Text style={[styles.dateTapValue, wScale_(styles.dateTapValue, FS_SOL)]}>{horaFin || "Hora fin"}</Text>
                  </Pressable>
                  {horaFin ? (
                    <Pressable onPress={() => setHoraFin("")} style={styles.timeClearBtn}>
                      <Text style={[styles.timeClearText, wScale_(styles.timeClearText, FS_SOL)]}>X</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
            {/* Motivo */}
            <View style={styles.inlineLabelRow}>
              <Text style={[styles.inlineLabel, wScale_(styles.inlineLabel, FS_SOL)]}>Motivo</Text>
              <View style={styles.inlineFieldWrap}>
                <TextField textScale={FS_SOL} value={motivo} onChangeText={setMotivo} placeholder="Describe el uso previsto" />
              </View>
            </View>
            <View style={styles.solActionsRow}>
              <Pressable style={[styles.button, styles.solActionBtn, creating && { opacity: 0.7 }]} onPress={crearSolicitud} disabled={creating}>
                <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, FS_SOL)]}>{creating ? "Enviando..." : "Crear solicitud"}</Text>
              </Pressable>
              <Pressable style={[styles.buttonSecondary, styles.solActionBtn, { marginTop: 0 }]} onPress={load}>
                <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, FS_SOL)]}>Recargar</Text>
              </Pressable>
            </View>
            {!allowed ? (
              <Text style={[styles.message, wScale_(styles.message, FS_SOL), { marginTop: 8 }]}>
                Tu rol puede crear solicitudes. La aprobación o rechazo corresponde al responsable del vehículo (rol RESPONSABLE en USUARIOS y vínculo en FLOTA); el GESTOR puede tener permiso extra según el servidor.
              </Text>
            ) : null}
          </View>

        <View style={styles.card}>
          <View style={styles.estadoBuscarRow}>
            <View style={styles.estadoBuscarField}>
              <SelectField
                textScale={FS_SOL}
                label="Estado"
                value={estadoFiltro}
                onChange={setEstadoFiltro}
                options={[
                  { value: "PENDIENTE", label: "PENDIENTE" },
                  { value: "APROBADA", label: "APROBADA" },
                  { value: "RECHAZADA", label: "RECHAZADA" },
                  { value: "CANCELADA", label: "CANCELADA" },
                  { value: "LIBERADA", label: "LIBERADA" },
                ]}
              />
            </View>
            <View style={styles.estadoBuscarField}>
              <TextField textScale={FS_SOL} label="Buscar" value={query} onChangeText={setQuery} placeholder="matrícula, email o motivo" />
            </View>
          </View>
        </View>
        </>
      ) : null}
      {vista === "PENDIENTES" && allowed ? (
        <View style={styles.card}>
          <Text style={[styles.sectionTitle, wScale_(styles.sectionTitle, FS_PEND)]}>Pendientes de aprobación</Text>
          <Text style={[styles.message, wScale_(styles.message, FS_PEND)]}>
            Solo solicitudes en estado PENDIENTE que el servidor te asigna: si eres RESPONSABLE (en USUARIOS), las de vehículos a tu cargo en FLOTA; si eres GESTOR, todas las pendientes del listado cargado.
            {gestor ? ' Las etiquetas naranja (+24h) y roja (+48h) marcan retraso SLA; "Escalado" indica sin responsable activo o mas de 48h.' : ''}
          </Text>
          {gestor ? (
            <>
              <Text style={[styles.sectionTitle, wScale_(styles.sectionTitle, FS_PEND), { marginTop: 6 }]}>Filtro gestor</Text>
              <View style={[styles.row, styles.pendFiltroRow]}>
                {[
                  { key: "TODAS", label: "Todas" },
                  { key: "RETRASADAS", label: "Retrasadas (+24h)" },
                  { key: "SIN_RESPONSABLE", label: "Sin responsable activo" },
                  { key: "ESCALADO", label: "Escalado" },
                ].map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[
                      styles.buttonSecondary,
                      styles.pendFiltroBtn,
                      pendientesSubFiltro === opt.key && styles.buttonActive,
                    ]}
                    onPress={() => setPendientesSubFiltro(opt.key)}
                  >
                    <Text style={[styles.subFiltroTabText, wScale_(styles.subFiltroTabText, FS_PEND)]} numberOfLines={2}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <View style={styles.estadoBuscarRow}>
            <View style={styles.estadoBuscarField}>
              <TextField textScale={FS_PEND} label="Buscar" value={query} onChangeText={setQuery} placeholder="matrícula, email o motivo" />
            </View>
            <Pressable style={[styles.buttonSecondary, styles.pendRecargarBtn]} onPress={load}>
              <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, FS_PEND)]}>Recargar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {vista === "CALENDARIO" ? (
        <View style={styles.card}>
          <Text style={[styles.sectionTitle, wScale_(styles.sectionTitle, FS_CAL)]}>Calendario de uso (almanaque)</Text>
          <View style={[styles.calendarControlRow, layout.isNative && styles.calendarControlRowNative]}>
            <Text style={[styles.inlineLabel, styles.calVehiculoLabel, wScale_(styles.inlineLabel, FS_CAL)]}>Vehículo</Text>
            <View style={[layout.calVehiculoStyle, IS_WEB && styles.calVehiculoWider, styles.calVehiculoInputWrap]}>
              <SelectField
                textScale={FS_CAL}
                value={vehiculoFiltro}
                onChange={setVehiculoFiltro}
                options={[
                  { value: "TODOS", label: "Todos los vehículos" },
                  ...vehiclesCatalog.map((x) => ({
                    value: x.matricula,
                    label: [x.matricula, x.marca, x.modelo].filter(Boolean).join(" · "),
                  })),
                ]}
              />
            </View>
            {vehiculoFiltro && vehiculoFiltro !== "TODOS" ? (() => {
              const veh = vehiclesCatalog.find((v) => v.matricula === vehiculoFiltro);
              if (!veh) return null;
              const parts = [veh.responsable, veh.email_responsable, veh.telefono].filter(Boolean);
              if (!parts.length) return null;
              return <Text style={[styles.responsableInfo, wScale_(styles.responsableInfo, FS_CAL)]} numberOfLines={2}>{parts.join(" · ")}</Text>;
            })() : null}
            <View style={[styles.mesBtnsRow, layout.isNative && styles.mesBtnsRowNative]}>
              <Pressable
                style={styles.mesBtn}
                onPress={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              >
                <Text style={[styles.buttonText, wScale_(styles.buttonText, FS_CAL)]}>{"< Mes anterior"}</Text>
              </Pressable>
              <Pressable
                style={styles.mesBtn}
                onPress={() => setMonthCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              >
                <Text style={[styles.buttonText, wScale_(styles.buttonText, FS_CAL)]}>{"Mes siguiente >"}</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.monthYearTitle}>{monthLabel_(monthCursor)}</Text>
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
              const dayYmdCell = ymdFromParts_(monthCursor.getFullYear(), monthCursor.getMonth(), day);
              const inOccupyDraft =
                !!occupyDraftRange &&
                dayYmdCell >= occupyDraftRange.start &&
                dayYmdCell <= occupyDraftRange.end;
              return (
                <Pressable
                  key={`day-${day}`}
                  style={[styles.dayCell, isBusy ? styles.dayBusy : styles.dayFree, inOccupyDraft && styles.dayOccupyDraft]}
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
                  <>
                    <Text style={styles.dayDetailFree}>Disponibles: {vehiculoFiltro === "TODOS" ? stat.free : (isBusy ? 0 : 1)}</Text>
                    <Text style={styles.dayDetailBusy}>Ocupados: {vehiculoFiltro === "TODOS" ? stat.used : (isBusy ? 1 : 0)}</Text>
                  </>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.message, wScale_(styles.message, FS_CAL), { marginTop: 10 }]}>
            Leyenda: <Text style={{ color: "#ffd0d0" }}>rojo = en uso</Text> · <Text style={{ color: "#c9ffd9" }}>verde = libre</Text>
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
            <Pressable style={[styles.buttonSecondary, { flex: 1 }]} onPress={load}>
              <Text style={[styles.buttonText, wScale_(styles.buttonText, FS_CAL)]}>Recargar</Text>
            </Pressable>
            {gestor ? (
              <Pressable style={[styles.ocuparBtn, { flex: 1, paddingVertical: 10, alignSelf: undefined }]} onPress={() => abrirOcuparModal({ matricula: vehiculoFiltro !== "TODOS" ? vehiculoFiltro : "" })}>
                <Text style={[styles.ocuparBtnText, wScale_(styles.ocuparBtnText, FS_CAL)]}>+ Marcar ocupado</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : vista === "DISPONIBILIDADES" ? (
        <View style={styles.card}>
          <Text style={[styles.sectionTitle, wScale_(styles.sectionTitle, FS_DISP)]}>Disponibilidades</Text>
          <Text style={[styles.message, wScale_(styles.message, FS_DISP)]}>
            Solo se listan como disponibles vehículos con activo distinto de NO en FLOTA. Los ocupados muestran datos de la reserva aprobada.
          </Text>
          <View style={{ backgroundColor: "#1e3a2f", borderRadius: 8, padding: 10, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: "#4caf50" }}>
            <Text style={[styles.message, wScale_(styles.message, FS_DISP), { color: "#a8d5b5", marginBottom: 4, fontWeight: "bold" }]}>
              ¿Cómo liberar el uso de un vehículo?
            </Text>
            <Text style={[styles.message, wScale_(styles.message, FS_DISP), { color: "#c8e6c9", marginBottom: 0 }]}>
              {'1. Selecciona el rango de fechas (Desde / Hasta) y pulsa Consultar disponibilidad.\n'
               + '2. Localiza el vehículo que quieres liberar - aparecerá en rojo si está ocupado.\n'
               + '3. Pulsa Liberar junto a ese vehículo e indica las fechas en que lo liberas.\n'
               + '4. Confirma: el sistema cancelará la reserva en ese tramo y el vehículo quedará disponible de nuevo.'}
            </Text>
          </View>
          <View style={styles.inlineLabelRow}>
            <Text style={[styles.inlineLabel, wScale_(styles.inlineLabel, FS_DISP)]}>Fechas</Text>
            <Pressable style={[styles.dateTapRow, styles.dispRangeTap]} onPress={() => setDispRangeModal(true)}>
              <Text style={[styles.dateTapValue, wScale_(styles.dateTapValue, FS_DISP)]}>
                {dispDesde && dispHasta
                  ? `${displayDateLabel_(dispDesde)} -> ${displayDateLabel_(dispHasta)}`
                  : "Elegir desde / hasta (mismo calendario)"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.inlineLabelRow}>
            <Text style={[styles.inlineLabel, wScale_(styles.inlineLabel, FS_DISP)]}>Horas</Text>
            <View style={[styles.dateTimeRow, styles.dispHoursRow]}>
              <Pressable style={[styles.timeTapBtn, styles.dispTimeTap, dispHoraDesde ? styles.timeTapBtnSet : null]} onPress={() => setTimeModalTarget("DD")}>
                <Text style={[styles.dateTapValue, wScale_(styles.dateTapValue, FS_DISP)]}>{dispHoraDesde || "Hora desde"}</Text>
              </Pressable>
              {dispHoraDesde ? (
                <Pressable onPress={() => setDispHoraDesde("")} style={styles.timeClearBtn}>
                  <Text style={[styles.timeClearText, wScale_(styles.timeClearText, FS_DISP)]}>X</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.timeTapBtn, styles.dispTimeTap, dispHoraHasta ? styles.timeTapBtnSet : null]} onPress={() => setTimeModalTarget("DH")}>
                <Text style={[styles.dateTapValue, wScale_(styles.dateTapValue, FS_DISP)]}>{dispHoraHasta || "Hora hasta"}</Text>
              </Pressable>
              {dispHoraHasta ? (
                <Pressable onPress={() => setDispHoraHasta("")} style={styles.timeClearBtn}>
                  <Text style={[styles.timeClearText, wScale_(styles.timeClearText, FS_DISP)]}>X</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <Pressable style={styles.button} onPress={calcularDisponibilidades}>
            <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, FS_DISP)]}>Comprobar disponibilidades</Text>
          </Pressable>
          {dispResult ? <Text style={[styles.message, wScale_(styles.message, FS_DISP), { marginTop: 8 }]}>Resultado: {dispResult.available.length} disponibles · {dispResult.busy.length} ocupados.</Text> : null}
        </View>
      ) : null}

      {loading ? <Text style={styles.message}>Cargando...</Text> : null}

      {(vista === "SOLICITUDES" || vista === "PENDIENTES") && !loading
        ? solicitudesList.map((x) => {
            const slaColors = x.sla?.level ? slaBadgeColors_(x.sla.level) : null;
            const listFs = vista === "PENDIENTES" ? FS_PEND : FS_SOL;
            return (
            <View key={x.id_solicitud || `${x.trabajador_email}-${x.matricula}-${x.fecha_inicio}-${x.hora_inicio}`} style={styles.card}>
              <View style={styles.requestHeaderRow}>
                <Text style={[styles.requestLine1, styles.flex1, wScale_(styles.requestLine1, listFs)]}>{x.matricula || "Sin matrícula"} · {x.estado}</Text>
                {vista === "PENDIENTES" && x.sla?.label && slaColors ? (
                  <View style={[styles.slaBadge, slaColors.badge]}>
                    <Text style={[styles.slaBadgeText, slaColors.text, wScale_(styles.slaBadgeText, listFs)]}>{x.sla.label}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.requestLine2, wScale_(styles.requestLine2, listFs)]}>
                {displayDateLabel_(x.fecha_inicio)} {x.hora_inicio || ""}
              </Text>
              <Text style={[styles.requestLine3, wScale_(styles.requestLine3, listFs)]}>
                {displayDateLabel_(x.fecha_fin)} {x.hora_fin || ""}
              </Text>
              <Text style={[styles.requestLine4, wScale_(styles.requestLine4, listFs)]}>Motivo: {x.motivo || "-"}</Text>

              {vista === "PENDIENTES" && x.needsGestorEscalation ? (
                <Text style={[styles.escalationHint, wScale_(styles.escalationHint, listFs)]}>
                  {x.vehicleHasActiveApprover
                    ? "Escalado al gestor - SLA +48h sin resolver"
                    : "Escalado al gestor - sin responsable activo o SLA +48h"}
                </Text>
              ) : null}
              {vista === "PENDIENTES" && !x.vehicleHasActiveApprover ? (
                <Text style={[styles.warnHint, wScale_(styles.warnHint, listFs)]}>
                  Sin responsable activo: en FLOTA el correo (responsable o e-mail_de_notificaciones) debe coincidir con un RESPONSABLE/GESTOR activo en USUARIOS
                </Text>
              ) : null}
              {x.estado === "RECHAZADA" && x.motivo_rechazo ? <Text style={[styles.message, wScale_(styles.message, listFs)]}>Motivo rechazo: {x.motivo_rechazo}</Text> : null}
              {allowed && x.estado === "PENDIENTE" && x.actionableForViewer ? (
                <View style={styles.row}>
                  <Pressable style={styles.button} onPress={() => resolver(x, "APROBADA")}>
                    <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, listFs)]}>Aprobar</Text>
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
                    <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, listFs)]}>Rechazar</Text>
                  </Pressable>
                </View>
              ) : null}
              {canCancelOwnPendingRequest(x, user?.email) ? (
                <Pressable style={styles.buttonSecondary} onPress={() => cancelarPropia_(x)}>
                  <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, listFs)]}>Retirar solicitud</Text>
                </Pressable>
              ) : null}
              {canLiberateRequestRow(x, user?.email, role, assignedSet) ? (
                <Pressable style={styles.button} onPress={() => openLiberateModal_(x)}>
                  <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, listFs)]}>Liberar reserva</Text>
                </Pressable>
              ) : null}
            </View>
            );
          })
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
          else if (fechaModalTarget === "libIni") {
            setLiberateModal((p) => ({ ...p, fechaInicio: formatYmdToEsDmy(ymd) }));
          } else if (fechaModalTarget === "libFin") {
            setLiberateModal((p) => ({ ...p, fechaFin: formatYmdToEsDmy(ymd) }));
          } else if (fechaModalTarget === "ocuparInicio") {
            setOcuparModal((p) => ({ ...p, fechaInicio: ymd }));
          } else if (fechaModalTarget === "ocuparFin") {
            setOcuparModal((p) => ({ ...p, fechaFin: ymd }));
          }
          setFechaModalTarget(null);
        }}
        onClose={() => setFechaModalTarget(null)}
      />
      <RangeDatePickerModal
        visible={dispRangeModal}
        title="Rango Desde -> Hasta"
        startYmd={dispDesde}
        endYmd={dispHasta}
        onConfirm={(a, b) => {
          setDispDesde(a);
          setDispHasta(b);
        }}
        onClose={() => setDispRangeModal(false)}
      />
      <RangeDatePickerModal
        visible={solRangeModal}
        title="Rango de la solicitud"
        startYmd={fechaInicio}
        endYmd={fechaFin}
        onConfirm={(a, b) => {
          setFechaInicio(a);
          setFechaFin(b);
        }}
        onClose={() => setSolRangeModal(false)}
      />

      <Modal
        visible={dayDetailModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setDayDetailModal((p) => ({ ...p, visible: false }))}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.dayDetailModalCard]}>
            <Text style={[styles.modalTitle, wScale_(styles.modalTitle, FS_DAY)]}>Disponibilidad {dayDetailModal.title}</Text>
            <View style={styles.dayDetailColumns}>
              <View style={styles.dayDetailCol}>
                <Text style={[styles.modalSub, wScale_(styles.modalSub, FS_DAY)]}>Disponibles: {dayDetailModal.available.length}</Text>
                <ScrollView style={styles.dayDetailColScroll}>
                  {dayDetailModal.available.map((v) =>
                    renderDisponibleVehicleCard_(v, FS_DAY, {
                      key: `disp-${v.matricula}`,
                      onSolicitud: () => {
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
                      },
                      onOcupar: () => {
                        const ymd = String(dayDetailModal.dayYmd || "").trim();
                        setDayDetailModal((p) => ({ ...p, visible: false }));
                        abrirOcuparModal({
                          matricula: String(v.matricula || "").trim().toUpperCase(),
                          fechaInicio: ymd,
                          fechaFin: ymd,
                        });
                      },
                    })
                  )}
                  {dayDetailModal.available.length === 0 ? (
                    <Text style={[styles.message, wScale_(styles.message, FS_DAY)]}>Sin vehículos disponibles</Text>
                  ) : null}
                </ScrollView>
              </View>

              <View style={styles.dayDetailCol}>
                <Text style={[styles.modalSub, wScale_(styles.modalSub, FS_DAY)]}>Ocupados: {dayDetailModal.busy.length}</Text>
                <ScrollView style={styles.dayDetailColScroll}>
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
                        <Text style={[styles.warnText, wScale_(styles.warnText, FS_DAY)]}>{[v.matricula, v.marca, v.modelo].filter(Boolean).join(" · ")}</Text>
                        {v?.responsable ? (
                          <Text style={[styles.modalRespText, wScale_(styles.modalRespText, FS_DAY)]}>Responsable: {v.responsable}</Text>
                        ) : null}
                        {v?.email_responsable ? (
                          <Text style={[styles.modalRespText, wScale_(styles.modalRespText, FS_DAY)]}>Correo: {v.email_responsable}</Text>
                        ) : null}
                        {v?.telefono ? (
                          <Text style={[styles.modalRespText, wScale_(styles.modalRespText, FS_DAY)]}>Teléfono: {v.telefono}</Text>
                        ) : null}
                        {ov ? (
                          <>
                            <Text style={[styles.messageSmall, wScale_(styles.messageSmall, FS_DAY)]}>
                              {displayDateLabel_(String(ov.fecha_inicio || "").trim())}
                              {hi ? ` ${hi}` : ""} -> {displayDateLabel_(String(ov.fecha_fin || "").trim())}
                              {hf ? ` ${hf}` : ""}
                            </Text>
                            <Text style={[styles.messageSmall, wScale_(styles.messageSmall, FS_DAY)]} numberOfLines={2}>
                              {String(ov.trabajador_nombre || "").trim() || "-"} · {String(ov.motivo || "").trim() || "-"}
                            </Text>
                            {canLiberateRequestRow(ov, user?.email, role, assignedSet) ? (
                              <Pressable
                                style={[styles.buttonSecondary, styles.liberateInlineBtn]}
                                onPress={() => {
                                  setDayDetailModal((p) => ({ ...p, visible: false }));
                                  openLiberateModal_(ov);
                                }}
                              >
                                <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, FS_DAY)]}>Liberar fechas</Text>
                              </Pressable>
                            ) : null}
                          </>
                        ) : null}
                      </Pressable>
                    );
                  })}
                  {dayDetailModal.busy.length === 0 ? (
                    <Text style={[styles.message, wScale_(styles.message, FS_DAY)]}>Sin vehículos ocupados</Text>
                  ) : null}
                </ScrollView>
              </View>
            </View>

            <Pressable style={[styles.buttonSecondary, { marginTop: 10 }]} onPress={() => setDayDetailModal((p) => ({ ...p, visible: false }))}>
              <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, FS_DAY)]}>Cerrar</Text>
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
          <View style={[styles.modalCard, styles.dayDetailModalCard]}>
            <Text style={[styles.modalTitle, wScale_(styles.modalTitle, FS_DISP)]}>Disponibilidades</Text>
            <Text style={[styles.modalSub, wScale_(styles.modalSub, FS_DISP)]}>Rango: {dispModal.rangeLabel || "-"}</Text>
            <View style={styles.dayDetailColumns}>
              <View style={styles.dayDetailCol}>
                <Text style={[styles.modalSub, wScale_(styles.modalSub, FS_DISP)]}>Disponibles: {dispModal.available.length}</Text>
                <ScrollView style={styles.dayDetailColScroll}>
                  {dispModal.available.map((v) =>
                    renderDisponibleVehicleCard_(v, FS_DISP, {
                      key: `disp-r-${v.matricula}`,
                      onSolicitud: () => {
                        setDispModal((p) => ({ ...p, visible: false }));
                        setVista("SOLICITUDES");
                        setMatricula(String(v?.matricula || "").trim().toUpperCase());
                        if (dispDesde) setFechaInicio(dispDesde);
                        if (dispHasta) setFechaFin(dispHasta);
                        setHoraInicio(String(dispHoraDesde || "").trim());
                        setHoraFin(String(dispHoraHasta || "").trim());
                      },
                      onOcupar: () => {
                        setDispModal((p) => ({ ...p, visible: false }));
                        abrirOcuparModal({
                          matricula: String(v?.matricula || "").trim().toUpperCase(),
                          fechaInicio: dispDesde || "",
                          fechaFin: dispHasta || "",
                        });
                      },
                    })
                  )}
                  {dispModal.available.length === 0 ? (
                    <Text style={[styles.message, wScale_(styles.message, FS_DISP)]}>Sin vehiculos disponibles</Text>
                  ) : null}
                </ScrollView>
              </View>

              <View style={styles.dayDetailCol}>
                <Text style={[styles.modalSub, wScale_(styles.modalSub, FS_DISP)]}>Ocupados: {dispModal.busy.length}</Text>
                <ScrollView style={styles.dayDetailColScroll}>
                  {dispModal.busy.map((v) => {
                    const ov = v?.overlap;
                    const hi = ov ? formatHoraMostrar_(ov.hora_inicio) : "";
                    const hf = ov ? formatHoraMostrar_(ov.hora_fin) : "";
                    const canLib = ov && canLiberateRequestRow(ov, user?.email, role, assignedSet);
                    return (
                      <View key={`busy-r-${v.matricula}-${ov?.id_solicitud || ""}`} style={styles.busyBlock}>
                        <Text style={[styles.warnText, wScale_(styles.warnText, FS_DISP)]}>{[v.matricula, v.marca, v.modelo].filter(Boolean).join(" · ")}</Text>
                        {v?.responsable ? (
                          <Text style={[styles.modalRespText, wScale_(styles.modalRespText, FS_DISP)]}>Responsable: {v.responsable}</Text>
                        ) : null}
                        {v?.email_responsable ? (
                          <Text style={[styles.modalRespText, wScale_(styles.modalRespText, FS_DISP)]}>Correo: {v.email_responsable}</Text>
                        ) : null}
                        {v?.telefono ? (
                          <Text style={[styles.modalRespText, wScale_(styles.modalRespText, FS_DISP)]}>Telefono: {v.telefono}</Text>
                        ) : null}
                        {ov ? (
                          <>
                            <Text style={[styles.messageSmall, wScale_(styles.messageSmall, FS_DISP)]}>
                              {displayDateLabel_(String(ov.fecha_inicio || "").trim())}
                              {hi ? ` ${hi}` : ""} -> {displayDateLabel_(String(ov.fecha_fin || "").trim())}
                              {hf ? ` ${hf}` : ""}
                            </Text>
                            <Text style={[styles.messageSmall, wScale_(styles.messageSmall, FS_DISP)]} numberOfLines={2}>
                              {String(ov.trabajador_nombre || "").trim() || "-"} · {String(ov.motivo || "").trim() || "-"}
                            </Text>
                            {canLib ? (
                              <Pressable
                                style={[styles.buttonSecondary, styles.liberateInlineBtn]}
                                onPress={() => {
                                  setDispModal((p) => ({ ...p, visible: false }));
                                  openLiberateModal_(ov);
                                }}
                              >
                                <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, FS_DISP)]}>Liberar fechas</Text>
                              </Pressable>
                            ) : null}
                          </>
                        ) : (
                          <Text style={[styles.messageSmall, wScale_(styles.messageSmall, FS_DISP)]}>Sin detalle de reserva</Text>
                        )}
                      </View>
                    );
                  })}
                  {dispModal.busy.length === 0 ? (
                    <Text style={[styles.message, wScale_(styles.message, FS_DISP)]}>Sin vehiculos ocupados</Text>
                  ) : null}
                </ScrollView>
              </View>
            </View>
            <Pressable style={[styles.buttonSecondary, { marginTop: 10 }]} onPress={() => setDispModal((p) => ({ ...p, visible: false }))}>
              <Text style={[styles.buttonTextSmall, wScale_(styles.buttonTextSmall, FS_DISP)]}>Cerrar</Text>
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
        visible={liberateModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          !liberateModal.sending &&
          setLiberateModal({
            visible: false,
            item: null,
            fechaInicio: "",
            fechaFin: "",
            motivo: "",
            sending: false,
          })
        }
      >
        <View style={styles.modalBackdrop} pointerEvents="box-none">
          <View style={[styles.modalCard, Platform.OS === "web" ? styles.modalCardWeb : null]}>
            <Text style={styles.modalTitle}>Liberar reserva</Text>
            <Text style={styles.modalSub}>
              {[liberateModal.item?.matricula, liberateModal.item?.trabajador_email].filter(Boolean).join(" · ") || "-"}
            </Text>
            <Text style={styles.message}>
              Solo se usan las fechas (días completos; las horas no cuentan). Por defecto se libera todo el rango aprobado. Puedes acortar las fechas para una liberación parcial.
            </Text>
            {Platform.OS === "web" ? (
              <>
                <TextField
                  label="Fecha inicio (dd/mm/aaaa)"
                  value={liberateModal.fechaInicio}
                  onChangeText={(t) => setLiberateModal((p) => ({ ...p, fechaInicio: t }))}
                  placeholder="dd/mm/aaaa"
                />
                <TextField
                  label="Fecha fin (dd/mm/aaaa)"
                  value={liberateModal.fechaFin}
                  onChangeText={(t) => setLiberateModal((p) => ({ ...p, fechaFin: t }))}
                  placeholder="dd/mm/aaaa"
                />
              </>
            ) : (
              <>
                <Pressable
                  style={styles.buttonSecondary}
                  onPress={() => setFechaModalTarget("libIni")}
                  disabled={liberateModal.sending}
                >
                  <Text style={styles.buttonTextSmall}>
                    Inicio liberación: {displayDateLabel_(liberateModal.fechaInicio) || "Elegir fecha"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.buttonSecondary}
                  onPress={() => setFechaModalTarget("libFin")}
                  disabled={liberateModal.sending}
                >
                  <Text style={styles.buttonTextSmall}>
                    Fin liberación: {displayDateLabel_(liberateModal.fechaFin) || "Elegir fecha"}
                  </Text>
                </Pressable>
              </>
            )}
            <TextField
              label="Motivo"
              value={liberateModal.motivo}
              onChangeText={(t) => setLiberateModal((p) => ({ ...p, motivo: t }))}
              placeholder="Motivo de la liberación"
            />
            <View style={styles.row}>
              <Pressable
                accessibilityRole="button"
                style={[styles.buttonSecondary, styles.flex1]}
                disabled={liberateModal.sending}
                onPress={() =>
                  setLiberateModal({
                    visible: false,
                    item: null,
                    fechaInicio: "",
                    fechaFin: "",
                    motivo: "",
                    sending: false,
                  })
                }
              >
                <Text style={styles.buttonTextSmall}>Cancelar</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={[
                  styles.button,
                  styles.flex1,
                  liberateModal.sending && styles.buttonDisabled,
                  Platform.OS === "web" ? styles.webClickable : null,
                ]}
                disabled={liberateModal.sending}
                onPress={() => {
                  confirmarLiberacion_();
                }}
              >
                <Text style={styles.buttonTextSmall}>{liberateModal.sending ? "Liberando..." : "Confirmar liberación"}</Text>
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

      {/* Modal ocupación rápida - solo gestor/responsable */}
      <Modal
        visible={ocuparModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => !ocuparModal.sending && setOcuparModal((p) => ({ ...p, visible: false }))}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
          >
          <View style={styles.ocuparModalCard}>
            <Text style={[styles.modalTitle, { fontSize: 22, marginBottom: 10 }]}>Marcar ocupado</Text>
            <Text style={[styles.message, { fontSize: 14, marginBottom: 12 }]}>Reserva aprobada directa. Solo GESTOR.</Text>

            {/* Matrícula */}
            <Text style={styles.ocuparFieldLabel}>Matrícula *</Text>
            <TextInput
              style={styles.ocuparInput}
              value={ocuparModal.matricula}
              onChangeText={(t) => setOcuparModal((p) => ({ ...p, matricula: t.toUpperCase() }))}
              placeholder="Ej: 1234-ABC"
              placeholderTextColor={theme.colors.subtext}
              autoCapitalize="characters"
            />

            {/* Conductor */}
            <Text style={styles.ocuparFieldLabel}>Conductor (quién lo va a usar) *</Text>
            {usuariosCatalog.length > 0 ? (
              <>
                <TextInput
                  style={[styles.ocuparInput, { marginBottom: 4 }]}
                  value={ocuparModal.usuarioNombre || ocuparModal.usuarioEmail}
                  onChangeText={(t) => setOcuparModal((p) => ({ ...p, usuarioEmail: t, usuarioNombre: "" }))}
                  placeholder="Busca nombre o email..."
                  placeholderTextColor={theme.colors.subtext}
                />
                {(() => {
                  const q = (ocuparModal.usuarioNombre ? "" : ocuparModal.usuarioEmail || "").toLowerCase();
                  if (!q || ocuparModal.usuarioNombre) return null;
                  const matches = usuariosCatalog.filter(
                    (u) => u.email.includes(q) || u.nombre.toLowerCase().includes(q)
                  ).slice(0, 8);
                  if (!matches.length) return null;
                  return (
                    <View style={styles.ocuparUserDropdown}>
                      {matches.map((u) => (
                        <Pressable
                          key={u.email}
                          style={styles.ocuparUserRow}
                          onPress={() => setOcuparModal((p) => ({ ...p, usuarioEmail: u.email, usuarioNombre: u.nombre || u.email }))}
                        >
                          <Text style={[styles.okText, { fontSize: 15 }]}>{u.nombre || u.email}</Text>
                          <Text style={[styles.modalPickHint, { fontSize: 13 }]}>{u.email} · {u.rol}</Text>
                        </Pressable>
                      ))}
                    </View>
                  );
                })()}
                {ocuparModal.usuarioNombre ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <Text style={[styles.okText, { fontSize: 14, flex: 1 }]}>{ocuparModal.usuarioNombre} · {ocuparModal.usuarioEmail}</Text>
                    <Pressable onPress={() => setOcuparModal((p) => ({ ...p, usuarioEmail: "", usuarioNombre: "" }))}>
                      <Text style={[styles.timeClearText, { fontSize: 18 }]}>X</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : (
              <TextInput
                style={styles.ocuparInput}
                value={ocuparModal.usuarioEmail}
                onChangeText={(t) => setOcuparModal((p) => ({ ...p, usuarioEmail: t.toLowerCase(), usuarioNombre: "" }))}
                placeholder="email del conductor"
                placeholderTextColor={theme.colors.subtext}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            )}

            {/* Fechas: calendario y/o entrada manual */}
            <Text style={styles.ocuparFieldLabel}>Fechas (desde / hasta) *</Text>
            <Pressable style={styles.ocuparTapRow} onPress={() => setOcuparRangeModal(true)}>
              <Text style={styles.ocuparTapValue}>
                {ocuparModal.fechaInicio && ocuparModal.fechaFin
                  ? `${displayDateLabel_(ocuparModal.fechaInicio)} -> ${displayDateLabel_(ocuparModal.fechaFin)}`
                  : "Elegir rango en el calendario"}
              </Text>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.ocuparFieldLabel, { marginTop: 0 }]}>Desde (dd/mm/aaaa)</Text>
                <TextInput
                  style={styles.ocuparInput}
                  value={
                    ocuparModal.fechaInicioDraft !== undefined
                      ? ocuparModal.fechaInicioDraft
                      : ocuparModal.fechaInicio
                        ? displayDateLabel_(ocuparModal.fechaInicio)
                        : ""
                  }
                  onChangeText={(t) => setOcuparModal((p) => ({ ...p, fechaInicioDraft: t }))}
                  onBlur={() => {
                    const raw = String(ocuparModal.fechaInicioDraft ?? displayDateLabel_(ocuparModal.fechaInicio) ?? "").trim();
                    const ymd = toYmdForPicker_(raw);
                    if (ymd) {
                      setOcuparModal((p) => ({ ...p, fechaInicio: ymd, fechaInicioDraft: undefined }));
                    } else if (!raw) {
                      setOcuparModal((p) => ({ ...p, fechaInicio: "", fechaInicioDraft: undefined }));
                    } else {
                      setOcuparModal((p) => ({ ...p, fechaInicioDraft: undefined }));
                    }
                  }}
                  placeholder="dd/mm/aaaa"
                  placeholderTextColor={theme.colors.subtext}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.ocuparFieldLabel, { marginTop: 0 }]}>Hasta (dd/mm/aaaa)</Text>
                <TextInput
                  style={styles.ocuparInput}
                  value={
                    ocuparModal.fechaFinDraft !== undefined
                      ? ocuparModal.fechaFinDraft
                      : ocuparModal.fechaFin
                        ? displayDateLabel_(ocuparModal.fechaFin)
                        : ""
                  }
                  onChangeText={(t) => setOcuparModal((p) => ({ ...p, fechaFinDraft: t }))}
                  onBlur={() => {
                    const raw = String(ocuparModal.fechaFinDraft ?? displayDateLabel_(ocuparModal.fechaFin) ?? "").trim();
                    const ymd = toYmdForPicker_(raw);
                    if (ymd) {
                      setOcuparModal((p) => ({ ...p, fechaFin: ymd, fechaFinDraft: undefined }));
                    } else if (!raw) {
                      setOcuparModal((p) => ({ ...p, fechaFin: "", fechaFinDraft: undefined }));
                    } else {
                      setOcuparModal((p) => ({ ...p, fechaFinDraft: undefined }));
                    }
                  }}
                  placeholder="dd/mm/aaaa"
                  placeholderTextColor={theme.colors.subtext}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
            <Text style={[styles.message, { fontSize: 12, marginTop: 2, marginBottom: 4 }]}>
              Puedes marcar el rango en el calendario o escribir las fechas a mano.
            </Text>

            {/* Horas opcionales: calendario/reloj o escritura HH:mm */}
            <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ocuparFieldLabel}>Hora inicio (opcional)</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TextInput
                    style={[styles.ocuparInput, { flex: 1, marginBottom: 0 }]}
                    value={ocuparModal.horaInicio}
                    onChangeText={(t) => setOcuparModal((p) => ({ ...p, horaInicio: t }))}
                    placeholder="HH:mm"
                    placeholderTextColor={theme.colors.subtext}
                    keyboardType="numbers-and-punctuation"
                  />
                  <Pressable
                    style={[styles.ocuparTapRow, { paddingHorizontal: 12, marginBottom: 0 }]}
                    onPress={() => setTimeModalTarget("OC_HI")}
                  >
                    <Text style={styles.ocuparTapValue}>⏱</Text>
                  </Pressable>
                  {ocuparModal.horaInicio ? (
                    <Pressable onPress={() => setOcuparModal((p) => ({ ...p, horaInicio: "" }))} style={styles.timeClearBtn}>
                      <Text style={styles.timeClearText}>X</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ocuparFieldLabel}>Hora fin (opcional)</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TextInput
                    style={[styles.ocuparInput, { flex: 1, marginBottom: 0 }]}
                    value={ocuparModal.horaFin}
                    onChangeText={(t) => setOcuparModal((p) => ({ ...p, horaFin: t }))}
                    placeholder="HH:mm"
                    placeholderTextColor={theme.colors.subtext}
                    keyboardType="numbers-and-punctuation"
                  />
                  <Pressable
                    style={[styles.ocuparTapRow, { paddingHorizontal: 12, marginBottom: 0 }]}
                    onPress={() => setTimeModalTarget("OC_HF")}
                  >
                    <Text style={styles.ocuparTapValue}>⏱</Text>
                  </Pressable>
                  {ocuparModal.horaFin ? (
                    <Pressable onPress={() => setOcuparModal((p) => ({ ...p, horaFin: "" }))} style={styles.timeClearBtn}>
                      <Text style={styles.timeClearText}>X</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
            <Text style={[styles.message, { fontSize: 12, marginTop: 2 }]}>
              Si no indicas hora, se reserva el día completo (00:00-23:59).
            </Text>

            {/* Motivo */}
            <Text style={styles.ocuparFieldLabel}>Motivo *</Text>
            <TextInput
              style={[styles.ocuparInput, { height: 90, textAlignVertical: "top" }]}
              value={ocuparModal.motivo}
              onChangeText={(t) => setOcuparModal((p) => ({ ...p, motivo: t }))}
              placeholder="Motivo de la ocupación"
              placeholderTextColor={theme.colors.subtext}
              multiline
            />

            {ocuparModal.error ? <Text style={[styles.errorText, { fontSize: 14, marginTop: 8 }]}>{ocuparModal.error}</Text> : null}

            <View style={{ flexDirection: "row", gap: 14, marginTop: 18 }}>
              <Pressable style={[styles.button, { flex: 1, paddingVertical: 16 }]} onPress={ocuparDirecto} disabled={ocuparModal.sending}>
                <Text style={[styles.buttonText, { fontSize: 16 }]}>{ocuparModal.sending ? "Guardando..." : "Confirmar ocupación"}</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonSecondary, { flex: 1, paddingVertical: 16 }]}
                onPress={() => setOcuparModal((p) => ({ ...p, visible: false }))}
                disabled={ocuparModal.sending}
              >
                <Text style={[styles.buttonTextSmall, { fontSize: 16 }]}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Calendario/hora encima del formulario de ocupacion (despues en el arbol DOM). */}
      <RangeDatePickerModal
        visible={ocuparRangeModal}
        title="Rango de ocupacion"
        startYmd={ocuparModal.fechaInicio}
        endYmd={ocuparModal.fechaFin}
        onConfirm={(a, b) => {
          setOcuparModal((p) => ({
            ...p,
            fechaInicio: a,
            fechaFin: b,
            fechaInicioDraft: undefined,
            fechaFinDraft: undefined,
          }));
        }}
        onClose={() => setOcuparRangeModal(false)}
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
          else if (timeModalTarget === "LIB_HI") setLiberateModal((p) => ({ ...p, horaInicio: hm }));
          else if (timeModalTarget === "LIB_HF") setLiberateModal((p) => ({ ...p, horaFin: hm }));
          else if (timeModalTarget === "OC_HI") setOcuparModal((p) => ({ ...p, horaInicio: hm }));
          else if (timeModalTarget === "OC_HF") setOcuparModal((p) => ({ ...p, horaFin: hm }));
        }}
        onClear={() => {
          if (timeModalTarget === "HI") setHoraInicio("");
          else if (timeModalTarget === "HF") setHoraFin("");
          else if (timeModalTarget === "DD") setDispHoraDesde("");
          else if (timeModalTarget === "DH") setDispHoraHasta("");
          else if (timeModalTarget === "LIB_HI") setLiberateModal((p) => ({ ...p, horaInicio: "" }));
          else if (timeModalTarget === "LIB_HF") setLiberateModal((p) => ({ ...p, horaFin: "" }));
          else if (timeModalTarget === "OC_HI") setOcuparModal((p) => ({ ...p, horaInicio: "" }));
          else if (timeModalTarget === "OC_HF") setOcuparModal((p) => ({ ...p, horaFin: "" }));
        }}
        onClose={() => setTimeModalTarget(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 14, paddingBottom: 26, maxWidth: "75%", alignSelf: "center", width: "100%" },
  header: { alignItems: "center", marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900", marginBottom: 8 },
  backBtn: { borderColor: "#4f88bf", borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, alignSelf: "center" },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  card: { backgroundColor: theme.colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 12 },
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 14, marginBottom: 8 },
  /** Mes/año del almanaque: centrado; en web ~4× el tamaño base (el patch web ya multiplica ×2). */
  monthYearTitle: {
    color: theme.colors.text,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "capitalize",
    marginTop: 10,
    marginBottom: 10,
    ...Platform.select({
      web: { fontSize: 26, lineHeight: 32 },
      default: { fontSize: 14, lineHeight: 18 },
    }),
  },
  message: { color: theme.colors.subtext, marginBottom: 6, fontSize: 13 },
  messageSmall: { color: theme.colors.subtext, fontSize: 11, marginBottom: 3, lineHeight: 15 },
  busyBlock: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  row: { flexDirection: "row", gap: 8 },
  tabRowWrap: { flexWrap: "wrap" },
  solActionsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
    width: "100%",
  },
  /** Ancho ~42.5% cada uno -> el par ocupa ~85% y queda centrado. */
  solActionBtn: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "42%",
    width: "42%",
    maxWidth: 280,
    marginTop: 0,
    alignSelf: "center",
  },
  estadoBuscarRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "nowrap",
    width: "100%",
  },
  estadoBuscarField: { flex: 1, minWidth: 0 },
  pendFiltroRow: {
    flexWrap: "nowrap",
    alignItems: "stretch",
    gap: 8,
    width: "100%",
  },
  pendFiltroBtn: {
    flex: 1,
    minWidth: 0,
    marginTop: 0,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  pendRecargarBtn: { marginTop: 22, minWidth: 120, paddingHorizontal: 14 },
  calVehiculoWider: { width: 420, maxWidth: "55%", flexShrink: 1 },
  calVehiculoLabel: { alignSelf: "center", marginBottom: 0, paddingTop: 0, paddingBottom: 0, lineHeight: 20 },
  calVehiculoInputWrap: { alignSelf: "center", justifyContent: "center" },
  dispRangeTap: { flex: 1, minWidth: 0 },
  dispHoursRow: { flex: 1, minWidth: 0 },
  dispTimeTap: { flex: 1, minWidth: 110 },
  solDateNarrow: { width: "50%", maxWidth: "50%", flexGrow: 0, flexShrink: 1, alignSelf: "flex-start" },
  solHoursNarrowRow: { flex: 1, flexDirection: "row", flexWrap: "nowrap", alignItems: "center", gap: 50, minWidth: 0, maxWidth: "100%" },
  solTimeNarrow: { flex: 1, minWidth: 120, flexShrink: 1 },
  solTimeGroup: { flex: 1, flexDirection: "row", alignItems: "center", minWidth: 0 },
  liberateInlineBtn: { marginTop: 10, marginBottom: 12, paddingVertical: 10, alignSelf: "stretch", minHeight: 44 },
  dispVehicleCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  dispVehicleTitle: { color: "#c9ffd9", fontWeight: "900", fontSize: 14, fontFamily: "Arial", marginBottom: 6 },
  dispCardActions: { flexDirection: "row", flexWrap: "nowrap", gap: 8, marginTop: 10, width: "100%" },
  dispCardActionBtn: { flex: 1, minWidth: 0, marginTop: 0, alignSelf: "stretch", justifyContent: "center", paddingVertical: 10, paddingHorizontal: 6 },
  dispOcuparBtn: {
    backgroundColor: "#1565c0",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#42a5f5",
  },
  dispResultModalCard: {
    width: "98%",
    maxWidth: 2880,
    minWidth: 340,
    height: "90%",
    alignSelf: "center",
    flexDirection: "column",
    overflow: "hidden",
    ...Platform.select({ web: { display: "flex" }, default: {} }),
  },
  dispResultColumns: { flexDirection: "row", gap: 12, flex: 1, minHeight: 0, width: "100%", marginTop: 8 },
  dispResultCol: { flex: 1, minWidth: 0, minHeight: 0, flexDirection: "column" },
  dispResultColScroll: { flex: 1, minHeight: 120, ...Platform.select({ web: { height: 0, overflowY: "auto" }, default: {} }) },
  dispResultScrollContent: { paddingBottom: 28, flexGrow: 1 },
  rangeModalCard: { width: "92%", maxWidth: 720, alignSelf: "center" },
  dayPickInRange: { backgroundColor: "#1e4a6e", borderColor: "#3d7a9e" },
  dayDetailModalCard: {
    width: "98%",
    maxWidth: 2880,
    minWidth: 340,
    height: "90%",
    alignSelf: "center",
    flexDirection: "column",
    overflow: "hidden",
    ...Platform.select({
      web: { display: "flex" },
      default: {},
    }),
  },
  dayDetailColumns: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 14,
    flex: 1,
    minHeight: 0,
    width: "100%",
    marginTop: 8,
    marginBottom: 4,
  },
  dayDetailCol: { flex: 1, minWidth: 0, minHeight: 0, flexDirection: "column" },
  dayDetailColScroll: { flex: 1, minHeight: 120, ...Platform.select({ web: { height: 0 }, default: {} }) },
  flex1: { flex: 1 },
  button: { flex: 1, marginTop: 6, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  buttonDanger: { flex: 1, marginTop: 6, backgroundColor: "#9a3e3e", borderRadius: 10, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderWidth: 1, borderColor: "#d06b6b" },
  buttonSecondary: { marginTop: 2, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.border },
  buttonActive: { borderColor: "#5fb7ff", borderWidth: 1 },
  tabNavButton: { paddingVertical: 10, paddingHorizontal: 4, minHeight: 48, justifyContent: "center", alignItems: "center" },
  tabNavText: { color: theme.colors.text, fontWeight: "800", fontSize: 14, textAlign: "center", fontFamily: "Arial", lineHeight: 18 },
  subFiltroTabText: { color: theme.colors.text, fontWeight: "800", fontSize: 14, textAlign: "center", fontFamily: "Arial", lineHeight: 18 },
  buttonText: { color: theme.colors.text, fontWeight: "900", fontSize: 14, fontFamily: "Arial", textAlign: "center" },
  buttonTextSmall: { color: theme.colors.text, fontWeight: "800", fontSize: 14, fontFamily: "Arial", textAlign: "center" },
  buttonDisabled: { opacity: 0.55 },
  // Anchura efectiva para Estado/Buscar (estrechar ~75%).
  fieldNarrowWrap: { alignSelf: "flex-start", width: "25%" },
  // Campos de fecha/hora de inicio y fin: 75% más estrecho.
  dateNarrowWrap: { width: "45%" },
  // Fila fecha + hora en la misma línea.
  dateTimeRow: { flex: 1, flexDirection: "row", flexWrap: "nowrap", alignItems: "center", gap: 6, marginBottom: 0 },
  timeTapBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
    alignItems: "center",
  },
  timeTapBtnSet: { borderColor: "#5fb7ff" },
  timeClearBtn: { paddingHorizontal: 8, paddingVertical: 12, justifyContent: "center" },
  timeClearText: { color: "#8ec8ff", fontSize: 16, fontWeight: "900" },
  // Fila con etiqueta a la izquierda e input a la derecha.
  inlineLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    ...Platform.select({
      android: { flexWrap: "wrap" },
      ios: { flexWrap: "wrap" },
      default: {},
    }),
  },
  inlineLabel: { color: theme.colors.text, fontWeight: "800", fontSize: 13, fontFamily: "Arial", minWidth: 88, flexShrink: 0, marginRight: 10, paddingRight: 6 },
  inlineFieldWrap: { flex: 1 },
  // Selector de matrícula estrecho (25% del card).
  matriculaFieldWrap: { width: "25%" },
  // Info de responsable inline junto al selector.
  responsableInfo: { flex: 1, color: theme.colors.subtext, fontSize: 12, fontFamily: "Arial", marginLeft: 8 },
  // Calendario: selector de vehículo (izq) + botones de mes (dcha) en la misma fila.
  calendarControlRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 8, flexWrap: "wrap", paddingHorizontal: 4 },
  inlineLabelRowStack: { flexWrap: "wrap", alignItems: "flex-start" },
  calendarControlRowNative: { flexDirection: "column", alignItems: "stretch" },
  mesBtnsRowNative: { marginLeft: 0, width: "100%", justifyContent: "space-between" },
  calVehiculoWrap: { width: 340, maxWidth: "38%", flexShrink: 1 },
  mesBtnsRow: { flexDirection: "row", gap: 6, marginLeft: "auto" },
  mesBtn: {
    paddingVertical: 0,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card2,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
    height: 36,
    ...Platform.select({
      web: { height: 52, minWidth: 180, paddingHorizontal: 18 },
      android: { flex: 1, minWidth: 0 },
      ios: { flex: 1, minWidth: 0 },
      default: {},
    }),
  },
  // Tarjeta de solicitud en modo compacto (4 líneas principales).
  requestHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  requestLine1: { color: theme.colors.text, fontWeight: "900", fontSize: 14, lineHeight: 18, fontFamily: "Arial" },
  requestLine2: { color: theme.colors.subtext, fontWeight: "800", fontSize: 14, lineHeight: 18, marginBottom: 2, fontFamily: "Arial" },
  requestLine3: { color: theme.colors.subtext, fontWeight: "800", fontSize: 14, lineHeight: 18, marginBottom: 2, fontFamily: "Arial" },
  requestLine4: { color: theme.colors.subtext, fontWeight: "800", fontSize: 14, lineHeight: 18, marginBottom: 6, fontFamily: "Arial" },
  dayPickCell: {
    width: "14.2857%",
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.card2,
    ...Platform.select({
      web: { minHeight: 72 },
      default: {},
    }),
  },
  dayPickSelected: { backgroundColor: "#1e4a6e", borderColor: "#5fb7ff", borderWidth: 2 },
  dayPickText: {
    color: theme.colors.text,
    fontWeight: "800",
    ...Platform.select({
      web: { fontSize: 24 },
      default: { fontSize: 12 },
    }),
  },
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
  dateTapValue: { color: theme.colors.text, fontWeight: "800", fontSize: 14, fontFamily: "Arial" },
  weekHeader: { flexDirection: "row", marginTop: 8, marginBottom: 6 },
  weekHeaderText: {
    flex: 1,
    textAlign: "center",
    color: theme.colors.subtext,
    fontWeight: "800",
    ...Platform.select({
      web: { fontSize: 22 },
      default: { fontSize: 11 },
    }),
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  dayCell: {
    width: "14.2857%",
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 64,
    padding: 3,
    ...Platform.select({
      web: { minHeight: 112, padding: 6 },
      default: {},
    }),
  },
  dayCellVoid: { backgroundColor: "transparent", borderColor: "transparent" },
  dayBusy: { backgroundColor: "#7e2f2f" },
  dayFree: { backgroundColor: "#2e6a43" },
  dayOccupyDraft: {
    borderColor: "#ffcc66",
    borderWidth: 3,
    ...Platform.select({ web: { outlineWidth: 2, outlineColor: "#ffcc66", outlineStyle: "solid" }, default: {} }),
  },
  dayNumber: {
    color: "#fff",
    fontWeight: "900",
    ...Platform.select({
      web: { fontSize: 15, lineHeight: 18 },
      default: { fontSize: 11 },
    }),
  },
  dayDetailBusy: {
    color: "#ffd9d9",
    marginTop: 2,
    ...Platform.select({
      web: { fontSize: 12, lineHeight: 15 },
      default: { fontSize: 9 },
    }),
  },
  dayDetailFree: {
    color: "#d9ffe5",
    ...Platform.select({
      web: { fontSize: 12, lineHeight: 15 },
      default: { fontSize: 9 },
    }),
  },
  dayState: {
    color: "#fff",
    fontWeight: "800",
    marginTop: 6,
    ...Platform.select({
      web: { fontSize: 12, lineHeight: 15 },
      default: { fontSize: 9 },
    }),
  },
  okText: { color: "#c9ffd9", fontSize: 12, marginBottom: 4 },
  warnText: { color: "#ffd0d0", fontSize: 12, marginBottom: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" },
  /** Sobre formularios/modales ya abiertos (p. ej. calendario de ocupación). */
  modalBackdropElevated: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    padding: 16,
    justifyContent: "center",
    ...Platform.select({
      web: { zIndex: 100000, position: "fixed", top: 0, left: 0, right: 0, bottom: 0 },
      default: { elevation: 48 },
    }),
  },
  modalCard: { backgroundColor: theme.colors.card, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, padding: 14 },
  modalCardWeb: { maxWidth: 480, width: "100%", alignSelf: "center", maxHeight: "90vh", overflow: "auto" },
  dispModalCard: { width: "70%", maxWidth: 820, height: "75%", alignSelf: "center" },
  webClickable: { cursor: "pointer" },
  modalTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 6 },
  modalSub: { color: theme.colors.text, fontWeight: "800", fontSize: 14, marginBottom: 6 },
  modalPickRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#3d7a52",
    backgroundColor: "rgba(60, 120, 80, 0.2)",
  },
  modalPickHint: { color: theme.colors.subtext, fontSize: 11, marginTop: 4 },
  dispColumnsWrap: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
    maxWidth: "75%",
    alignSelf: "center",
    flexWrap: "wrap",
  },
  dispCol: { flex: 1, minWidth: 220 },
  modalRespText: { color: theme.colors.subtext, fontSize: 11, lineHeight: 15, marginBottom: 4, fontFamily: "Arial", fontWeight: "800" },
  rowTitle: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  slaBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  slaBadgeText: { fontWeight: "900", fontSize: 10 },
  escalationHint: { color: "#ffc8c8", fontWeight: "800", fontSize: 12, marginBottom: 4 },
  warnHint: { color: "#ffe0a8", fontWeight: "700", fontSize: 12, marginBottom: 4 },
  ocuparBtn: {
    backgroundColor: "#1565c0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "center",
    marginLeft: 8,
  },
  ocuparBtnText: { color: "#fff", fontWeight: "900", fontSize: 12, fontFamily: "Arial" },
  fieldLabel: { color: theme.colors.subtext, fontSize: 12, fontFamily: "Arial", marginTop: 8, marginBottom: 2 },
  errorText: { color: "#ff6b6b", fontSize: 12, fontFamily: "Arial", marginTop: 6 },
  ocuparModalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 28,
    maxWidth: 820,
    width: "96%",
    alignSelf: "center",
  },
  ocuparFieldLabel: { color: theme.colors.subtext, fontSize: 14, fontFamily: "Arial", marginTop: 12, marginBottom: 4 },
  ocuparInput: {
    backgroundColor: theme.colors.input,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 4,
    fontSize: 15,
    fontFamily: "Arial",
  },
  ocuparTapRow: {
    backgroundColor: theme.colors.input,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 4,
  },
  ocuparTapValue: { color: theme.colors.text, fontWeight: "800", fontSize: 15, fontFamily: "Arial" },
  ocuparUserDropdown: {
    backgroundColor: theme.colors.card2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 6,
    maxHeight: 260,
    overflow: "hidden",
  },
  ocuparUserRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
});

