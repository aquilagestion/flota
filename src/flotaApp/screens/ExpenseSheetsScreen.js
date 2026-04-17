import React, { useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { AuthContext } from "../auth/AuthContext";
import { isGestor, isResponsable } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { localDb } from "../storage/localDb";
import { syncService } from "../sync/syncService";
import { DateField, TextField } from "../ui/form/Fields";
import { theme } from "../ui/theme";

let logoDataUriCache_ = null;

function sanitizeSheetToken_(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

function userDisplayName_(user) {
  const byName =
    String(user?.displayName || "").trim() ||
    String(user?.nombre || "").trim() ||
    String(user?.name || "").trim() ||
    String(user?.fullName || "").trim();
  if (byName && !byName.includes("@")) return byName;
  const email = String(user?.email || "").trim().toLowerCase();
  if (!email) return "Usuario";
  const local = String(email.split("@")[0] || "").trim();
  if (!local) return "Usuario";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function resolvedUserName_(user, preferredName) {
  const p = String(preferredName || "").trim();
  if (p && !p.includes("@")) return p;
  return userDisplayName_(user);
}

function intToRoman_(num) {
  const n = Number(num || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  const table = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let value = Math.floor(n);
  let out = "";
  for (let i = 0; i < table.length; i += 1) {
    const [unit, symbol] = table[i];
    while (value >= unit) {
      out += symbol;
      value -= unit;
    }
  }
  return out;
}

function romanToInt_(roman) {
  const s = String(roman || "").trim().toUpperCase();
  if (!s) return 0;
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  let prev = 0;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    const curr = values[s[i]] || 0;
    if (!curr) return 0;
    if (curr < prev) total -= curr;
    else {
      total += curr;
      prev = curr;
    }
  }
  return total > 0 ? total : 0;
}

function nextSheetNumber_(user, now, sheets, preferredName) {
  const nameRaw = String(resolvedUserName_(user, preferredName) || "").trim() || "Usuario";
  const nameToken = sanitizeSheetToken_(nameRaw);
  const printableName = nameToken ? nameRaw : "Usuario";
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const prefix = `${yyyy}_${mm}${dd} R.G.T. ${printableName}`;
  const list = Array.isArray(sheets) ? sheets : [];
  const usedSeq = list
    .map((s) => String(s?.num_hoja_gasto || s?.id || s?.hoja_id_local || "").trim())
    .filter((id) => id === prefix || id.startsWith(`${prefix} - `))
    .map((id) => {
      if (id === prefix) return 1;
      const suf = id.slice((`${prefix} - `).length).trim();
      const n = romanToInt_(suf);
      return n > 0 ? n : 0;
    })
    .filter((n) => n > 0);
  const seq = (usedSeq.length ? Math.max(...usedSeq) : 0) + 1;
  if (seq <= 1) return prefix;
  return `${prefix} - ${intToRoman_(seq)}`;
}

function inferredSheetNumber_(sheet, user, preferredName) {
  const current = String(sheet?.num_hoja_gasto || sheet?.Num_Hoja_Gasto || "").trim();
  if (current) return current;
  const created = String(sheet?.createdAtLocal || sheet?.hoja_gasto_fecha_envio || "").trim();
  const d = created ? new Date(created) : new Date();
  const safe = Number.isFinite(d.getTime()) ? d : new Date();
  const yyyy = String(safe.getFullYear());
  const mm = String(safe.getMonth() + 1).padStart(2, "0");
  const dd = String(safe.getDate()).padStart(2, "0");
  const person = resolvedUserName_(user, preferredName);
  return `${yyyy}_${mm}${dd} R.G.T. ${person}`;
}

function blobToDataUri_(blob) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No se pudo convertir el logo a base64."));
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(blob);
    } catch (e) {
      reject(e);
    }
  });
}

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Hojas de gasto</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Menú</Text>
      </Pressable>
    </View>
  );
}

function amountFromExpense_(e) {
  const parse = (v) => {
    const n = parseFloat(String(v || "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const t = String(e?.tipo_gasto || "").trim().toUpperCase();
  switch (t) {
    case "COMBUSTIBLES":
      return parse(e?.total_a_pagar);
    case "SEGURO":
      return parse(e?.prima);
    case "IMPUESTOS":
      return parse(e?.importe_ivm);
    case "OTROS_IMPUESTOS":
      return parse(e?.importe_otros_impuestos);
    case "REPUESTOS_RECAMBIO":
      return parse(e?.importe_repuestos);
    case "MANTENIMIENTO_REPARACIONES":
      return parse(e?.importe_mantenimiento);
    case "PARKING":
      return parse(e?.importe_aparcamiento);
    case "PEAJES":
      return parse(e?.importe_peaje);
    case "ITV":
      return parse(e?.importe_itv);
    case "MULTAS_SANCIONES":
      return parse(e?.importe_multa);
    case "OTROS":
      return parse(e?.importe_otros_gastos);
    default:
      return 0;
  }
}

function escapeHtml_(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function expenseDate_(e) {
  return (
    e?.fecha_repostaje ||
    e?.fecha_compra_mantenimiento ||
    e?.fecha_compra_repuestos ||
    e?.fecha_aparcamiento ||
    e?.fecha_peaje ||
    e?.fecha_inspeccion ||
    e?.fecha_otros_gastos ||
    e?.fecha_multa ||
    e?.createdAtLocal ||
    ""
  );
}

function isUserPaidPending_(e) {
  const paidByUser = String(e?.forma_pago || "").trim().toLowerCase() === "usuario";
  const alreadyAssigned = !!String(e?.hoja_gasto_id || "").trim();
  return paidByUser && !alreadyAssigned;
}

function expenseActorEmail_(e) {
  return String(e?.usuario_email || e?.responsable_email || e?.user_email || "")
    .trim()
    .toLowerCase();
}

function expensePlate_(e) {
  return String(e?.matricula || e?.vehiclePlate || "").trim().toUpperCase();
}

/** Gastos que pueden incluirse en una hoja según rol (además de isUserPaidPending_). */
function expenseSelectableForSheet_(e, { gestor, responsable, me, assignedSet }) {
  if (gestor) return true;
  const owner = expenseActorEmail_(e);
  const plate = expensePlate_(e);
  if (responsable) {
    if (me && owner === me) return true;
    if (plate && assignedSet && assignedSet.has(plate)) return true;
    return false;
  }
  return !!(me && owner === me);
}

function sheetTouchesAssignedPlates_(sheet, assignedSet) {
  if (!assignedSet || !assignedSet.size) return false;
  const lines = Array.isArray(sheet?.lineas) ? sheet.lineas : [];
  return lines.some((l) => {
    const p = String(l?.matricula || "").trim().toUpperCase();
    return p && assignedSet.has(p);
  });
}

function asList_(res) {
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}

/** Claves posibles para deduplicar hoja local vs fila del listado remoto. */
function sheetKeysSet_(s) {
  const set = new Set();
  const a = String(s?.hoja_gasto_id || "").trim();
  const b = String(s?.hoja_id_local || "").trim();
  const c = String(s?.id || "").trim();
  if (a) set.add(a);
  if (b) set.add(b);
  if (c) set.add(c);
  return set;
}

function parseRemoteListRow_(x) {
  const hid = String(x?.hoja_gasto_id || x?.hoja_id_local || "").trim();
  return {
    id: hid || `remote-${String(x?.num_hoja_gasto || "").slice(0, 12)}`,
    hoja_gasto_id: hid,
    hoja_id_local: hid,
    num_hoja_gasto: String(x?.num_hoja_gasto || x?.Num_Hoja_Gasto || "").trim(),
    Num_Hoja_Gasto: String(x?.num_hoja_gasto || x?.Num_Hoja_Gasto || "").trim(),
    usuario_email: String(x?.usuario_email || x?.responsable_email || "").trim().toLowerCase(),
    usuario_nombre: String(x?.usuario_nombre || x?.nombre || "").trim(),
    estado: String(x?.hoja_gasto_estado || x?.estado || "ENVIADA").trim().toUpperCase(),
    hoja_gasto_estado: String(x?.hoja_gasto_estado || x?.estado || "ENVIADA").trim().toUpperCase(),
    hoja_gasto_estado_pago: String(x?.hoja_gasto_estado_pago || x?.estado_pago || "").trim().toUpperCase(),
    hoja_gasto_fecha_envio: String(x?.hoja_gasto_fecha_envio || x?.createdAtLocal || "").trim(),
    createdAtLocal: String(x?.createdAtLocal || x?.hoja_gasto_fecha_envio || "").trim(),
    total_importe: Number(x?.hoja_gasto_total || x?.total_importe || 0) || 0,
    observaciones: String(x?.hoja_gasto_observaciones || x?.observaciones || "").trim(),
    lineas: Array.isArray(x?.lineas) ? x.lineas : [],
    lineas_count: Number(x?.lineas_count || 0) || 0,
    _fromRemoteList: true,
  };
}

/** Hojas visibles en la lista local según rol. */
function sheetVisibleForRole_(sheet, { gestor, responsable, me, assignedSet }) {
  if (gestor) return true;
  const creator = String(sheet?.usuario_email || "").trim().toLowerCase();
  if (responsable) {
    if (me && creator === me) return true;
    if (sheetTouchesAssignedPlates_(sheet, assignedSet)) return true;
    return false;
  }
  if (!creator) return true;
  return !!(me && creator === me);
}

function parseDateMs_(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00`);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

function sheetSyncStatus_(sheet, outbox) {
  if (sheet?._fromRemoteList) {
    return { text: "SERVIDOR", tone: "ok" };
  }
  const sid = String(sheet?.id || "").trim();
  const pending = (outbox || []).find((j) => {
    if (j?.kind !== "expense_sheet") return false;
    const jid = String(j?.payload?.hoja_id_local || "").trim();
    return jid && jid === sid;
  });
  if (!pending) return { text: "SINCRONIZADA", tone: "ok" };
  if (String(pending?._syncError || "").trim()) return { text: "ERROR_SYNC", tone: "error" };
  return { text: "PENDIENTE_SYNC", tone: "warn" };
}

function entityFromExpense_(e) {
  const t = String(e?.tipo_gasto || "").trim().toUpperCase();
  if (t === "COMBUSTIBLES") return String(e?.entidad_combustible || e?.marca_combustible || e?.lugar_repostaje || "").trim();
  if (t === "MANTENIMIENTO_REPARACIONES") return String(e?.proveedor_mantenimiento || "").trim();
  if (t === "REPUESTOS_RECAMBIO") return String(e?.proveedor_repuestos || "").trim();
  if (t === "OTROS") return String(e?.proveedor_otros_gastos || "").trim();
  if (t === "MULTAS_SANCIONES") return String(e?.organismo_denunciante || "").trim();
  if (t === "SEGURO") return String(e?.compania || "").trim();
  if (t === "ITV") return String(e?.estacion_itv || "").trim();
  if (t === "PEAJES") return String(e?.entidad_peaje || e?.salida_peaje || e?.entrada_peaje || "").trim();
  if (t === "PARKING") return String(e?.entidad_parking || e?.tipo_zona || "").trim();
  return "";
}

function invoiceFromExpense_(e) {
  const t = String(e?.tipo_gasto || "").trim().toUpperCase();
  if (t === "COMBUSTIBLES") return String(e?.numero_ticket || "").trim();
  if (t === "MANTENIMIENTO_REPARACIONES") return String(e?.numero_factura_mantenimiento || "").trim();
  if (t === "REPUESTOS_RECAMBIO") return String(e?.numero_factura_repuestos || "").trim();
  if (t === "ITV") return String(e?.numero_factura_itv || "").trim();
  if (t === "OTROS") return String(e?.numero_factura_otros || "").trim();
  if (t === "PEAJES" || t === "PARKING") return "TIQUET";
  return String(e?.numero_ticket || "").trim();
}

function humanConcept_(tipo) {
  const t = String(tipo || "").trim().toUpperCase();
  const map = {
    COMBUSTIBLES: "combustible",
    DIETAS: "dieta",
    CONSUMIBLES: "consumible",
    MANTENIMIENTO_REPARACIONES: "mantenimiento",
    REPUESTOS_RECAMBIO: "repuestos",
    PARKING: "aparcamiento",
    PEAJES: "peaje",
    ITV: "itv",
    MULTAS_SANCIONES: "multa/sanción",
    OTROS: "otros gastos",
    SEGURO: "seguro",
    IMPUESTOS: "impuestos",
    OTROS_IMPUESTOS: "otros impuestos",
  };
  return map[t] || String(tipo || "gasto").toLowerCase();
}

function formatDateEs_(isoOrYmd) {
  const raw = String(isoOrYmd || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function formatCurrencyEs_(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0,00";
  return n.toFixed(2).replace(".", ",");
}

async function getSheetLogoDataUri_() {
  if (logoDataUriCache_) return logoDataUriCache_;
  const mod = require("../../../assets/logo-grefa-45.png");
  const assets = await Asset.loadAsync(mod);
  const logoAsset = Array.isArray(assets) && assets.length ? assets[0] : Asset.fromModule(mod);
  const enc = FileSystem.EncodingType?.Base64 || "base64";
  const candidates = [
    String(logoAsset?.localUri || "").trim(),
    String(logoAsset?.uri || "").trim(),
  ].filter(Boolean);

  for (let i = 0; i < candidates.length; i += 1) {
    const source = candidates[i];
    try {
      if (/^data:image\//i.test(source)) {
        logoDataUriCache_ = source;
        return logoDataUriCache_;
      }
      let fileUri = source;
      if (!/^file:\/\//i.test(fileUri)) {
        const dest = `${FileSystem.cacheDirectory}logo_grefa_${Date.now()}_${i}.png`;
        try {
          await FileSystem.copyAsync({ from: fileUri, to: dest });
          fileUri = dest;
        } catch {
          try {
            const dl = await FileSystem.downloadAsync(fileUri, dest);
            fileUri = String(dl?.uri || "");
          } catch {
            // try next candidate
          }
        }
      }
      if (/^file:\/\//i.test(fileUri)) {
        const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: enc });
        if (b64) {
          logoDataUriCache_ = `data:image/png;base64,${b64}`;
          return logoDataUriCache_;
        }
      }
    } catch {
      // try next candidate
    }
  }

  // Fallback: si no se pudo convertir, dejamos URI directo.
  logoDataUriCache_ = String(logoAsset?.uri || "").trim();
  return logoDataUriCache_;
}

function personFromSheet_(sheet, user, preferredName) {
  const fromSheet = String(sheet?.usuario_nombre || "").trim();
  if (fromSheet && !fromSheet.includes("@")) return fromSheet;
  const num = String(sheet?.num_hoja_gasto || "").trim();
  const marker = " R.G.T. ";
  const p = num.indexOf(marker);
  if (p >= 0) {
    const nameFromNum = num.slice(p + marker.length).split(" - ")[0].trim();
    if (nameFromNum) return nameFromNum;
  }
  const fromUser = resolvedUserName_(user, preferredName);
  if (fromUser && !fromUser.includes("@")) return fromUser;
  return String(fromSheet || fromUser || "Usuario").replace(/@.*/, "");
}

export default function ExpenseSheetsScreen({ navigation }) {
  const { user, role } = React.useContext(AuthContext);
  const gestor = isGestor(role);
  const responsable = isResponsable(role);
  const [assignedSet, setAssignedSet] = useState(new Set());
  const [expenses, setExpenses] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [selected, setSelected] = useState({});
  const [obs, setObs] = useState("");
  const [sending, setSending] = useState(false);
  const [printingSheetId, setPrintingSheetId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [outbox, setOutbox] = useState([]);
  const [profileName, setProfileName] = useState("");
  const [remoteSheets, setRemoteSheets] = useState([]);
  const [remoteListLoading, setRemoteListLoading] = useState(false);

  const reloadAll = React.useCallback(async () => {
    const [allExpenses, allSheets, allOutbox] = await Promise.all([
      localDb.getExpenses(),
      localDb.getExpenseSheets(),
      localDb.getOutbox(),
    ]);
    setExpenses(Array.isArray(allExpenses) ? allExpenses : []);
    setSheets(Array.isArray(allSheets) ? allSheets : []);
    setOutbox(Array.isArray(allOutbox) ? allOutbox : []);
  }, []);

  const loadRemoteSheets = React.useCallback(async () => {
    const email = String(user?.email || "").trim();
    if (!email) {
      setRemoteSheets([]);
      return;
    }
    setRemoteListLoading(true);
    try {
      const res = await sheetsApi.get("hojas_gasto_list", { user_email: email });
      const rows = asList_(res)
        .map(parseRemoteListRow_)
        .filter((x) => String(x?.hoja_gasto_id || "").trim());
      setRemoteSheets(rows);
    } catch {
      setRemoteSheets([]);
    } finally {
      setRemoteListLoading(false);
    }
  }, [user?.email]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [allExpenses, allSheets, allOutbox] = await Promise.all([
        localDb.getExpenses(),
        localDb.getExpenseSheets(),
        localDb.getOutbox(),
      ]);
      if (!alive) return;
      setExpenses(Array.isArray(allExpenses) ? allExpenses : []);
      setSheets(Array.isArray(allSheets) ? allSheets : []);
      setOutbox(Array.isArray(allOutbox) ? allOutbox : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadRemoteSheets();
    }, [loadRemoteSheets])
  );

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!responsable || gestor) {
        setAssignedSet(new Set());
        return;
      }
      try {
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
        const next = new Set(mine.map((v) => String(v?.matricula || "").trim().toUpperCase()).filter(Boolean));
        if (alive) setAssignedSet(next);
      } catch {
        if (alive) setAssignedSet(new Set());
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.email, responsable, gestor]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const email = String(user?.email || "").trim().toLowerCase();
        if (!email) return;
        const res = await sheetsApi.get("usuario_get", { email, user_email: email });
        const data = res?.data || res || {};
        const name = String(data?.nombre || "").trim();
        if (alive && name) setProfileName(name);
      } catch {
        // fallback local
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.email]);

  const sheetCtx = useMemo(
    () => ({
      gestor,
      responsable,
      me: String(user?.email || "").trim().toLowerCase(),
      assignedSet,
    }),
    [gestor, responsable, user?.email, assignedSet]
  );

  const pending = useMemo(() => {
    const fromMs = parseDateMs_(dateFrom);
    const toMs = parseDateMs_(dateTo);
    const toEndMs = toMs ? toMs + 24 * 60 * 60 * 1000 - 1 : 0;
    return expenses
      .filter((e) => isUserPaidPending_(e) && expenseSelectableForSheet_(e, sheetCtx))
      .map((e) => {
        const id = String(e?.id || e?.local_id || "").trim();
        return {
          id,
          amount: amountFromExpense_(e),
          date: expenseDate_(e),
          plate: String(e?.matricula || e?.vehiclePlate || "").trim().toUpperCase(),
          type: String(e?.tipo_gasto || "").trim(),
          raw: e,
        };
      })
      .filter((x) => x.id)
      .filter((x) => {
        const t = parseDateMs_(x.date);
        if (fromMs && (!t || t < fromMs)) return false;
        if (toEndMs && (!t || t > toEndMs)) return false;
        return true;
      })
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [expenses, dateFrom, dateTo, sheetCtx]);

  const mergedDisplayedSheets = useMemo(() => {
    const localVisible = sheets.filter((s) => sheetVisibleForRole_(s, sheetCtx));
    const keySeen = new Set();
    localVisible.forEach((s) => {
      sheetKeysSet_(s).forEach((k) => keySeen.add(k));
    });
    const out = [...localVisible];
    for (const r of remoteSheets) {
      if (!sheetVisibleForRole_(r, sheetCtx)) continue;
      const ks = sheetKeysSet_(r);
      if (!ks.size) continue;
      const dup = [...ks].some((k) => keySeen.has(k));
      if (dup) continue;
      out.push(r);
      ks.forEach((k) => keySeen.add(k));
    }
    out.sort((a, b) => {
      const da = String(a?.hoja_gasto_fecha_envio || a?.createdAtLocal || "").trim();
      const db = String(b?.hoja_gasto_fecha_envio || b?.createdAtLocal || "").trim();
      return db.localeCompare(da);
    });
    return out;
  }, [sheets, remoteSheets, sheetCtx]);

  const sheetsForNumbering = useMemo(() => {
    const me = sheetCtx.me;
    return mergedDisplayedSheets.filter((s) => String(s?.usuario_email || "").trim().toLowerCase() === me);
  }, [mergedDisplayedSheets, sheetCtx.me]);

  const selectedRows = useMemo(() => pending.filter((r) => !!selected[r.id]), [pending, selected]);
  const selectedTotal = useMemo(() => selectedRows.reduce((acc, r) => acc + (r.amount || 0), 0), [selectedRows]);

  const toggle = (id) => {
    setSelected((p) => ({ ...p, [id]: !p[id] }));
  };

  const createSheet = async () => {
    if (sending) return;
    if (!selectedRows.length) {
      Alert.alert("Sin selección", "Selecciona al menos un gasto pagado por usuario.");
      return;
    }
    try {
      setSending(true);
      const now = new Date();
      const userName = resolvedUserName_(user, profileName);
      const sheetNumber = nextSheetNumber_(user, now, sheetsForNumbering, userName);
      const sheetLocalId = `HG-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(
        2,
        "0"
      )}-${now.getTime()}`;
      const payload = {
        hoja_id_local: sheetLocalId,
        hoja_gasto_id: sheetLocalId,
        num_hoja_gasto: sheetNumber,
        Num_Hoja_Gasto: sheetNumber,
        usuario_email: String(user?.email || "").trim().toLowerCase(),
        usuario_nombre: userName,
        createdAtLocal: now.toISOString(),
        estado: "ENVIADA",
        total_importe: Number(selectedTotal.toFixed(2)),
        moneda: "EUR",
        observaciones: String(obs || "").trim(),
        lineas: selectedRows.map((r) => ({
          id_gasto: String(r?.raw?.id_gasto || r.id || "").trim(),
          expense_id: r.id,
          fecha: r.date || "",
          matricula: r.plate || "",
          tipo_gasto: r.type || "",
          concepto: humanConcept_(r.type),
          entidad: entityFromExpense_(r.raw),
          numero_factura: invoiceFromExpense_(r.raw),
          proyecto: String(
            r?.raw?.departamento_o_proyecto === "__OTRO__"
              ? r?.raw?.departamento_o_proyecto_custom || ""
              : r?.raw?.departamento_o_proyecto || r?.raw?.departamento_o_proyecto_custom || ""
          ).trim(),
          importe: Number((r.amount || 0).toFixed(2)),
        })),
      };

      const nextSheet = {
        id: sheetLocalId,
        ...payload,
        estado_sync: "PENDIENTE_SYNC",
      };

      const nextExpenses = expenses.map((e) => {
        const eid = String(e?.id || e?.local_id || "").trim();
        if (!selected[eid]) return e;
        return {
          ...e,
          hoja_gasto_id: sheetLocalId,
          hoja_gasto_estado: "ENVIADA",
        };
      });

      await localDb.setExpenseSheets([nextSheet, ...sheets]);
      await localDb.setExpenses(nextExpenses);
      await syncService.queue({ kind: "expense_sheet", payload });
      syncService.flushIfOnline().catch(() => {});

      setSheets((p) => [nextSheet, ...p]);
      setExpenses(nextExpenses);
      setOutbox((p) => [
        { id: `${Date.now()}-sheet`, kind: "expense_sheet", payload, createdAt: Date.now() },
        ...p,
      ]);
      setSelected({});
      setObs("");
      Alert.alert("Hoja enviada", `Hoja ${sheetNumber} creada con ${selectedRows.length} gastos.`);
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo crear la hoja de gasto.");
    } finally {
      setSending(false);
    }
  };

  const printSheetPdf = async (sheet) => {
    if (printingSheetId) {
      Alert.alert("Impresión en curso", "Ya hay una impresión en curso. Espera a que termine.");
      return;
    }
    const printKey = String(sheet?.hoja_gasto_id || sheet?.hoja_id_local || sheet?.id || "").trim();
    try {
      setPrintingSheetId(printKey || "__printing__");
      let sheetForPrint = sheet;
      let lines = Array.isArray(sheet?.lineas) ? sheet.lineas : [];
      const sid = String(sheet?.hoja_gasto_id || sheet?.hoja_id_local || sheet?.id || "").trim();
      if ((!lines || !lines.length) && sid) {
        try {
          const detailRes = await sheetsApi.get("hoja_gasto_detalle", {
            hoja_gasto_id: sid,
            user_email: String(user?.email || "").trim(),
          });
          const detail = detailRes?.data || detailRes || {};
          const dl = Array.isArray(detail?.lineas) ? detail.lineas : [];
          if (dl.length) {
            lines = dl;
            sheetForPrint = {
              ...sheet,
              ...detail,
              lineas: dl,
              total_importe: Number(detail?.total_importe ?? sheet?.total_importe ?? sheet?.hoja_gasto_total ?? 0) || 0,
              usuario_nombre: String(detail?.usuario_nombre || sheet?.usuario_nombre || "").trim(),
              createdAtLocal: String(detail?.createdAtLocal || detail?.hoja_gasto_fecha_envio || sheet?.createdAtLocal || "").trim(),
            };
          }
        } catch {
          // se intenta PDF con líneas vacías
        }
      }
      const logoDataUri = await getSheetLogoDataUri_();
      const rows = [];
      for (let i = 0; i < 15; i += 1) {
        rows.push(lines[i] || {});
      }
      const rowsHtml = rows
        .map((l) => {
          return `<tr>
            <td style="border:1px solid #333; padding:5px 4px; height:24px; vertical-align:middle;">${escapeHtml_(l.concepto || (l.tipo_gasto ? humanConcept_(l.tipo_gasto || "") : ""))}</td>
            <td style="border:1px solid #333; padding:5px 4px; height:24px; vertical-align:middle;">${escapeHtml_(l.entidad || "")}</td>
            <td style="border:1px solid #333; padding:5px 4px; height:24px; vertical-align:middle;">${escapeHtml_(l.numero_factura || "")}</td>
            <td style="border:1px solid #333; padding:5px 4px; height:24px; vertical-align:middle;">${escapeHtml_(formatDateEs_(l.fecha || ""))}</td>
            <td style="border:1px solid #333; padding:5px 4px; text-align:right; height:24px; vertical-align:middle;">${escapeHtml_(l.importe !== undefined && l.importe !== null && String(l.importe) !== "" ? formatCurrencyEs_(l.importe) : "")}</td>
            <td style="border:1px solid #333; padding:5px 4px; height:24px; vertical-align:middle;">${escapeHtml_(l.proyecto || "")}</td>
          </tr>`;
        })
        .join("");

      const total = Number(sheetForPrint?.total_importe || sheetForPrint?.hoja_gasto_total || 0);
      const created = String(sheetForPrint?.createdAtLocal || sheetForPrint?.hoja_gasto_fecha_envio || "");
      const createdDate = formatDateEs_(created);
      const person = personFromSheet_(sheetForPrint, user, profileName);
      const sheetNumber = inferredSheetNumber_(sheetForPrint, user, profileName);
      const sheetOrderText = sheetNumber || String(sheetForPrint?.id || sheetForPrint?.hoja_id_local || "").trim();
      const html = `
      <html>
      <body style="font-family: Arial, sans-serif; color:#111; padding:22px;">
        <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:8px;">
          <div style="width:120px; display:flex; align-items:flex-start; justify-content:flex-start;">
            ${logoDataUri ? `<img src="${logoDataUri}" style="width:96px; height:auto; object-fit:contain;" />` : ""}
          </div>
          <div style="flex:1;">
            <div style="font-size:12px; margin-bottom:6px; text-align:right;">Nº ORDEN ${escapeHtml_(sheetOrderText)}</div>
            <div style="font-size:12px; margin-bottom:10px; text-align:right;">proyecto</div>
          </div>
        </div>
        <h2 style="margin:0 0 4px 0; font-size:19px; text-align:center;">RELACIÓN DE GASTOS</h2>
        <div style="font-size:13px; font-weight:700; margin-bottom:14px; text-align:center;">COMBUSTIBLE, DIETAS, CONSUMIBLES y OTROS COSTES</div>

        <div style="font-size:13px; margin-bottom:14px; line-height:1.45;">
          Se abona a D. <b>${escapeHtml_(person)}</b> la cantidad de
          <b>${escapeHtml_(formatCurrencyEs_(total))} euros</b> con transferencia a su cuenta, por haber incurrido en los gastos siguientes:
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:12px; table-layout:fixed;">
          <thead>
            <tr>
              <th style="border:1px solid #333; text-align:left; padding:6px 4px;">Concepto</th>
              <th style="border:1px solid #333; text-align:left; padding:6px 4px;">Entidad</th>
              <th style="border:1px solid #333; text-align:left; padding:6px 4px;">Nº Factura</th>
              <th style="border:1px solid #333; text-align:left; padding:6px 4px;">Fecha</th>
              <th style="border:1px solid #333; text-align:right; padding:6px 4px;">Importe</th>
              <th style="border:1px solid #333; text-align:left; padding:6px 4px;">Proyecto</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div style="margin-top:10px; text-align:right; font-size:13px;">
          <b>Total: ${escapeHtml_(formatCurrencyEs_(total))} €</b>
        </div>

        <div style="margin-top:26px; font-size:12px;">
          Majadahonda a ${escapeHtml_(createdDate || formatDateEs_(new Date().toISOString()))}.
        </div>
        <div style="margin-top:20px; font-size:12px;">Sello de GREFA</div>
      </body>
      </html>`;
      const pdf = await Print.printToFileAsync({ html });
      const pdfUri = String(pdf?.uri || "").trim();
      if (!pdfUri) {
        throw new Error("No se pudo generar el PDF.");
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: "application/pdf",
          dialogTitle: `Compartir hoja ${sheetOrderText}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        await Print.printAsync({ html });
      }
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo generar/compartir el PDF de la hoja.");
    } finally {
      setPrintingSheetId("");
    }
  };

  const syncNow = async () => {
    try {
      await syncService.flushIfOnline();
      await reloadAll();
      await loadRemoteSheets();
      Alert.alert("Sincronización", "Estado de hojas actualizado.");
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo sincronizar.");
    }
  };

  const editExpense = async (row) => {
    try {
      const eid = String(row?.id || "").trim();
      if (!eid) return;
      await localDb.setExpensesDraft({
        ...row.raw,
        _editExpenseId: eid,
      });
      navigation.navigate("Gasto");
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo abrir el gasto para editar.");
    }
  };

  const deleteExpense = async (row) => {
    const eid = String(row?.id || "").trim();
    if (!eid) return;
    Alert.alert("Eliminar gasto", "¿Seguro que quieres eliminar este gasto pendiente?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            const list = await localDb.getExpenses();
            const nextList = list.filter((e) => String(e?.id || e?.local_id || "").trim() !== eid);
            await localDb.setExpenses(nextList);
            const out = await localDb.getOutbox();
            const nextOut = out.filter((j) => {
              if (j?.kind !== "expense") return true;
              const lid = String(j?.payload?.local_id || "").trim();
              if (lid && lid === eid) return false;
              const sameCreatedAt =
                String(j?.payload?.createdAtLocal || "").trim() &&
                String(j?.payload?.createdAtLocal || "").trim() === String(row?.raw?.createdAtLocal || "").trim();
              return !sameCreatedAt;
            });
            await localDb.setOutbox(nextOut);
            setExpenses(nextList);
            setOutbox(nextOut);
            setSelected((p) => {
              const n = { ...p };
              delete n[eid];
              return n;
            });
          } catch (e) {
            Alert.alert("Error", e?.message || "No se pudo eliminar el gasto.");
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.navigate("Menu")} />

      <View style={styles.card}>
        <Text style={styles.meta}>Pendientes (forma de pago Usuario): {pending.length}</Text>
        <Text style={styles.meta}>Seleccionados: {selectedRows.length}</Text>
        <Text style={styles.total}>Total hoja: {selectedTotal.toFixed(2)} EUR</Text>
        <DateField label="Desde" required={false} value={dateFrom} onChange={setDateFrom} />
        <DateField label="Hasta" required={false} value={dateTo} onChange={setDateTo} />
        <TextField
          label="Observaciones hoja (opcional)"
          required={false}
          value={obs}
          onChangeText={setObs}
          placeholder="Ej: Dietas semana 12 / adelantado usuario"
        />
        <Pressable style={[styles.sendBtn, sending && { opacity: 0.75 }]} onPress={createSheet} disabled={sending}>
          <Text style={styles.sendText}>{sending ? "Enviando..." : "Crear y enviar hoja"}</Text>
        </Pressable>
        <Pressable style={styles.syncBtn} onPress={syncNow}>
          <Text style={styles.syncText}>Sincronizar estado</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>Gastos seleccionables</Text>
      {pending.map((r) => (
        <Pressable key={r.id} style={[styles.row, selected[r.id] && styles.rowSelected]} onPress={() => toggle(r.id)}>
          <Text style={styles.rowTitle}>{selected[r.id] ? "✓ " : ""}{r.type || "Gasto"}</Text>
          <Text style={styles.rowSub}>Matrícula: {r.plate || "—"} · Fecha: {r.date || "—"}</Text>
          <Text style={styles.rowAmount}>{(r.amount || 0).toFixed(2)} EUR</Text>
          <View style={styles.rowActions}>
            <Pressable style={styles.actionBtn} onPress={() => editExpense(r)}>
              <Text style={styles.actionText}>Modificar</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, styles.actionDanger]} onPress={() => deleteExpense(r)}>
              <Text style={styles.actionText}>Eliminar</Text>
            </Pressable>
          </View>
        </Pressable>
      ))}
      {!pending.length ? <Text style={styles.empty}>No hay gastos de usuario pendientes para reembolso.</Text> : null}

      <Text style={styles.section}>Hojas de gasto (dispositivo y servidor)</Text>
      {remoteListLoading ? <Text style={styles.meta}>Cargando listado del servidor…</Text> : null}
      {mergedDisplayedSheets.map((s) => {
        const sync = sheetSyncStatus_(s, outbox);
        const visibleNum = String(s?.num_hoja_gasto || s?.Num_Hoja_Gasto || "").trim();
        const internalId = String(s?.id || s?.hoja_id_local || s?.hoja_gasto_id || "").trim();
        const rowKey = [...sheetKeysSet_(s)].join("|") || internalId;
        const printKey = String(s?.hoja_gasto_id || s?.hoja_id_local || s?.id || "").trim();
        const lineCount = Array.isArray(s.lineas) ? s.lineas.length : Number(s?.lineas_count || 0) || 0;
        const origin = s?._fromRemoteList ? "Servidor" : "Dispositivo";
        return (
        <View key={rowKey} style={styles.row}>
          <Text style={styles.rowTitle}>{visibleNum || internalId}</Text>
          <Text style={styles.rowSub}>
            {origin}
            {String(s?.usuario_nombre || s?.usuario_email || "").trim()
              ? ` · ${String(s?.usuario_nombre || "").trim() || s.usuario_email}`
              : ""}
          </Text>
          {visibleNum && internalId && visibleNum !== internalId ? (
            <Text style={styles.rowSub}>ID: {internalId}</Text>
          ) : null}
          <Text style={styles.rowSub}>
            Estado: {s.estado || s.hoja_gasto_estado || "ENVIADA"}
            {s.hoja_gasto_estado_pago ? ` · Pago: ${s.hoja_gasto_estado_pago}` : ""}
            {" · "}
            <Text style={[styles.syncBadge, sync.tone === "ok" ? styles.syncOk : sync.tone === "warn" ? styles.syncWarn : styles.syncErr]}>{sync.text}</Text>
            {" · "}
            Líneas: {lineCount}
          </Text>
          <Text style={styles.rowAmount}>{Number(s.total_importe || s.hoja_gasto_total || 0).toFixed(2)} EUR</Text>
          <View style={styles.rowActions}>
            <Pressable
              style={[styles.actionBtn, printingSheetId && { opacity: 0.65 }]}
              onPress={() => printSheetPdf(s)}
              disabled={!!printingSheetId}
            >
              <Text style={styles.actionText}>
                {printingSheetId === printKey ? "Preparando PDF..." : "Compartir PDF"}
              </Text>
            </Pressable>
          </View>
        </View>
      )})}
      {!mergedDisplayedSheets.length ? <Text style={styles.empty}>Aún no hay hojas de gasto visibles para tu rol.</Text> : null}
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
  meta: { color: theme.colors.subtext, fontSize: 12, marginBottom: 4 },
  total: { color: theme.colors.text, fontWeight: "900", marginBottom: 8 },
  sendBtn: { marginTop: 2, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 12 },
  sendText: { color: theme.colors.text, fontWeight: "900" },
  syncBtn: {
    marginTop: 8,
    backgroundColor: theme.colors.card2,
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  syncText: { color: theme.colors.text, fontWeight: "900" },
  section: { color: theme.colors.text, fontWeight: "900", marginBottom: 8, marginTop: 4 },
  row: {
    backgroundColor: theme.colors.card2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 10,
  },
  rowSelected: { borderColor: "#5fb7ff" },
  rowTitle: { color: theme.colors.text, fontWeight: "900", fontSize: 14 },
  rowSub: { color: theme.colors.subtext, marginTop: 4, fontSize: 12 },
  rowAmount: { color: theme.colors.text, marginTop: 6, fontWeight: "900" },
  rowActions: { marginTop: 8, flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    alignItems: "center",
    paddingVertical: 8,
  },
  actionDanger: { borderColor: "#c96e6e" },
  actionText: { color: theme.colors.text, fontWeight: "800", fontSize: 12 },
  syncBadge: { fontWeight: "900" },
  syncOk: { color: "#8cf0b0" },
  syncWarn: { color: "#ffd479" },
  syncErr: { color: "#ff9a9a" },
  empty: { color: theme.colors.subtext, marginBottom: 8 },
});
