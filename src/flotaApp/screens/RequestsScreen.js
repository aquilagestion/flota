import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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

function parseItem_(x) {
  const fechaInicio = String(x?.fecha_inicio || x?.fecha_desde || "").trim();
  const horaInicio = String(x?.hora_inicio || "").trim();
  const fechaFin = String(x?.fecha_fin || x?.fecha_hasta || "").trim();
  const horaFin = String(x?.hora_fin || "").trim();
  return {
    id_solicitud: String(x?.id_solicitud || x?.id || "").trim(),
    estado: normalizeEstado_(x?.estado || ""),
    matricula: String(x?.matricula || "").trim(),
    trabajador_email: String(x?.trabajador_email || x?.usuario_email || "").trim().toLowerCase(),
    trabajador_nombre: String(x?.trabajador_nombre || x?.usuario_nombre || "").trim(),
    fecha_inicio: fechaInicio,
    hora_inicio: horaInicio,
    fecha_fin: fechaFin,
    hora_fin: horaFin,
    motivo: String(x?.motivo || "").trim(),
    motivo_rechazo: String(x?.motivo_rechazo || "").trim(),
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

function combineDateTime_(dateValue, timeValue) {
  const d = parseDateFlexible_(dateValue);
  if (!d) return null;
  const t = String(timeValue || "").trim();
  if (!/^\d{2}:\d{2}$/.test(t)) return d;
  const [hh, mm] = t.split(":").map((x) => Number(x));
  const out = new Date(d);
  out.setHours(hh || 0, mm || 0, 0, 0);
  return out;
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
  const [dayDetailModal, setDayDetailModal] = useState({
    visible: false,
    title: "",
    available: [],
    busy: [],
  });
  const [busyDetailModal, setBusyDetailModal] = useState({
    visible: false,
    vehicle: null,
  });
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    const byEstado = items.filter((x) => (estadoFiltro ? x.estado === estadoFiltro : true));
    if (!q) return byEstado;
    return byEstado.filter((x) => `${x.matricula} ${x.trabajador_email} ${x.motivo}`.toLowerCase().includes(q));
  }, [items, query, estadoFiltro]);

  const monthCells = useMemo(() => getMonthGrid_(monthCursor), [monthCursor]);

  const calendarStatsByDay = useMemo(() => {
    const approved = items.filter((x) => x.estado === "APROBADA");
    const allVehicles = Array.isArray(vehiclesCatalog) ? vehiclesCatalog : [];
    const totalVehicles = allVehicles.length;
    const byDay = {};
    for (const day of monthCells) {
      if (!day) continue;
      const { start, end } = dayBounds_(monthCursor, day);
      if (vehiculoFiltro === "TODOS") {
        const usedSet = new Set();
        for (const x of approved) {
          const reqStart = combineDateTime_(x.fecha_inicio, x.hora_inicio);
          const reqEnd = combineDateTime_(x.fecha_fin, x.hora_fin);
          if (!reqStart || !reqEnd) continue;
          if (!rangesOverlap_(start, end, reqStart, reqEnd)) continue;
          usedSet.add(String(x.matricula || "").trim().toUpperCase());
        }
        const used = usedSet.size;
        byDay[day] = {
          busy: used > 0,
          used,
          free: Math.max(totalVehicles - used, 0),
          total: totalVehicles,
        };
      } else {
        const busy = approved.some((x) => {
          const mat = String(x.matricula || "").trim().toUpperCase();
          if (mat !== vehiculoFiltro) return false;
          const reqStart = combineDateTime_(x.fecha_inicio, x.hora_inicio);
          const reqEnd = combineDateTime_(x.fecha_fin, x.hora_fin);
          if (!reqStart || !reqEnd) return false;
          return rangesOverlap_(start, end, reqStart, reqEnd);
        });
        byDay[day] = { busy };
      }
    }
    return byDay;
  }, [items, vehiclesCatalog, vehiculoFiltro, monthCells, monthCursor]);

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
            modelo: String(v?.modelo || "").trim(),
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
          const notify = String(v?.["e-mail_de_notificaciones"] || v?.email_de_notificaciones || "")
            .trim()
            .toLowerCase();
          return !!me && (resp === me || notify === me);
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
      let next = rows.map(parseItem_);
      if (responsable && !gestor) {
        const me = String(user?.email || "").trim().toLowerCase();
        next = next.filter((s) => {
          const mat = String(s?.matricula || "").trim().toUpperCase();
          const owner = String(s?.trabajador_email || "").trim().toLowerCase();
          return assignedNow.has(mat) || owner === me;
        });
      }
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
    const fi = String(fechaInicio || "").trim();
    const hi = String(horaInicio || "").trim();
    const ff = String(fechaFin || "").trim();
    const hf = String(horaFin || "").trim();
    const mot = String(motivo || "").trim();
    if (!mat || !fi || !hi || !ff || !hf || !mot) {
      Alert.alert("Datos incompletos", "Completa matrícula, fecha/hora inicio, fecha/hora fin y motivo.");
      return;
    }
    const dtStart = combineDateTime_(fi, hi);
    const dtEnd = combineDateTime_(ff, hf);
    if (!dtStart || !dtEnd || dtEnd.getTime() < dtStart.getTime()) {
      Alert.alert("Rango inválido", "Revisa fechas y horas. La fecha/hora fin debe ser posterior a inicio.");
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
      await sheetsApi.post("solicitud_crear", payload, { user_email: user?.email || "" });
      Alert.alert("Solicitud creada", "La solicitud de uso se ha enviado correctamente.");
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

  const resolver = async (item, estado) => {
    if (!allowed) {
      Alert.alert("Permisos insuficientes", "Solo RESPONSABLE o GESTOR pueden resolver solicitudes.");
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
        const itemStart = combineDateTime_(item?.fecha_inicio, item?.hora_inicio);
        const itemEnd = combineDateTime_(item?.fecha_fin, item?.hora_fin);
        const conflict = approvedRows
          .map(parseItem_)
          .find((x) => {
            if (String(x?.id_solicitud || "") === String(item?.id_solicitud || "")) return false;
            if (String(x?.matricula || "").trim().toUpperCase() !== currentMat) return false;
            return rangesOverlap_(itemStart, itemEnd, combineDateTime_(x?.fecha_inicio, x?.hora_inicio), combineDateTime_(x?.fecha_fin, x?.hora_fin));
          });
        if (conflict) {
          Alert.alert(
            "Solape detectado",
            `Ya existe una solicitud APROBADA para ${currentMat} en ese rango (${conflict.fecha_inicio || "-"} ${conflict.hora_inicio || ""} → ${conflict.fecha_fin || "-"} ${conflict.hora_fin || ""})`
          );
          return;
        }
      }

      await sheetsApi.post(
        "solicitud_resolver",
        {
          id_solicitud: item.id_solicitud,
          estado: estado,
          resuelto_por_email: user?.email || "",
        },
        { user_email: user?.email || "" }
      );
      await load();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo resolver la solicitud.");
    }
  };

  const availabilityForRange_ = (start, end) => {
    const approved = items.filter((x) => x.estado === "APROBADA");
    const pool =
      vehiculoFiltro === "TODOS"
        ? vehiclesCatalog
        : vehiclesCatalog.filter((v) => String(v?.matricula || "").trim().toUpperCase() === vehiculoFiltro);
    const available = [];
    const busy = [];
    for (const v of pool) {
      const mat = String(v?.matricula || "").trim().toUpperCase();
      if (!mat) continue;
      const overlap = approved.find((x) => {
        const reqMat = String(x?.matricula || "").trim().toUpperCase();
        if (reqMat !== mat) return false;
        const reqStart = combineDateTime_(x?.fecha_inicio, x?.hora_inicio);
        const reqEnd = combineDateTime_(x?.fecha_fin, x?.hora_fin);
        if (!reqStart || !reqEnd) return false;
        return rangesOverlap_(start, end, reqStart, reqEnd);
      });
      if (overlap) busy.push({ ...v, overlap });
      else available.push(v);
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

    const approved = items.filter((x) => x.estado === "APROBADA");
    const available = [];
    const busy = [];
    for (const v of vehiclesCatalog) {
      const mat = String(v?.matricula || "").trim().toUpperCase();
      if (!mat) continue;
      const overlaps = approved.some((x) => {
        const reqMat = String(x?.matricula || "").trim().toUpperCase();
        if (reqMat !== mat) return false;
        const reqStart = combineDateTime_(x?.fecha_inicio, x?.hora_inicio);
        const reqEnd = combineDateTime_(x?.fecha_fin, x?.hora_fin);
        if (!reqStart || !reqEnd) return false;
        return rangesOverlap_(start, end, reqStart, reqEnd);
      });
      if (overlaps) busy.push(v);
      else available.push(v);
    }

    setDispResult({
      from: fromRaw,
      to: toRaw,
      fromHour: fromHourRaw,
      toHour: toHourRaw,
      available,
      busy,
    });
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.navigate("Menu")} />
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Vista</Text>
        <View style={styles.row}>
          <Pressable style={[styles.buttonSecondary, styles.flex1, vista === "SOLICITUDES" && styles.buttonActive]} onPress={() => setVista("SOLICITUDES")}>
            <Text style={styles.buttonText}>Solicitudes</Text>
          </Pressable>
          <Pressable style={[styles.buttonSecondary, styles.flex1, vista === "CALENDARIO" && styles.buttonActive]} onPress={() => setVista("CALENDARIO")}>
            <Text style={styles.buttonText}>Calendario</Text>
          </Pressable>
          <Pressable style={[styles.buttonSecondary, styles.flex1, vista === "DISPONIBILIDADES" && styles.buttonActive]} onPress={() => setVista("DISPONIBILIDADES")}>
            <Text style={styles.buttonText}>Disponibilidades</Text>
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
                ...matriculas.map((m) => ({ value: m, label: m })),
              ]}
            />
            <View style={styles.row}>
              <View style={styles.flex1}>
                <TextField label="Fecha inicio" value={fechaInicio} onChangeText={setFechaInicio} placeholder="dd/mm/aaaa" />
              </View>
              <View style={styles.flex1}>
                <TextField label="Hora inicio" value={horaInicio} onChangeText={setHoraInicio} placeholder="HH:mm" />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.flex1}>
                <TextField label="Fecha fin" value={fechaFin} onChangeText={setFechaFin} placeholder="dd/mm/aaaa" />
              </View>
              <View style={styles.flex1}>
                <TextField label="Hora fin" value={horaFin} onChangeText={setHoraFin} placeholder="HH:mm" />
              </View>
            </View>
            <TextField label="Motivo" value={motivo} onChangeText={setMotivo} placeholder="Describe el uso previsto" />
            <Pressable style={[styles.button, creating && { opacity: 0.7 }]} onPress={crearSolicitud} disabled={creating}>
              <Text style={styles.buttonTextSmall}>{creating ? "Enviando..." : "Crear solicitud"}</Text>
            </Pressable>
            {!allowed ? (
              <Text style={[styles.message, { marginTop: 8 }]}>Tu rol puede crear solicitudes. La aprobación/rechazo la hacen RESPONSABLE o GESTOR.</Text>
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
      ) : vista === "CALENDARIO" ? (
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
                    setDayDetailModal({
                      visible: true,
                      title: `${dd}/${mm}/${yyyy}`,
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
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Disponibilidades</Text>
          <TextField label="Fecha desde" value={dispDesde} onChangeText={setDispDesde} placeholder="dd/mm/aaaa" />
          <TextField label="Hora desde (opcional)" value={dispHoraDesde} onChangeText={setDispHoraDesde} placeholder="HH:mm" />
          <TextField label="Fecha hasta" value={dispHasta} onChangeText={setDispHasta} placeholder="dd/mm/aaaa" />
          <TextField label="Hora hasta (opcional)" value={dispHoraHasta} onChangeText={setDispHoraHasta} placeholder="HH:mm" />
          <Pressable style={styles.button} onPress={calcularDisponibilidades}>
            <Text style={styles.buttonTextSmall}>Comprobar disponibilidades</Text>
          </Pressable>
          {dispResult ? (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.message}>
                Rango: {dispResult.from} {dispResult.fromHour || ""} → {dispResult.to} {dispResult.toHour || ""}
              </Text>
              <Text style={styles.message}>Disponibles: {dispResult.available.length}</Text>
              {dispResult.available.map((v) => (
                <Text key={`ok-${v.matricula}`} style={styles.okText}>
                  {v.matricula}{v.modelo ? ` · ${v.modelo}` : ""}
                </Text>
              ))}
              <Text style={[styles.message, { marginTop: 8 }]}>No disponibles: {dispResult.busy.length}</Text>
              {dispResult.busy.map((v) => (
                <Text key={`busy-${v.matricula}`} style={styles.warnText}>
                  {v.matricula}{v.modelo ? ` · ${v.modelo}` : ""}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      )}

      {loading ? <Text style={styles.message}>Cargando...</Text> : null}

      {vista === "SOLICITUDES"
        ? filtered.map((x) => (
            <View key={x.id_solicitud || `${x.trabajador_email}-${x.matricula}-${x.fecha_inicio}-${x.hora_inicio}`} style={styles.card}>
              <Text style={styles.sectionTitle}>{x.matricula || "Sin matrícula"} · {x.estado}</Text>
              <Text style={styles.message}>{x.trabajador_nombre || "-"}</Text>
              <Text style={styles.message}>{x.trabajador_email || "-"}</Text>
              <Text style={styles.message}>
                {x.fecha_inicio || "-"} {x.hora_inicio || ""} → {x.fecha_fin || "-"} {x.hora_fin || ""}
              </Text>
              <Text style={styles.message}>{x.motivo || "-"}</Text>
              {x.estado === "RECHAZADA" && x.motivo_rechazo ? <Text style={styles.message}>Motivo rechazo: {x.motivo_rechazo}</Text> : null}
              {allowed && x.estado === "PENDIENTE" ? (
                <View style={styles.row}>
                  <Pressable style={styles.button} onPress={() => resolver(x, "APROBADA")}>
                    <Text style={styles.buttonTextSmall}>Aprobar</Text>
                  </Pressable>
                  <Pressable style={styles.buttonDanger} onPress={() => resolver(x, "RECHAZADA")}>
                    <Text style={styles.buttonTextSmall}>Rechazar</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))
        : vista === "CALENDARIO"
          ? null
          : null}

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
            <ScrollView style={{ maxHeight: 160 }}>
              {dayDetailModal.available.map((v) => (
                <Text key={`disp-${v.matricula}`} style={styles.okText}>
                  {v.matricula}{v.modelo ? ` · ${v.modelo}` : ""}
                </Text>
              ))}
              {dayDetailModal.available.length === 0 ? <Text style={styles.message}>Sin vehículos disponibles</Text> : null}
            </ScrollView>

            <Text style={[styles.modalSub, { marginTop: 8 }]}>Ocupados: {dayDetailModal.busy.length}</Text>
            <ScrollView style={{ maxHeight: 180 }}>
              {dayDetailModal.busy.map((v) => (
                <Pressable
                  key={`busy-${v.matricula}`}
                  onPress={() =>
                    setBusyDetailModal({
                      visible: true,
                      vehicle: v,
                    })
                  }
                >
                  <Text style={styles.warnText}>
                    {v.matricula}
                    {v.modelo ? ` · ${v.modelo}` : ""} ({v?.overlap?.hora_inicio || "--:--"}-{v?.overlap?.hora_fin || "--:--"})
                  </Text>
                </Pressable>
              ))}
              {dayDetailModal.busy.length === 0 ? <Text style={styles.message}>Sin vehículos ocupados</Text> : null}
            </ScrollView>

            <Pressable style={[styles.buttonSecondary, { marginTop: 10 }]} onPress={() => setDayDetailModal((p) => ({ ...p, visible: false }))}>
              <Text style={styles.buttonTextSmall}>Cerrar</Text>
            </Pressable>
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
              {busyDetailModal.vehicle?.matricula || "-"}
              {busyDetailModal.vehicle?.modelo ? ` · ${busyDetailModal.vehicle.modelo}` : ""}
            </Text>
            <Text style={styles.message}>Estado: {busyDetailModal.vehicle?.overlap?.estado || "-"}</Text>
            <Text style={styles.message}>
              Horario: {busyDetailModal.vehicle?.overlap?.fecha_inicio || "-"} {busyDetailModal.vehicle?.overlap?.hora_inicio || "--:--"} →{" "}
              {busyDetailModal.vehicle?.overlap?.fecha_fin || "-"} {busyDetailModal.vehicle?.overlap?.hora_fin || "--:--"}
            </Text>
            <Text style={styles.message}>
              Usuario: {busyDetailModal.vehicle?.overlap?.trabajador_nombre || "-"} · {busyDetailModal.vehicle?.overlap?.trabajador_email || "-"}
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
  row: { flexDirection: "row", gap: 8 },
  flex1: { flex: 1 },
  button: { flex: 1, marginTop: 6, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 10 },
  buttonDanger: { flex: 1, marginTop: 6, backgroundColor: "#9a3e3e", borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: "#d06b6b" },
  buttonSecondary: { marginTop: 2, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.border },
  buttonActive: { borderColor: "#5fb7ff", borderWidth: 1 },
  buttonText: { color: theme.colors.text, fontWeight: "900" },
  buttonTextSmall: { color: theme.colors.text, fontWeight: "800", fontSize: 11 },
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
});
