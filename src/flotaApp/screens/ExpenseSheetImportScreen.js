import React, { useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AuthContext } from "../auth/AuthContext";
import { canImportExpenseSheetExcel } from "../auth/roles";
import { theme } from "../ui/theme";
import {
  EXCEL_IMPORT_FAMILIAS,
  attachmentLabel_,
  buildAdjuntosPorLineaPayload_,
  formatImportPreviewSummary,
  importExpenseSheetExcel,
  importLineKey_,
  isImportPlantillaMismatchError_,
  pickExpenseSheetAttachmentFiles,
  pickExpenseSheetExcelFile,
  plantillaImportLabel_,
  plantillasForFamilia_,
  previewExpenseSheetExcelImport,
  uploadExpenseSheetAttachmentFile,
  uploadExpenseSheetExcelFile,
} from "../../flotaWeb/lib/expenseSheetExcelImport";

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

function lineLabel_(ln) {
  const tipo = String(ln?.tipo_gasto || "").trim();
  if (tipo === "COMBUSTIBLES") {
    return `${ln.matricula || ""} · ${ln.litros || 0} L · ${Number(ln.importe_estimado || 0).toFixed(2)} €`;
  }
  if (tipo === "KILOMETRAJE_COLABORADOR") {
    return `Km ${ln.km || 0} · ${ln.itinerario || ln.medio || ""}`;
  }
  if (tipo === "MANUTENCION") {
    return `${ln.establecimiento || "Dieta"} · ${Number(ln.importe_estimado || 0).toFixed(2)} €`;
  }
  if (tipo === "PEAJES" || tipo === "HOSPEDAJE" || tipo === "PARKING") {
    return `${ln.concepto || tipo} · ${Number(ln.importe_estimado || 0).toFixed(2)} €`;
  }
  return `${ln.concepto || ln.itinerario || "Otros"} · ${Number(ln.importe_estimado || 0).toFixed(2)} €`;
}

export default function ExpenseSheetImportScreen({ navigation }) {
  const { user, role } = useContext(AuthContext);
  const myEmail = String(user?.email || "").trim().toLowerCase();
  const allowed = canImportExpenseSheetExcel(role);

  const [busy, setBusy] = useState(false);
  const [familia, setFamilia] = useState("GENERICA");
  const [plantillaEsperada, setPlantillaEsperada] = useState(null);
  const [fileMeta, setFileMeta] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importError, setImportError] = useState("");
  const [importErrorTitle, setImportErrorTitle] = useState("");
  const [lineAttachments, setLineAttachments] = useState({});
  const [uploadingLineKey, setUploadingLineKey] = useState("");

  useEffect(() => {
    if (allowed) return;
    notifyUser_(
      "Sin permiso",
      "La importación Excel solo está disponible para administración, gestor o responsable."
    );
    navigation.goBack();
  }, [allowed, navigation]);

  const resetFilePreview = () => {
    setPreview(null);
    setFileMeta(null);
    setLineAttachments({});
    setUploadingLineKey("");
    setImportError("");
    setImportErrorTitle("");
  };

  const selectFamilia = (id) => {
    if (familia !== id) {
      resetFilePreview();
      setPlantillaEsperada(null);
    }
    setFamilia(id);
  };

  const selectPlantilla = (id) => {
    if (plantillaEsperada !== id) resetFilePreview();
    setPlantillaEsperada(id);
  };

  const pickAndPreview = async () => {
    if (!plantillaEsperada) {
      notifyUser_("Selecciona plantilla", "Indica primero qué tipo de hoja Excel vas a importar.");
      return;
    }
    try {
      setBusy(true);
      resetFilePreview();
      const picked = await pickExpenseSheetExcelFile();
      if (!picked) return;
      const uploaded = await uploadExpenseSheetExcelFile({
        uri: picked.uri,
        fileName: picked.name,
        userEmail: myEmail,
      });
      const prev = await previewExpenseSheetExcelImport({
        fileId: uploaded.file_id,
        userEmail: myEmail,
        plantillaEsperada,
      });
      setFileMeta(uploaded);
      setPreview(prev);
      setImportError("");
      setImportErrorTitle("");
    } catch (e) {
      setPreview(null);
      setFileMeta(null);
      const msg = e?.message || "No se pudo leer el Excel.";
      const title = isImportPlantillaMismatchError_(e) ? "Plantilla incorrecta" : "Error";
      setImportErrorTitle(title);
      setImportError(msg);
      notifyUser_(title, msg);
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!fileMeta?.file_id || !preview || !plantillaEsperada) return;
    const adjuntos = buildAdjuntosPorLineaPayload_(lineAttachments);
    const nAdj = adjuntos.reduce((n, a) => n + (a.ticket_drive_urls?.length || 0), 0);
    const msg =
      formatImportPreviewSummary(preview) +
      "\n\nSe creará un viaje (cabecera del Excel) y los gastos quedarán asociados a ese viaje." +
      "\nDespués podrás confeccionar la hoja de gasto desde «Hojas de gasto»." +
      (nAdj > 0 ? `\n\nFacturas/tickets adjuntos: ${nAdj} archivo(s).` : "");
    let ok = true;
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
      ok = window.confirm(msg + "\n\n¿Importar ahora?");
    } else {
      ok = await new Promise((resolve) => {
        Alert.alert("Confirmar importación", msg, [
          { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
          { text: "Importar", onPress: () => resolve(true) },
        ]);
      });
    }
    if (!ok) return;
    try {
      setBusy(true);
      const result = await importExpenseSheetExcel({
        fileId: fileMeta.file_id,
        userEmail: myEmail,
        validarDni: true,
        plantillaEsperada,
        adjuntosPorLinea: adjuntos,
      });
      const nOk = Number(result?.importados || result?.gastos_creados?.length || 0);
      const nErr = Number(result?.fallidos || result?.errores?.length || 0);
      const nSkip = Number(result?.omitidos || result?.omitidos_duplicados?.length || 0);
      const idViaje = String(result?.id_viaje_propio || result?.viaje?.id_viaje || "").trim();
      let text = `Importados: ${nOk} gasto(s).`;
      if (idViaje) text += `\nViaje: ${idViaje} (todos los gastos nuevos quedan enlazados).`;
      if (nSkip > 0) text += `\nOmitidos (duplicados): ${nSkip}.`;
      if (nErr > 0) text += `\nErrores: ${nErr}.`;
      if (Array.isArray(result?.warnings) && result.warnings.length) {
        text += "\n\nAvisos:\n" + result.warnings.join("\n");
      }
      Alert.alert(nErr > 0 ? "Importación parcial" : "Importación completada", text, [
        {
          text: "Ir a hojas de gasto",
          onPress: () => navigation.replace("HojasGasto"),
        },
        { text: "Cerrar", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e?.message || "No se pudo importar.";
      const title = isImportPlantillaMismatchError_(e) ? "Plantilla incorrecta" : "Error";
      notifyUser_(title, msg);
    } finally {
      setBusy(false);
    }
  };

  const attachFilesToLine = async (ln) => {
    const key = importLineKey_(ln);
    if (!key || uploadingLineKey) return;
    try {
      const picked = await pickExpenseSheetAttachmentFiles();
      if (!picked.length) return;
      setUploadingLineKey(key);
      const uploaded = [];
      for (const file of picked) {
        const up = await uploadExpenseSheetAttachmentFile({
          uri: file.uri,
          fileName: file.name,
          mimeType: file.mimeType,
          userEmail: myEmail,
        });
        uploaded.push(up);
      }
      setLineAttachments((prev) => ({
        ...prev,
        [key]: [...(Array.isArray(prev[key]) ? prev[key] : []), ...uploaded],
      }));
    } catch (e) {
      notifyUser_("Error al subir", e?.message || "No se pudo subir la factura.");
    } finally {
      setUploadingLineKey("");
    }
  };

  const removeAttachment = (lineKey, index) => {
    setLineAttachments((prev) => {
      const list = Array.isArray(prev[lineKey]) ? [...prev[lineKey]] : [];
      list.splice(index, 1);
      const next = { ...prev };
      if (list.length) next[lineKey] = list;
      else delete next[lineKey];
      return next;
    });
  };

  const lineas = Array.isArray(preview?.lineas) ? preview.lineas : [];
  const warnings = Array.isArray(preview?.warnings) ? preview.warnings : [];

  if (!allowed) {
    return (
      <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Importar hoja Excel</Text>
          <Text style={styles.meta}>
            No tienes permiso para importar hojas Excel. Solo administración, gestor o responsable pueden usar esta
            función.
          </Text>
          <Pressable style={styles.btnGhost} onPress={() => navigation.goBack()}>
            <Text style={styles.btnGhostText}>Volver</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const plantillas = plantillasForFamilia_(familia);

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>Importar hoja Excel</Text>
        <Text style={styles.meta}>
          Indica si el Excel es de proyecto <Text style={styles.bold}>LIFE</Text> o{" "}
          <Text style={styles.bold}>estándar</Text>, elige la plantilla y después selecciona el archivo{" "}
          <Text style={styles.mono}>.xlsx / .xlsm</Text>. GESTIFLOTA validará que coincida antes de crear
          gastos pendientes.
        </Text>

        <Text style={styles.sectionTitle}>1. Familia de proyecto</Text>
        <View style={styles.templateList}>
          {EXCEL_IMPORT_FAMILIAS.map((fam) => {
            const selected = familia === fam.id;
            return (
              <Pressable
                key={fam.id}
                style={[styles.templateBtn, selected && styles.templateBtnSelected]}
                onPress={() => selectFamilia(fam.id)}
                disabled={busy}
              >
                <Text style={[styles.templateBtnTitle, selected && styles.templateBtnTitleSelected]}>
                  {fam.label}
                </Text>
                <Text style={[styles.templateBtnHint, selected && styles.templateBtnHintSelected]}>
                  {fam.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>2. Tipo de hoja</Text>
        <View style={styles.templateList}>
          {plantillas.map((tpl) => {
            const selected = plantillaEsperada === tpl.id;
            return (
              <Pressable
                key={tpl.id}
                style={[styles.templateBtn, selected && styles.templateBtnSelected]}
                onPress={() => selectPlantilla(tpl.id)}
                disabled={busy}
              >
                <Text style={[styles.templateBtnTitle, selected && styles.templateBtnTitleSelected]}>
                  {tpl.label}
                </Text>
                <Text style={[styles.templateBtnHint, selected && styles.templateBtnHintSelected]}>
                  {tpl.hint}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>3. Archivo Excel</Text>
        {plantillaEsperada ? (
          <Text style={styles.selectedHint}>
            Plantilla seleccionada: <Text style={styles.bold}>{plantillaImportLabel_(plantillaEsperada)}</Text>
          </Text>
        ) : (
          <Text style={styles.selectedHint}>Selecciona primero un tipo de hoja arriba.</Text>
        )}

        <Pressable
          style={[styles.btn, (!plantillaEsperada || busy) && styles.btnDisabled]}
          onPress={pickAndPreview}
          disabled={!plantillaEsperada || busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Elegir archivo Excel</Text>
          )}
        </Pressable>

        {fileMeta ? (
          <Text style={styles.fileName}>
            {fileMeta.file_name || "Archivo"} · ID {fileMeta.file_id}
          </Text>
        ) : null}

        {importError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>{importErrorTitle || "Error"}</Text>
            <Text style={styles.errorText}>{importError}</Text>
          </View>
        ) : null}

        {preview ? (
          <View style={styles.previewBox}>
            <Text style={styles.previewTitle}>Vista previa</Text>
            <Text style={styles.previewText}>{formatImportPreviewSummary(preview)}</Text>
            {warnings.length ? (
              <Text style={styles.warnText}>
                Avisos:{"\n"}
                {warnings.join("\n")}
              </Text>
            ) : null}
            <Text style={styles.linesTitle}>Líneas detectadas ({lineas.length})</Text>
            {lineas.slice(0, 40).map((ln, idx) => {
              const key = importLineKey_(ln);
              const files = Array.isArray(lineAttachments[key]) ? lineAttachments[key] : [];
              const uploading = uploadingLineKey === key;
              return (
                <View key={`${ln.seccion}-${ln.fila_excel}-${idx}`} style={styles.lineBlock}>
                  <Text style={styles.lineItem}>
                    {ln.seccion} · fila {ln.fila_excel} · {ln.fecha || "?"} · {ln.tipo_gasto} ·{" "}
                    {lineLabel_(ln)}
                  </Text>
                  <View style={styles.lineAttachRow}>
                    <Pressable
                      style={[styles.attachBtn, (busy || uploading) && styles.btnDisabled]}
                      onPress={() => attachFilesToLine(ln)}
                      disabled={busy || !!uploadingLineKey}
                    >
                      <Text style={styles.attachBtnText}>
                        {uploading ? "Subiendo…" : files.length ? "Añadir factura" : "Adjuntar factura"}
                      </Text>
                    </Pressable>
                    {files.length ? (
                      <Text style={styles.attachCount}>{files.length} archivo(s)</Text>
                    ) : null}
                  </View>
                  {files.map((file, fi) => (
                    <View key={`${key}-${fi}`} style={styles.attachChip}>
                      <Text style={styles.attachChipText} numberOfLines={1}>
                        {attachmentLabel_(file)}
                      </Text>
                      <Pressable onPress={() => removeAttachment(key, fi)} disabled={busy}>
                        <Text style={styles.attachRemove}>Quitar</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              );
            })}
            {lineas.length > 40 ? (
              <Text style={styles.meta}>… y {lineas.length - 40} líneas más</Text>
            ) : null}

            <Text style={styles.attachHelp}>
              Opcional: adjunta PDF o foto de factura/ticket a cada línea. Se vincularán al gasto importado y
              podrán salir en el anexo de la hoja de gasto.
            </Text>

            <Pressable
              style={[styles.btnPrimary, busy && styles.btnDisabled]}
              onPress={confirmImport}
              disabled={busy || lineas.length === 0}
            >
              <Text style={styles.btnText}>Importar a GESTIFLOTA</Text>
            </Pressable>
          </View>
        ) : null}

        <Pressable style={styles.btnGhost} onPress={() => navigation.goBack()} disabled={busy}>
          <Text style={styles.btnGhostText}>Volver</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: { color: theme.colors.text, fontSize: 20, fontWeight: "800" },
  sectionTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "800", marginTop: 4 },
  meta: { color: theme.colors.subtext, fontSize: 14, lineHeight: 20 },
  bold: { fontWeight: "700", color: theme.colors.text },
  mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  templateList: { gap: 8 },
  templateBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  templateBtnSelected: {
    borderColor: theme.colors.primary || "#1b7f4e",
    backgroundColor: "rgba(27,127,78,0.12)",
  },
  templateBtnTitle: { color: theme.colors.text, fontWeight: "700", fontSize: 15 },
  templateBtnTitleSelected: { color: theme.colors.primary || "#1b7f4e" },
  templateBtnHint: { color: theme.colors.subtext, fontSize: 12, marginTop: 4, lineHeight: 17 },
  templateBtnHintSelected: { color: theme.colors.text },
  selectedHint: { color: theme.colors.subtext, fontSize: 13 },
  btn: {
    backgroundColor: "#2a5f8f",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimary: {
    backgroundColor: theme.colors.primary || "#1b7f4e",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "700" },
  btnGhost: { paddingVertical: 10, alignItems: "center" },
  btnGhostText: { color: theme.colors.subtext, fontWeight: "600" },
  fileName: { color: theme.colors.subtext, fontSize: 12 },
  errorBox: {
    marginTop: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(180,40,40,0.12)",
    borderWidth: 1,
    borderColor: "rgba(220,80,80,0.55)",
    gap: 6,
  },
  errorTitle: { color: "#f07171", fontWeight: "800", fontSize: 15 },
  errorText: { color: theme.colors.text, fontSize: 13, lineHeight: 19 },
  previewBox: {
    marginTop: 4,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: 8,
  },
  previewTitle: { color: theme.colors.text, fontWeight: "800", fontSize: 16 },
  previewText: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
  warnText: { color: "#e6b84d", fontSize: 13, lineHeight: 18 },
  linesTitle: { color: theme.colors.text, fontWeight: "700", marginTop: 4 },
  lineItem: { color: theme.colors.subtext, fontSize: 12, lineHeight: 17 },
  lineBlock: { gap: 4, marginBottom: 6 },
  lineAttachRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  attachBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  attachBtnText: { color: theme.colors.text, fontSize: 12, fontWeight: "600" },
  attachCount: { color: theme.colors.subtext, fontSize: 11 },
  attachChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "rgba(27,127,78,0.1)",
  },
  attachChipText: { color: theme.colors.text, fontSize: 11, flex: 1 },
  attachRemove: { color: "#f07171", fontSize: 11, fontWeight: "700" },
  attachHelp: { color: theme.colors.subtext, fontSize: 12, lineHeight: 17, marginTop: 4 },
});
