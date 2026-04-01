import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { AuthContext } from "../auth/AuthContext";
import { canApproveExpenseSheets, canPayExpenseSheets, canReviewExpenseSheets } from "../auth/roles";
import { sheetsApi } from "../api/sheetsApi";
import { SelectField, TextField } from "../ui/form/Fields";
import { theme } from "../ui/theme";

let logoDataUriCache_ = null;

function Header({ onBack }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>Aprobaciones</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backText}>Menú</Text>
      </Pressable>
    </View>
  );
}

function asList_(res) {
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
}

function parseRow_(x) {
  return {
    hoja_gasto_id: String(x?.hoja_gasto_id || x?.hoja_id_local || "").trim(),
    num_hoja_gasto: String(x?.num_hoja_gasto || x?.Num_Hoja_Gasto || "").trim(),
    usuario_email: String(x?.usuario_email || x?.responsable_email || "").trim().toLowerCase(),
    usuario_nombre: String(x?.usuario_nombre || x?.nombre || "").trim(),
    hoja_gasto_estado: String(x?.hoja_gasto_estado || x?.estado || "ENVIADA").trim().toUpperCase(),
    hoja_gasto_estado_pago: String(x?.hoja_gasto_estado_pago || x?.estado_pago || "PAGO_PENDIENTE").trim().toUpperCase(),
    hoja_gasto_fecha_envio: String(x?.hoja_gasto_fecha_envio || x?.createdAtLocal || "").trim(),
    hoja_gasto_total: Number(x?.hoja_gasto_total || x?.total_importe || 0) || 0,
    hoja_gasto_observaciones: String(x?.hoja_gasto_observaciones || x?.observaciones || "").trim(),
    hoja_gasto_motivo_rechazo: String(x?.hoja_gasto_motivo_rechazo || "").trim(),
    hoja_gasto_metodo_pago: String(x?.hoja_gasto_metodo_pago || "").trim(),
    hoja_gasto_referencia_pago: String(x?.hoja_gasto_referencia_pago || "").trim(),
    lineas_count: Number(x?.lineas_count || 0) || 0,
  };
}

function formatDateEs_(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "-";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function formatCurrencyEs_(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0,00";
  return n.toFixed(2).replace(".", ",");
}

function escapeHtml_(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getSheetLogoDataUri_() {
  if (logoDataUriCache_) return logoDataUriCache_;
  const mod = require("../../../assets/logo-grefa-45.png");
  const assets = await Asset.loadAsync(mod);
  const logoAsset = Array.isArray(assets) && assets.length ? assets[0] : Asset.fromModule(mod);
  const enc = FileSystem.EncodingType?.Base64 || "base64";
  const candidates = [String(logoAsset?.localUri || "").trim(), String(logoAsset?.uri || "").trim()].filter(Boolean);
  for (let i = 0; i < candidates.length; i += 1) {
    try {
      let fileUri = candidates[i];
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
            // continue
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
      // continue
    }
  }
  logoDataUriCache_ = String(logoAsset?.uri || "").trim();
  return logoDataUriCache_;
}

export default function ApprovalsScreen({ navigation }) {
  const { role, user } = React.useContext(AuthContext);
  const allowed = canApproveExpenseSheets(role);
  const canReview = canReviewExpenseSheets(role);
  const canPay = canPayExpenseSheets(role);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [estadoRevision, setEstadoRevision] = useState("");
  const [estadoPago, setEstadoPago] = useState("");
  const [query, setQuery] = useState("");
  const [pdfBusyId, setPdfBusyId] = useState("");

  const filtered = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    return items.filter((x) => {
      if (estadoRevision && x.hoja_gasto_estado !== estadoRevision) return false;
      if (estadoPago && x.hoja_gasto_estado_pago !== estadoPago) return false;
      if (!q) return true;
      const blob = `${x.num_hoja_gasto} ${x.hoja_gasto_id} ${x.usuario_nombre} ${x.usuario_email}`.toLowerCase();
      return blob.includes(q);
    });
  }, [items, query, estadoRevision, estadoPago]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await sheetsApi.get("hojas_gasto_list", { user_email: user?.email || "" });
      setItems(asList_(res).map(parseRow_).filter((x) => x.hoja_gasto_id));
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudieron cargar hojas de gasto.");
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  React.useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed, load]);

  const setRevision = async (row, estado) => {
    if (!canReview) {
      Alert.alert("Permisos insuficientes", "Solo GESTOR puede aprobar/rechazar hojas de gasto.");
      return;
    }
    try {
      await sheetsApi.post(
        "hoja_gasto_actualizar_revision",
        {
          hoja_gasto_id: row.hoja_gasto_id,
          hoja_gasto_estado: estado,
          hoja_gasto_motivo_rechazo: estado === "RECHAZADA" ? "Rechazada por gestor" : "",
        },
        { user_email: user?.email || "" }
      );
      await load();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo actualizar revisión.");
    }
  };

  const setPago = async (row, estadoPagoNext) => {
    if (!canPay) {
      Alert.alert("Permisos insuficientes", "Solo ADMINISTRACION puede gestionar el pago.");
      return;
    }
    try {
      await sheetsApi.post(
        "hoja_gasto_actualizar_pago",
        {
          hoja_gasto_id: row.hoja_gasto_id,
          hoja_gasto_estado_pago: estadoPagoNext,
          hoja_gasto_metodo_pago: estadoPagoNext === "PAGADA" ? "Transferencia" : "",
          hoja_gasto_referencia_pago: estadoPagoNext === "PAGADA" ? "" : "",
        },
        { user_email: user?.email || "" }
      );
      await load();
    } catch (e) {
      Alert.alert("Error", e?.message || "No se pudo actualizar el pago.");
    }
  };

  const viewSheetPdf = async (row) => {
    const sid = String(row?.hoja_gasto_id || "").trim();
    if (!sid) return;
    if (pdfBusyId) {
      Alert.alert("PDF en curso", "Espera a que termine la generación del PDF.");
      return;
    }
    try {
      setPdfBusyId(sid);
      const detailRes = await sheetsApi.get("hoja_gasto_detalle", {
        hoja_gasto_id: sid,
        user_email: user?.email || "",
      });
      const detail = detailRes?.data || detailRes || {};
      const lines = Array.isArray(detail?.lineas) ? detail.lineas : [];
      const rows = [];
      for (let i = 0; i < 15; i += 1) rows.push(lines[i] || {});
      const rowsHtml = rows
        .map((l) => {
          return `<tr>
            <td style="border:1px solid #333; padding:5px 4px; height:24px; vertical-align:middle;">${escapeHtml_(l.concepto || "")}</td>
            <td style="border:1px solid #333; padding:5px 4px; height:24px; vertical-align:middle;">${escapeHtml_(l.entidad || "")}</td>
            <td style="border:1px solid #333; padding:5px 4px; height:24px; vertical-align:middle;">${escapeHtml_(l.numero_factura || "")}</td>
            <td style="border:1px solid #333; padding:5px 4px; height:24px; vertical-align:middle;">${escapeHtml_(formatDateEs_(l.fecha || ""))}</td>
            <td style="border:1px solid #333; padding:5px 4px; text-align:right; height:24px; vertical-align:middle;">${escapeHtml_(l.importe !== undefined && l.importe !== null && String(l.importe) !== "" ? formatCurrencyEs_(l.importe) : "")}</td>
            <td style="border:1px solid #333; padding:5px 4px; height:24px; vertical-align:middle;">${escapeHtml_(l.proyecto || "")}</td>
          </tr>`;
        })
        .join("");
      const logoDataUri = await getSheetLogoDataUri_();
      const person = String(detail?.usuario_nombre || row?.usuario_nombre || row?.usuario_email || "").trim();
      const sheetOrderText = String(detail?.num_hoja_gasto || row?.num_hoja_gasto || row?.hoja_gasto_id || "").trim();
      const total = Number(detail?.total_importe || row?.hoja_gasto_total || 0);
      const createdDate = formatDateEs_(detail?.hoja_gasto_fecha_envio || row?.hoja_gasto_fecha_envio || "");
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
      if (!pdfUri) throw new Error("No se pudo generar el PDF.");
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
      Alert.alert("Error", e?.message || "No se pudo generar/abrir el PDF de la hoja.");
    } finally {
      setPdfBusyId("");
    }
  };

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <Header onBack={() => navigation.navigate("Menu")} />
      {!allowed ? (
        <View style={styles.card}>
          <Text style={styles.message}>Solo GESTOR (y en futuro ADMINISTRACION) puede gestionar hojas de gasto.</Text>
        </View>
      ) : null}
      {allowed ? (
        <View style={styles.card}>
          <Text style={styles.message}>
            Permisos activos: {canReview ? "Revisión (GESTOR)" : ""}{canReview && canPay ? " + " : ""}{canPay ? "Pago (ADMINISTRACION)" : ""}
          </Text>
        </View>
      ) : null}

      {allowed ? (
        <View style={styles.card}>
          <SelectField
            label="Estado revisión"
            value={estadoRevision}
            onChange={setEstadoRevision}
            options={[
              { value: "", label: "TODOS" },
              { value: "ENVIADA", label: "ENVIADA" },
              { value: "EN_REVISION", label: "EN REVISION" },
              { value: "APROBADA", label: "APROBADA" },
              { value: "RECHAZADA", label: "RECHAZADA" },
            ]}
          />
          <SelectField
            label="Estado pago"
            value={estadoPago}
            onChange={setEstadoPago}
            options={[
              { value: "", label: "TODOS" },
              { value: "PAGO_PENDIENTE", label: "PAGO PENDIENTE" },
              { value: "PAGADA", label: "PAGADA" },
              { value: "RECHAZADA_PAGO", label: "RECHAZADA PAGO" },
            ]}
          />
          <TextField label="Buscar" value={query} onChangeText={setQuery} placeholder="Nº hoja, id o usuario" />
          <Pressable style={styles.buttonSecondary} onPress={load}>
            <Text style={styles.buttonText}>{loading ? "Recargando..." : "Recargar"}</Text>
          </Pressable>
        </View>
      ) : null}

      {filtered.map((x) => (
        <View key={x.hoja_gasto_id} style={styles.card}>
          <Pressable onPress={() => viewSheetPdf(x)}>
            <Text style={[styles.sectionTitle, styles.link]}>
              {x.num_hoja_gasto || x.hoja_gasto_id}
              {pdfBusyId === x.hoja_gasto_id ? " (abriendo PDF...)" : ""}
            </Text>
          </Pressable>
          <Text style={styles.message}>ID: {x.hoja_gasto_id}</Text>
          <Text style={styles.message}>
            Usuario: {x.usuario_nombre || x.usuario_email || "-"} · {x.usuario_email || "-"}
          </Text>
          <Text style={styles.message}>
            Revisión: {x.hoja_gasto_estado} · Pago: {x.hoja_gasto_estado_pago}
          </Text>
          <Text style={styles.message}>
            Envío: {formatDateEs_(x.hoja_gasto_fecha_envio)} · Líneas: {x.lineas_count} · Total: {x.hoja_gasto_total.toFixed(2)} EUR
          </Text>
          {!!x.hoja_gasto_observaciones ? <Text style={styles.message}>Obs: {x.hoja_gasto_observaciones}</Text> : null}
          {!!x.hoja_gasto_motivo_rechazo ? <Text style={styles.message}>Motivo rechazo: {x.hoja_gasto_motivo_rechazo}</Text> : null}
          {canReview ? (
            <View style={styles.row}>
              <Pressable style={styles.button} onPress={() => setRevision(x, "EN_REVISION")}>
                <Text style={styles.buttonText}>En revisión</Text>
              </Pressable>
              <Pressable style={styles.button} onPress={() => setRevision(x, "APROBADA")}>
                <Text style={styles.buttonText}>Aprobar</Text>
              </Pressable>
              <Pressable style={styles.buttonDanger} onPress={() => setRevision(x, "RECHAZADA")}>
                <Text style={styles.buttonText}>Rechazar</Text>
              </Pressable>
            </View>
          ) : null}
          {canPay ? (
            <View style={styles.row}>
              <Pressable style={styles.button} onPress={() => setPago(x, "PAGO_PENDIENTE")}>
                <Text style={styles.buttonText}>Pago pendiente</Text>
              </Pressable>
              <Pressable style={styles.button} onPress={() => setPago(x, "PAGADA")}>
                <Text style={styles.buttonText}>Marcar pagada</Text>
              </Pressable>
              <Pressable style={styles.buttonDanger} onPress={() => setPago(x, "RECHAZADA_PAGO")}>
                <Text style={styles.buttonText}>Rechazar pago</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}
      {!loading && allowed && !filtered.length ? <Text style={styles.message}>No hay hojas para mostrar.</Text> : null}
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
  link: { textDecorationLine: "underline", color: "#b7ddff" },
  message: { color: theme.colors.subtext, marginBottom: 6 },
  row: { flexDirection: "row", gap: 8, marginTop: 4 },
  button: { flex: 1, marginTop: 6, backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", paddingVertical: 10 },
  buttonDanger: { flex: 1, marginTop: 6, backgroundColor: "#9a3e3e", borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: "#d06b6b" },
  buttonSecondary: { marginTop: 2, backgroundColor: theme.colors.card2, borderRadius: 10, alignItems: "center", paddingVertical: 10, borderWidth: 1, borderColor: theme.colors.border },
  buttonText: { color: theme.colors.text, fontWeight: "900", fontSize: 12, textAlign: "center", paddingHorizontal: 4 },
});

