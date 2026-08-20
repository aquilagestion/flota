import React, { useContext, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { canRecordExpenseOnBehalf } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { DateField, SelectField, TextField } from "../ui/form/Fields";
import { formatDateEsValue, normalizeDateToDmy } from "../../flotaWeb/lib/format";
import { compareViajesPorFechas_, sortViajesPorFechas_ } from "../../flotaWeb/lib/viajesSort";
import { theme } from "../ui/theme";

function mapProjectOptions_(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  for (const r of list) {
    const entries = Object.entries(r || {});
    const values = entries.map(([, v]) => String(v || "").trim());
    const colB = values.length >= 2 ? values[1] : "";
    const value = String(r?.id_proyecto || r?.id || (values.length ? values[0] : "")).trim();
    const label = String(r?.nombre_proyecto || r?.nombre || r?.proyecto || colB).trim();
    if (!value || !label) continue;
    if (!out.find((x) => x.value === value)) out.push({ value, label });
  }
  return out;
}

function fmtMoney_(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return "0,00";
  return x.toFixed(2).replace(".", ",");
}

function todayDmy_() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function notify_(title, body) {
  const msg = body ? `${title}\n\n${body}` : String(title || "");
  if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.alert === "function") {
    window.alert(msg);
    return;
  }
  Alert.alert(title, body);
}

const initialForm = {
  tipo_vehiculo: "PROPIO",
  matricula: "",
  fecha_viaje: todayDmy_(),
  origen: "",
  destino: "",
  km_inicial: "",
  id_proyecto: "",
  work_package: "",
  accion: "",
  dni: "",
  motivo: "",
};

function TripCard_({ trip, onDetail, onAddExpense, onClose, onEditClosed, onReopen, onDelete }) {
  const estado = String(trip?.estado || "").trim().toUpperCase();
  const cerrado = estado === "CERRADO";
  return (
    <View style={[styles.row, cerrado ? styles.rowClosed : styles.rowOpen]}>
      <View style={styles.rowBadgeRow}>
        <Text style={[styles.badge, cerrado ? styles.badgeClosed : styles.badgeOpen]}>
          {cerrado ? "CERRADO" : "ABIERTO"}
        </Text>
      </View>
      <Text style={styles.rowTitle}>{String(trip?.id_viaje || "Viaje")}</Text>
      <Text style={styles.rowSub}>
        {formatDateEsValue(trip?.fecha_viaje)} · {String(trip?.matricula || "")}
      </Text>
      <Text style={styles.rowSub}>
        {String(trip?.origen || "")} → {String(trip?.destino || "")}
      </Text>
      <Text style={styles.rowSub}>
        Km: {String(trip?.km_inicial || "0")}
        {cerrado ? ` → ${String(trip?.km_final || "0")}` : ""}
      </Text>
      {cerrado ? (
        <Text style={styles.rowSub}>Cierre: {formatDateEsValue(trip?.fecha_cierre) || "—"}</Text>
      ) : null}
      {cerrado ? (
        <Text style={styles.rowAmount}>Total: {fmtMoney_(trip?.importe_total)} EUR</Text>
      ) : (
        <Text style={styles.rowAmount}>En curso</Text>
      )}
      <View style={styles.actions}>
        <Pressable style={styles.actionBtn} onPress={() => onDetail(trip)}>
          <Text style={styles.actionText}>Detalle</Text>
        </Pressable>
        {!cerrado ? (
          <>
            <Pressable style={styles.actionBtn} onPress={() => onAddExpense(trip)}>
              <Text style={styles.actionText}>Añadir gasto</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.actionWarn]} onPress={() => onClose(trip)}>
              <Text style={styles.actionText}>Cerrar viaje</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={styles.actionBtn} onPress={() => onEditClosed(trip)}>
              <Text style={styles.actionText}>Editar viaje</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.actionReopen]} onPress={() => onReopen(trip)}>
              <Text style={styles.actionText}>Reabrir viaje</Text>
            </Pressable>
          </>
        )}
        <Pressable style={[styles.actionBtn, styles.actionDanger]} onPress={() => onDelete(trip)}>
          <Text style={styles.actionText}>Eliminar</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function OwnVehicleTripsScreen({ navigation }) {
  const { user, role } = useContext(AuthContext);
  const canOnBehalf = canRecordExpenseOnBehalf(role);
  const { width } = useWindowDimensions();
  const twoCol = width >= 900;
  const [form, setForm] = useState(initialForm);
  const [projects, setProjects] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [tripToClose, setTripToClose] = useState(null);
  const [closeForm, setCloseForm] = useState({
    matricula: "",
    fecha_viaje: todayDmy_(),
    origen: "",
    destino: "",
    km_inicial: "",
    km_final: "",
    fecha_cierre: todayDmy_(),
    id_proyecto: "",
    work_package: "",
    accion: "",
    dni: "",
    motivo: "",
  });
  const [editClosedModal, setEditClosedModal] = useState(false);
  const [tripToEditClosed, setTripToEditClosed] = useState(null);
  const [editForm, setEditForm] = useState({
    matricula: "",
    fecha_viaje: todayDmy_(),
    origen: "",
    destino: "",
    km_inicial: "",
    km_final: "",
    fecha_cierre: todayDmy_(),
    id_proyecto: "",
    work_package: "",
    accion: "",
    dni: "",
    motivo: "",
  });
  const [savingClosedEdit, setSavingClosedEdit] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** Vacío = grabar a nombre propio; GESTOR/ADMINISTRACIÓN pueden elegir otro titular. */
  const [onBehalfEmail, setOnBehalfEmail] = useState("");
  const [userOptions, setUserOptions] = useState([]);
  const myEmail = String(user?.email || "").trim().toLowerCase();
  /** Titular al crear/cerrar viajes (propio si no hay selección explícita). */
  const titularEmailForAction = String(onBehalfEmail || myEmail).trim().toLowerCase();
  /** Filtro de lista: vacío → gestor/admin ve todos; usuario normal → solo los suyos. */
  const listTitularFilter = String(onBehalfEmail || "").trim().toLowerCase();

  const setEdit = (key, value) => setEditForm((p) => ({ ...p, [key]: value }));
  const setClose = (key, value) => setCloseForm((p) => ({ ...p, [key]: value }));

  const tripFormFromTrip_ = (trip, extras = {}) => ({
    matricula: String(trip?.matricula || "").trim().toUpperCase(),
    fecha_viaje: normalizeDateToDmy(trip?.fecha_viaje) || todayDmy_(),
    origen: String(trip?.origen || "").trim(),
    destino: String(trip?.destino || "").trim(),
    km_inicial: String(trip?.km_inicial ?? "").trim(),
    km_final: String(trip?.km_final ?? "").trim(),
    fecha_cierre: normalizeDateToDmy(trip?.fecha_cierre) || todayDmy_(),
    id_proyecto: String(trip?.id_proyecto || "").trim(),
    work_package: String(trip?.work_package || "").trim(),
    accion: String(trip?.accion || trip?.accion_proyecto || "").trim(),
    dni: String(trip?.dni || "").trim().toUpperCase(),
    motivo: String(trip?.motivo || "").trim(),
    ...extras,
  });

  const projectOptions = useMemo(() => projects, [projects]);
  const fleetOptions = useMemo(
    () =>
      fleet.map((v) => {
        const mat = String(v?.matricula || "").trim().toUpperCase();
        const marca = String(v?.marca || "").trim();
        const modelo = String(v?.modelo || "").trim();
        return {
          value: mat,
          label: [mat, marca, modelo].filter(Boolean).join(" · "),
        };
      }),
    [fleet]
  );

  const openTrips = useMemo(
    () =>
      trips
        .filter((t) => String(t?.estado || "").trim().toUpperCase() !== "CERRADO")
        .sort(compareViajesPorFechas_),
    [trips]
  );
  const closedTrips = useMemo(
    () =>
      trips
        .filter((t) => String(t?.estado || "").trim().toUpperCase() === "CERRADO")
        .sort(compareViajesPorFechas_),
    [trips]
  );

  const titularDisplayName_ = React.useCallback(() => {
    if (titularEmailForAction === myEmail) {
      return String(user?.displayName || user?.nombre || myEmail).trim() || myEmail;
    }
    const opt = userOptions.find((u) => u.value === titularEmailForAction);
    if (opt?.nombre) return opt.nombre;
    const lbl = String(opt?.label || "").trim();
    const m = lbl.match(/^(.+?)\s*\(/);
    return (m ? m[1].trim() : lbl) || titularEmailForAction;
  }, [titularEmailForAction, myEmail, user?.displayName, user?.nombre, userOptions]);

  const loadData = React.useCallback(async () => {
    if (!myEmail) return;
    setLoading(true);
    try {
      const listParams = { user_email: myEmail };
      if (listTitularFilter) {
        listParams.usuario_email = listTitularFilter;
      } else if (!canOnBehalf) {
        listParams.usuario_email = myEmail;
      }
      const [tRes, fRes] = await Promise.all([
        sheetsApi.get("viaje_vehiculo_propio_list", listParams),
        sheetsApi.get("flota_list", { user_email: myEmail }),
      ]);
      let pRows = [];
      try {
        const pRes = await sheetsApi.get("proyecto_list_columna_b", { solo_activos: "SI", user_email: myEmail });
        pRows = Array.isArray(pRes?.data) ? pRes.data : Array.isArray(pRes) ? pRes : [];
      } catch {
        const pRes = await sheetsApi.get("proyecto_list", { solo_activos: "SI", user_email: myEmail });
        pRows = Array.isArray(pRes?.data) ? pRes.data : Array.isArray(pRes) ? pRes : [];
      }
      const tRows = Array.isArray(tRes?.data) ? tRes.data : Array.isArray(tRes) ? tRes : [];
      const fRows = Array.isArray(fRes?.data) ? fRes.data : Array.isArray(fRes) ? fRes : [];
      const fleetMapped = fRows
        .map((v) => ({
          matricula: String(v?.matricula || "").trim().toUpperCase(),
          marca: String(v?.marca || "").trim(),
          modelo: String(v?.modelo || "").trim(),
        }))
        .filter((v) => v.matricula);
      setFleet(fleetMapped);
      setProjects(mapProjectOptions_(pRows));
      setTrips(sortViajesPorFechas_(tRows));
    } catch (e) {
      notify_("Error", e?.message || "No se pudieron cargar viajes/proyectos.");
    } finally {
      setLoading(false);
    }
  }, [myEmail, listTitularFilter, canOnBehalf]);

  const loadUserOptions_ = React.useCallback(async () => {
    if (!canOnBehalf || !myEmail) {
      setUserOptions([]);
      return;
    }
    try {
      const res = await sheetsApi.get("usuarios_list", { user_email: myEmail });
      const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      const users = rows
        .map((u) => {
          const email = String(u?.email || "").trim().toLowerCase();
          const nombre = String(u?.nombre || u?.displayName || u?.name || "").trim();
          const activo = String(u?.activo || u?.estado || "SI").trim().toUpperCase();
          if (!email) return null;
          if (activo === "NO" || activo === "FALSE" || activo === "0" || activo === "INACTIVO") return null;
          return {
            value: email,
            label: nombre ? `${nombre} (${email})` : email,
            nombre,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
      setUserOptions(users);
    } catch {
      setUserOptions([]);
    }
  }, [canOnBehalf, myEmail]);

  useFocusEffect(
    React.useCallback(() => {
      loadUserOptions_();
      loadData();
    }, [loadData, loadUserOptions_])
  );

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const validateForm = () => {
    const missing = [];
    if (String(form.tipo_vehiculo || "PROPIO").toUpperCase() === "ORGANIZACION") {
      if (!String(form.matricula || "").trim()) missing.push("Vehículo organización");
    } else if (!String(form.matricula || "").trim()) {
      missing.push("Matrícula");
    }
    if (!String(form.fecha_viaje || "").trim()) missing.push("Fecha");
    if (!String(form.origen || "").trim()) missing.push("Origen");
    if (!String(form.destino || "").trim()) missing.push("Destino");
    if (!String(form.km_inicial || "").trim()) missing.push("Km inicial");
    if (!String(form.id_proyecto || "").trim()) missing.push("Proyecto");
    if (missing.length) return missing;
    const kmIni = Number(String(form.km_inicial || "").replace(",", "."));
    if (!Number.isFinite(kmIni) || kmIni < 0) return ["Km inicial inválido"];
    return [];
  };

  const createTrip = async () => {
    if (saving) return;
    const missing = validateForm();
    if (missing.length) {
      notify_("Faltan datos", missing.join("\n"));
      return;
    }
    try {
      setSaving(true);
      const p = projectOptions.find((x) => x.value === form.id_proyecto);
      const tipoVehiculo = String(form.tipo_vehiculo || "PROPIO").trim().toUpperCase();
      const fechaViaje = normalizeDateToDmy(form.fecha_viaje);
      if (!fechaViaje || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaViaje)) {
        notify_("Fecha inválida", "Selecciona una fecha válida (dd/mm/aaaa).");
        return;
      }
      await sheetsApi.postWebSafe(
        "viaje_vehiculo_propio_crear",
        {
          user_email: myEmail,
          usuario_email: titularEmailForAction,
          usuario_nombre: titularDisplayName_(),
          matricula: String(form.matricula || "").trim().toUpperCase(),
          tipo_vehiculo: tipoVehiculo,
          fecha_viaje: fechaViaje,
          origen: form.origen,
          destino: form.destino,
          km_inicial: Number(String(form.km_inicial || "").replace(",", ".")),
          id_proyecto: form.id_proyecto,
          proyecto_nombre: p?.label || "",
          work_package: String(form.work_package || "").trim(),
          accion: String(form.accion || "").trim(),
          dni: String(form.dni || "").trim().toUpperCase(),
          motivo: form.motivo,
        },
        { user_email: myEmail }
      );
      setForm({ ...initialForm, fecha_viaje: todayDmy_() });
      await loadData();
      notify_("Viaje creado", "Ya puedes añadir gastos y cerrar el viaje al finalizar.");
    } catch (e) {
      notify_("Error", e?.message || "No se pudo crear el viaje.");
    } finally {
      setSaving(false);
    }
  };

  const openCloseTrip = (trip) => {
    setTripToClose(trip);
    setCloseForm(
      tripFormFromTrip_(trip, {
        km_final: "",
        fecha_cierre: todayDmy_(),
      })
    );
    setClosing(false);
    setCloseModal(true);
  };

  const dismissCloseModal = () => {
    if (closing) return;
    setCloseModal(false);
    setTripToClose(null);
  };

  const closeTrip = async () => {
    const id = String(tripToClose?.id_viaje || "").trim();
    if (!id) return;
    if (!String(closeForm.matricula || "").trim()) {
      notify_("Matrícula obligatoria", "Indica la matrícula del viaje.");
      return;
    }
    if (!String(closeForm.origen || "").trim() || !String(closeForm.destino || "").trim()) {
      notify_("Origen/destino", "Indica origen y destino.");
      return;
    }
    const kmIni = Number(String(closeForm.km_inicial || "").replace(",", "."));
    if (!Number.isFinite(kmIni) || kmIni < 0) {
      notify_("Km inicial inválido", "Introduce un valor numérico válido.");
      return;
    }
    const kmRaw = String(closeForm.km_final || "").trim();
    if (!kmRaw) {
      notify_("Km final obligatorio", "Introduce los kilómetros finales del viaje.");
      return;
    }
    const km = Number(kmRaw.replace(",", "."));
    if (!Number.isFinite(km) || km < 0) {
      notify_("Km final inválido", "Introduce un valor numérico válido.");
      return;
    }
    if (km < kmIni) {
      notify_("Km final inválido", `El km final no puede ser menor que el km inicial (${kmIni}).`);
      return;
    }
    const fechaViajeNorm = normalizeDateToDmy(closeForm.fecha_viaje);
    if (!fechaViajeNorm || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaViajeNorm)) {
      notify_("Fecha de inicio inválida", "Selecciona una fecha válida (dd/mm/aaaa).");
      return;
    }
    const fechaCierreNorm = normalizeDateToDmy(closeForm.fecha_cierre);
    if (!fechaCierreNorm || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaCierreNorm)) {
      notify_("Fecha de cierre inválida", "Selecciona una fecha válida (dd/mm/aaaa).");
      return;
    }
    const p = projectOptions.find((x) => x.value === closeForm.id_proyecto);
    const matClose = String(closeForm.matricula || "").trim().toUpperCase();
    const tipoClose = fleetOptions.some((x) => x.value === matClose) ? "ORGANIZACION" : "PROPIO";
    try {
      setClosing(true);
      await sheetsApi.postWebSafe(
        "viaje_vehiculo_propio_cerrar",
        {
          id_viaje: id,
          matricula: matClose,
          tipo_vehiculo: tipoClose,
          fecha_viaje: fechaViajeNorm,
          origen: String(closeForm.origen || "").trim(),
          destino: String(closeForm.destino || "").trim(),
          km_inicial: kmIni,
          km_final: km,
          fecha_cierre: fechaCierreNorm,
          id_proyecto: String(closeForm.id_proyecto || "").trim(),
          proyecto_nombre: p?.label || String(tripToClose?.proyecto_nombre || "").trim(),
          work_package: String(closeForm.work_package || "").trim(),
          accion: String(closeForm.accion || "").trim(),
          dni: String(closeForm.dni || "").trim().toUpperCase(),
          motivo: String(closeForm.motivo || "").trim(),
          user_email: myEmail,
        },
        { user_email: myEmail }
      );
      setCloseModal(false);
      setTripToClose(null);
      await loadData();
      notify_(
        "Viaje cerrado",
        `Se han guardado los datos del viaje.\nFecha fin (hoja de gasto): ${fechaCierreNorm}`
      );
    } catch (e) {
      notify_("Error", e?.message || "No se pudo cerrar el viaje.");
    } finally {
      setClosing(false);
    }
  };

  const addTripExpense = (trip) => {
    navigation.navigate("Gasto", {
      idViajePropio: String(trip?.id_viaje || "").trim(),
      viajeContext: {
        matricula: String(trip?.matricula || "").trim().toUpperCase(),
        proyecto_nombre: String(trip?.proyecto_nombre || "").trim(),
      },
      onBehalfEmail: onBehalfEmail || "",
    });
  };

  const openEditClosedTrip = (trip) => {
    setTripToEditClosed(trip);
    setEditForm(tripFormFromTrip_(trip));
    setSavingClosedEdit(false);
    setEditClosedModal(true);
  };

  const dismissEditClosedModal = () => {
    if (savingClosedEdit) return;
    setEditClosedModal(false);
    setTripToEditClosed(null);
  };

  const saveClosedTripEdit = async () => {
    const id = String(tripToEditClosed?.id_viaje || "").trim();
    if (!id) return;
    if (!String(editForm.matricula || "").trim()) {
      notify_("Matrícula obligatoria", "Indica la matrícula del viaje.");
      return;
    }
    if (!String(editForm.origen || "").trim() || !String(editForm.destino || "").trim()) {
      notify_("Origen/destino", "Indica origen y destino.");
      return;
    }
    const kmIni = Number(String(editForm.km_inicial || "").replace(",", "."));
    if (!Number.isFinite(kmIni) || kmIni < 0) {
      notify_("Km inicial inválido", "Introduce un valor numérico válido.");
      return;
    }
    const kmRaw = String(editForm.km_final || "").trim();
    if (!kmRaw) {
      notify_("Km final obligatorio", "Introduce los kilómetros finales del viaje.");
      return;
    }
    const km = Number(kmRaw.replace(",", "."));
    if (!Number.isFinite(km) || km < 0) {
      notify_("Km final inválido", "Introduce un valor numérico válido.");
      return;
    }
    if (km < kmIni) {
      notify_("Km final inválido", `El km final no puede ser menor que el km inicial (${kmIni}).`);
      return;
    }
    const fechaViajeNorm = normalizeDateToDmy(editForm.fecha_viaje);
    if (!fechaViajeNorm || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaViajeNorm)) {
      notify_("Fecha de inicio inválida", "Selecciona una fecha válida (dd/mm/aaaa).");
      return;
    }
    const fechaCierreNorm = normalizeDateToDmy(editForm.fecha_cierre);
    if (!fechaCierreNorm || !/^\d{2}\/\d{2}\/\d{4}$/.test(fechaCierreNorm)) {
      notify_("Fecha de cierre inválida", "Selecciona una fecha válida (dd/mm/aaaa).");
      return;
    }
    const p = projectOptions.find((x) => x.value === editForm.id_proyecto);
    const matEdit = String(editForm.matricula || "").trim().toUpperCase();
    const tipoEdit = fleetOptions.some((x) => x.value === matEdit) ? "ORGANIZACION" : "PROPIO";
    try {
      setSavingClosedEdit(true);
      await sheetsApi.postWebSafe(
        "viaje_vehiculo_propio_actualizar",
        {
          id_viaje: id,
          matricula: matEdit,
          tipo_vehiculo: tipoEdit,
          fecha_viaje: fechaViajeNorm,
          origen: String(editForm.origen || "").trim(),
          destino: String(editForm.destino || "").trim(),
          km_inicial: kmIni,
          km_final: km,
          fecha_cierre: fechaCierreNorm,
          id_proyecto: String(editForm.id_proyecto || "").trim(),
          proyecto_nombre: p?.label || String(tripToEditClosed?.proyecto_nombre || "").trim(),
          work_package: String(editForm.work_package || "").trim(),
          accion: String(editForm.accion || "").trim(),
          dni: String(editForm.dni || "").trim().toUpperCase(),
          motivo: String(editForm.motivo || "").trim(),
          user_email: myEmail,
        },
        { user_email: myEmail }
      );
      setEditClosedModal(false);
      setTripToEditClosed(null);
      await loadData();
      notify_(
        "Viaje actualizado",
        "Se han guardado todos los datos del viaje. Sigue CERRADO. Las hojas nuevas usarán Fecha Inicio/Fin actualizadas."
      );
    } catch (e) {
      notify_("Error", e?.message || "No se pudo actualizar el viaje.");
    } finally {
      setSavingClosedEdit(false);
    }
  };

  const confirmReopenTrip_ = (trip) => {
    const id = String(trip?.id_viaje || "").trim();
    if (!id) return;
    const msg =
      "El viaje volverá a ABIERTO: podrás añadir gastos y cerrarlo de nuevo.\n\n" +
      "Los gastos ya grabados se mantienen. Si eliminaste la hoja de gasto, esos gastos quedarán libres para una hoja nueva.";
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
      if (window.confirm(`Reabrir viaje\n\n${msg}`)) reopenTrip(trip);
      return;
    }
    Alert.alert("Reabrir viaje", msg, [
      { text: "Cancelar", style: "cancel" },
      { text: "Reabrir", onPress: () => reopenTrip(trip) },
    ]);
  };

  const reopenTrip = async (trip) => {
    const id = String(trip?.id_viaje || "").trim();
    if (!id || reopening) return;
    try {
      setReopening(true);
      await sheetsApi.postWebSafe(
        "viaje_vehiculo_propio_reabrir",
        { id_viaje: id, user_email: myEmail },
        { user_email: myEmail }
      );
      await loadData();
      notify_(
        "Viaje reabierto",
        "Ya puedes pulsar «Añadir gasto». Cuando termines, ciérralo otra vez y crea la hoja de gastos."
      );
    } catch (e) {
      notify_("Error", e?.message || "No se pudo reabrir el viaje.");
    } finally {
      setReopening(false);
    }
  };

  const confirmDeleteTrip_ = (trip) => {
    const id = String(trip?.id_viaje || "").trim();
    if (!id) return;
    const msg =
      "Se eliminará el viaje de forma permanente.\n\n" +
      "Solo es posible si no tiene ningún gasto asignado. Si tiene gastos, el sistema lo rechazará.";
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
      if (window.confirm(`Eliminar viaje ${id}\n\n${msg}`)) deleteTrip(trip);
      return;
    }
    Alert.alert(`Eliminar viaje ${id}`, msg, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => deleteTrip(trip) },
    ]);
  };

  const deleteTrip = async (trip) => {
    const id = String(trip?.id_viaje || "").trim();
    if (!id || deleting) return;
    try {
      setDeleting(true);
      await sheetsApi.postWebSafe(
        "viaje_vehiculo_propio_eliminar",
        { id_viaje: id, user_email: myEmail },
        { user_email: myEmail }
      );
      await loadData();
      notify_("Viaje eliminado", `Se ha eliminado el viaje ${id}.`);
    } catch (e) {
      notify_("No se pudo eliminar", e?.message || "Error al eliminar el viaje.");
    } finally {
      setDeleting(false);
    }
  };

  const showTripDetail = async (trip) => {
    const id = String(trip?.id_viaje || "").trim();
    if (!id) return;
    try {
      const res = await sheetsApi.get("viaje_vehiculo_propio_detalle", { id_viaje: id, user_email: myEmail });
      const data = res?.data || res || {};
      const gastos = Array.isArray(data?.gastos) ? data.gastos : [];
      notify_(
        `Viaje ${id}`,
        `Estado: ${String(data?.viaje?.estado || trip?.estado || "")}\n` +
          `Gastos asociados: ${gastos.length}\n` +
          `Importe km: ${fmtMoney_(data?.viaje?.importe_km)} €\n` +
          `Importe gastos: ${fmtMoney_(data?.viaje?.importe_gastos)} €\n` +
          `Total: ${fmtMoney_(data?.viaje?.importe_total)} €`
      );
    } catch (e) {
      notify_("Error", e?.message || "No se pudo obtener el detalle.");
    }
  };

  const formBlock = (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Grabar viaje</Text>
      {canOnBehalf ? (
        <SelectField
          label="GRABAR A NOMBRE DE"
          required={false}
          value={onBehalfEmail}
          onChange={(v) => {
            const next = String(v || "").trim().toLowerCase();
            setOnBehalfEmail(next === myEmail ? "" : next);
          }}
          options={[
            { value: "", label: myEmail ? `Yo (${myEmail})` : "Yo (usuario actual)" },
            ...userOptions.filter((u) => u.value !== myEmail),
          ]}
        />
      ) : null}
      <SelectField
        label="Tipo de vehículo"
        required
        value={form.tipo_vehiculo}
        onChange={(v) => set("tipo_vehiculo", String(v || "PROPIO").toUpperCase())}
        options={[
          { value: "PROPIO", label: "Vehículo propio (matrícula libre)" },
          { value: "ORGANIZACION", label: "Vehículo organización (flota)" },
        ]}
      />
      {String(form.tipo_vehiculo || "PROPIO").toUpperCase() === "ORGANIZACION" ? (
        <SelectField
          label="Vehículo de la organización"
          required
          value={form.matricula}
          onChange={(v) => set("matricula", String(v || "").toUpperCase())}
          options={[
            { value: "", label: fleetOptions.length ? "Selecciona..." : "Sin vehículos en FLOTA" },
            ...fleetOptions,
          ]}
        />
      ) : (
        <TextField
          label="Matrícula del vehículo"
          required
          value={form.matricula}
          onChangeText={(v) => set("matricula", String(v || "").toUpperCase())}
          autoCapitalize="characters"
        />
      )}
      <DateField label="Fecha" required value={form.fecha_viaje} onChange={(v) => set("fecha_viaje", v)} />
      <TextField label="Origen" required value={form.origen} onChangeText={(v) => set("origen", v)} />
      <TextField label="Destino" required value={form.destino} onChangeText={(v) => set("destino", v)} />
      <TextField
        label="Km inicial"
        required
        value={form.km_inicial}
        onChangeText={(v) => set("km_inicial", String(v || "").replace(/[^\d.,]/g, ""))}
        keyboardType="decimal-pad"
      />
      <SelectField
        label="Proyecto"
        required
        value={form.id_proyecto}
        onChange={(v) => set("id_proyecto", v)}
        options={[
          { value: "", label: projectOptions.length ? "Selecciona..." : "Sin proyectos en hoja PROYECTOS" },
          ...projectOptions,
        ]}
      />
      <TextField
        label="Work Package (opcional)"
        required={false}
        value={form.work_package}
        onChangeText={(v) => set("work_package", v)}
        placeholder="Ej: WP3 — obligatorio al crear la hoja de gastos"
      />
      <TextField
        label="Acción del proyecto (opcional)"
        required={false}
        value={form.accion}
        onChangeText={(v) => set("accion", v)}
        placeholder="Ej: A1 — obligatorio al crear la hoja de gastos"
      />
      <TextField
        label="DNI del usuario (opcional)"
        required={false}
        value={form.dni}
        onChangeText={(v) => set("dni", String(v || "").toUpperCase())}
        placeholder="Obligatorio al crear la hoja de gastos"
        autoCapitalize="characters"
      />
      <TextField
        label="Motivo (opcional)"
        required={false}
        value={form.motivo}
        onChangeText={(v) => set("motivo", v)}
        multiline
      />
      <Pressable style={[styles.primaryBtn, saving && { opacity: 0.7 }]} onPress={createTrip} disabled={saving}>
        <Text style={styles.primaryText}>{saving ? "Guardando..." : "Crear viaje"}</Text>
      </Pressable>
    </View>
  );

  const listBlock = (
    <View style={styles.listCol}>
      <Text style={styles.sectionTitle}>Viajes abiertos y cerrados</Text>
      {canOnBehalf && onBehalfEmail ? (
        <Text style={styles.meta}>Titular: {titularDisplayName_()} ({titularEmailForAction})</Text>
      ) : null}
      {loading ? <Text style={styles.meta}>Cargando...</Text> : null}

      <Text style={styles.listSection}>Abiertos ({openTrips.length})</Text>
      {deleting ? <Text style={styles.meta}>Eliminando viaje…</Text> : null}
      {openTrips.map((trip) => (
        <TripCard_
          key={String(trip?.id_viaje || Math.random())}
          trip={trip}
          onDetail={showTripDetail}
          onAddExpense={addTripExpense}
          onClose={openCloseTrip}
          onEditClosed={openEditClosedTrip}
          onReopen={confirmReopenTrip_}
          onDelete={confirmDeleteTrip_}
        />
      ))}
      {!openTrips.length && !loading ? <Text style={styles.meta}>No hay viajes abiertos.</Text> : null}

      <Text style={[styles.listSection, { marginTop: 14 }]}>Cerrados ({closedTrips.length})</Text>
      {reopening ? <Text style={styles.meta}>Reabriendo viaje…</Text> : null}
      {closedTrips.map((trip) => (
        <TripCard_
          key={String(trip?.id_viaje || Math.random())}
          trip={trip}
          onDetail={showTripDetail}
          onAddExpense={addTripExpense}
          onClose={openCloseTrip}
          onEditClosed={openEditClosedTrip}
          onReopen={confirmReopenTrip_}
          onDelete={confirmDeleteTrip_}
        />
      ))}
      {!closedTrips.length && !loading ? <Text style={styles.meta}>No hay viajes cerrados.</Text> : null}
    </View>
  );

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.title}>Grabación de viajes</Text>
        <Pressable style={styles.backBtn} onPress={() => navigation.navigate("Menu")}>
          <Text style={styles.backText}>Menú</Text>
        </Pressable>
      </View>

      <View style={[styles.columns, twoCol && styles.columnsRow]}>
        <View style={[styles.col, twoCol && styles.colHalf]}>{formBlock}</View>
        <View style={[styles.col, twoCol && styles.colHalf]}>{listBlock}</View>
      </View>

      <Modal visible={closeModal} transparent animationType="fade" onRequestClose={dismissCloseModal}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={dismissCloseModal} disabled={closing} />
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.modalCard, styles.modalCardWide]}>
              <Text style={styles.modalTitle}>Cerrar viaje</Text>
              <Text style={styles.meta}>
                Revisa y, si hace falta, corrige cualquier dato. La fecha de cierre será la Fecha Fin en la hoja de
                gasto (dd/mm/aaaa).
              </Text>
              {closing ? (
                <View style={styles.busyBox}>
                  <ActivityIndicator size="large" color="#b7ddff" />
                  <Text style={styles.meta}>Cerrando viaje…</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.meta}>Viaje: {String(tripToClose?.id_viaje || "")}</Text>
                  <TextField
                    label="Matrícula"
                    required
                    value={closeForm.matricula}
                    onChangeText={(v) => setClose("matricula", String(v || "").toUpperCase())}
                    autoCapitalize="characters"
                  />
                  <DateField
                    label="Fecha inicio (viaje)"
                    required
                    value={closeForm.fecha_viaje}
                    onChange={(v) => setClose("fecha_viaje", v)}
                  />
                  <DateField
                    label="Fecha fin / cierre (Fecha Fin en hoja de gasto)"
                    required
                    value={closeForm.fecha_cierre}
                    onChange={(v) => setClose("fecha_cierre", v)}
                  />
                  <TextField
                    label="Origen"
                    required
                    value={closeForm.origen}
                    onChangeText={(v) => setClose("origen", v)}
                  />
                  <TextField
                    label="Destino"
                    required
                    value={closeForm.destino}
                    onChangeText={(v) => setClose("destino", v)}
                  />
                  <TextField
                    label="Km inicial"
                    required
                    value={closeForm.km_inicial}
                    onChangeText={(v) => setClose("km_inicial", String(v || "").replace(/[^\d.,]/g, ""))}
                    keyboardType="decimal-pad"
                  />
                  <TextField
                    label="Km final"
                    required
                    value={closeForm.km_final}
                    onChangeText={(v) => setClose("km_final", String(v || "").replace(/[^\d.,]/g, ""))}
                    keyboardType="decimal-pad"
                    placeholder="Obligatorio para cerrar"
                  />
                  <SelectField
                    label="Proyecto"
                    required={false}
                    value={closeForm.id_proyecto}
                    onChange={(v) => setClose("id_proyecto", v)}
                    options={[
                      { value: "", label: projectOptions.length ? "Selecciona..." : "Sin proyectos" },
                      ...projectOptions,
                    ]}
                  />
                  <TextField
                    label="Work Package"
                    required={false}
                    value={closeForm.work_package}
                    onChangeText={(v) => setClose("work_package", v)}
                  />
                  <TextField
                    label="Acción del proyecto"
                    required={false}
                    value={closeForm.accion}
                    onChangeText={(v) => setClose("accion", v)}
                  />
                  <TextField
                    label="DNI"
                    required={false}
                    value={closeForm.dni}
                    onChangeText={(v) => setClose("dni", String(v || "").toUpperCase())}
                    autoCapitalize="characters"
                  />
                  <TextField
                    label="Motivo"
                    required={false}
                    value={closeForm.motivo}
                    onChangeText={(v) => setClose("motivo", v)}
                    multiline
                  />
                </>
              )}
              <View style={styles.modalActions}>
                <Pressable style={styles.modalBtnGhost} onPress={dismissCloseModal} disabled={closing}>
                  <Text style={styles.modalBtnGhostText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtnPrimary, closing && { opacity: 0.7 }]}
                  onPress={closeTrip}
                  disabled={closing}
                >
                  <Text style={styles.modalBtnPrimaryText}>{closing ? "Cerrando…" : "Confirmar cierre"}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={editClosedModal} transparent animationType="fade" onRequestClose={dismissEditClosedModal}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={dismissEditClosedModal} disabled={savingClosedEdit} />
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.modalCard, styles.modalCardWide]}>
              <Text style={styles.modalTitle}>Editar viaje cerrado</Text>
              <Text style={styles.meta}>
                Puedes modificar cualquier dato del viaje. El estado sigue CERRADO. Fechas en dd/mm/aaaa.
              </Text>
              {savingClosedEdit ? (
                <View style={styles.busyBox}>
                  <ActivityIndicator size="large" color="#b7ddff" />
                  <Text style={styles.meta}>Guardando…</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.meta}>Viaje: {String(tripToEditClosed?.id_viaje || "")}</Text>
                  <TextField
                    label="Matrícula"
                    required
                    value={editForm.matricula}
                    onChangeText={(v) => setEdit("matricula", String(v || "").toUpperCase())}
                    autoCapitalize="characters"
                  />
                  <DateField
                    label="Fecha inicio (viaje)"
                    required
                    value={editForm.fecha_viaje}
                    onChange={(v) => setEdit("fecha_viaje", v)}
                  />
                  <DateField
                    label="Fecha fin (cierre)"
                    required
                    value={editForm.fecha_cierre}
                    onChange={(v) => setEdit("fecha_cierre", v)}
                  />
                  <TextField
                    label="Origen"
                    required
                    value={editForm.origen}
                    onChangeText={(v) => setEdit("origen", v)}
                  />
                  <TextField
                    label="Destino"
                    required
                    value={editForm.destino}
                    onChangeText={(v) => setEdit("destino", v)}
                  />
                  <TextField
                    label="Km inicial"
                    required
                    value={editForm.km_inicial}
                    onChangeText={(v) => setEdit("km_inicial", String(v || "").replace(/[^\d.,]/g, ""))}
                    keyboardType="decimal-pad"
                  />
                  <TextField
                    label="Km final"
                    required
                    value={editForm.km_final}
                    onChangeText={(v) => setEdit("km_final", String(v || "").replace(/[^\d.,]/g, ""))}
                    keyboardType="decimal-pad"
                  />
                  <SelectField
                    label="Proyecto"
                    required={false}
                    value={editForm.id_proyecto}
                    onChange={(v) => setEdit("id_proyecto", v)}
                    options={[
                      { value: "", label: projectOptions.length ? "Selecciona..." : "Sin proyectos" },
                      ...projectOptions,
                    ]}
                  />
                  <TextField
                    label="Work Package"
                    required={false}
                    value={editForm.work_package}
                    onChangeText={(v) => setEdit("work_package", v)}
                  />
                  <TextField
                    label="Acción del proyecto"
                    required={false}
                    value={editForm.accion}
                    onChangeText={(v) => setEdit("accion", v)}
                  />
                  <TextField
                    label="DNI"
                    required={false}
                    value={editForm.dni}
                    onChangeText={(v) => setEdit("dni", String(v || "").toUpperCase())}
                    autoCapitalize="characters"
                  />
                  <TextField
                    label="Motivo"
                    required={false}
                    value={editForm.motivo}
                    onChangeText={(v) => setEdit("motivo", v)}
                    multiline
                  />
                </>
              )}
              <View style={styles.modalActions}>
                <Pressable style={styles.modalBtnGhost} onPress={dismissEditClosedModal} disabled={savingClosedEdit}>
                  <Text style={styles.modalBtnGhostText}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalBtnPrimary, savingClosedEdit && { opacity: 0.7 }]}
                  onPress={saveClosedTripEdit}
                  disabled={savingClosedEdit}
                >
                  <Text style={styles.modalBtnPrimaryText}>{savingClosedEdit ? "Guardando…" : "Guardar"}</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
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
  backBtn: {
    borderColor: "#4f88bf",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
    alignSelf: "center",
  },
  backText: { color: "#b7ddff", fontWeight: "800", fontSize: 12 },
  columns: { gap: 12 },
  columnsRow: { flexDirection: "row", alignItems: "flex-start" },
  col: { width: "100%" },
  colHalf: { flex: 1, minWidth: 0 },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  listCol: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  sectionTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 16, marginBottom: 8 },
  listSection: { color: theme.colors.subtext, fontWeight: "800", fontSize: 13, marginBottom: 8 },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
  },
  primaryText: { color: theme.colors.text, fontWeight: "900" },
  row: {
    backgroundColor: theme.colors.card2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 10,
  },
  rowOpen: { borderColor: "#3d7a4a" },
  rowClosed: { borderColor: theme.colors.border, opacity: 0.95 },
  rowBadgeRow: { marginBottom: 6 },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
    fontSize: 11,
    fontWeight: "900",
  },
  badgeOpen: { backgroundColor: "#1f4d2c", color: "#b8f0c4" },
  badgeClosed: { backgroundColor: "#3a3a48", color: "#c8c8d4" },
  rowTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 14 },
  rowSub: { color: theme.colors.subtext, marginTop: 4, fontSize: 12 },
  rowAmount: { color: theme.colors.text, marginTop: 6, fontWeight: "900" },
  actions: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionBtn: {
    flexGrow: 1,
    minWidth: 90,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  actionWarn: { borderColor: "#d6b260" },
  actionReopen: { borderColor: "#5a9fd4" },
  actionDanger: { borderColor: "#c45c5c" },
  actionText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  meta: { color: theme.colors.subtext, fontSize: 12, marginBottom: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: 20,
  },
  modalScroll: { maxHeight: "92%" },
  modalScrollContent: { flexGrow: 1, justifyContent: "center", paddingVertical: 8 },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    zIndex: 2,
  },
  modalCardWide: { maxWidth: 560, width: "100%", alignSelf: "center" },
  modalTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "900", marginBottom: 4 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  modalBtnGhost: { paddingVertical: 10, paddingHorizontal: 14 },
  modalBtnGhostText: { color: theme.colors.subtext, fontWeight: "800", fontSize: 15 },
  modalBtnPrimary: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  modalBtnPrimaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  busyBox: { alignItems: "center", gap: 10, paddingVertical: 16 },
});
