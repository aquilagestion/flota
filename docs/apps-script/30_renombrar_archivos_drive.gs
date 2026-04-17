/**
 * Renombrado masivo de archivos de Google Drive desde una hoja.
 * Incluye:
 * - Vista previa
 * - Soporte de enlaces en texto, fórmula HYPERLINK y rich text
 * - Registro de estado por fila
 */

function abrirDialogoRenombrar() {
  var html = HtmlService.createHtmlOutputFromFile("FormularioRenombrar")
    .setWidth(700)
    .setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, "Renombrar archivos de Drive con vista previa");
}

function obtenerHojas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return [];
  return ss.getSheets().map(function(sheet) {
    return sheet.getName();
  });
}

function obtenerVistaPrevia(datos) {
  var validacion = validarDatosEntrada_(datos);
  if (!validacion.ok) return [{ error: validacion.error }];

  var sheet = validacion.sheet;
  var colNombreIdx = validacion.colNombreIdx;
  var colEnlaceIdx = validacion.colEnlaceIdx;
  var cadena = validacion.cadena;
  var posicion = validacion.posicion;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var maxCol = Math.max(colNombreIdx, colEnlaceIdx);
  var numRows = lastRow - 1;

  var values = sheet.getRange(2, 1, numRows, maxCol).getValues();
  var formulas = sheet.getRange(2, 1, numRows, maxCol).getFormulas();
  var richTexts = sheet.getRange(2, 1, numRows, maxCol).getRichTextValues();

  var preview = [];

  for (var i = 0; i < numRows; i++) {
    var nombreArchivo = limpiarValor_(values[i][colNombreIdx - 1]);
    var enlaceRaw = values[i][colEnlaceIdx - 1];
    var formulaEnlace = formulas[i][colEnlaceIdx - 1];
    var richTextEnlace = richTexts[i][colEnlaceIdx - 1];
    var enlace = extraerEnlaceCelda_(enlaceRaw, formulaEnlace, richTextEnlace);
    var fileId = extraerFileId_(enlace);

    var nuevoNombre = "";
    var estado = "";

    if (!nombreArchivo && !enlace) {
      estado = "Fila vacia";
    } else if (!nombreArchivo || !enlace) {
      estado = "Fila incompleta";
    } else if (!fileId) {
      estado = "No se pudo extraer ID";
      nuevoNombre = construirNuevoNombre_(nombreArchivo, cadena, posicion);
    } else {
      nuevoNombre = construirNuevoNombre_(nombreArchivo, cadena, posicion);
      estado = "Listo para renombrar";
    }

    preview.push({
      fila: i + 2,
      nombreActual: nombreArchivo,
      nuevoNombre: nuevoNombre,
      enlace: enlace || "",
      fileId: fileId || "",
      estado: estado
    });
  }

  return preview;
}

function renombrarArchivos(datos) {
  var validacion = validarDatosEntrada_(datos);
  if (!validacion.ok) {
    SpreadsheetApp.getUi().alert("Error: " + validacion.error);
    return;
  }

  var sheet = validacion.sheet;
  var colNombreIdx = validacion.colNombreIdx;
  var colEnlaceIdx = validacion.colEnlaceIdx;
  var cadena = validacion.cadena;
  var posicion = validacion.posicion;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert("No hay filas de datos para procesar.");
    return;
  }

  var colEstadoIdx = obtenerOCrearColumnaEstado_(sheet);
  var maxCol = Math.max(colNombreIdx, colEnlaceIdx);
  var numRows = lastRow - 1;

  var range = sheet.getRange(2, 1, numRows, maxCol);
  var values = range.getValues();
  var formulas = range.getFormulas();
  var richTexts = range.getRichTextValues();

  var estados = [];
  var totalRenombrados = 0;
  var totalErrores = 0;
  var totalOmitidos = 0;

  for (var i = 0; i < numRows; i++) {
    var nombreArchivo = limpiarValor_(values[i][colNombreIdx - 1]);
    var enlaceRaw = values[i][colEnlaceIdx - 1];
    var formulaEnlace = formulas[i][colEnlaceIdx - 1];
    var richTextEnlace = richTexts[i][colEnlaceIdx - 1];
    var enlace = extraerEnlaceCelda_(enlaceRaw, formulaEnlace, richTextEnlace);

    var estado = "";

    if (!nombreArchivo && !enlace) {
      estado = "Omitido: fila vacia";
      totalOmitidos++;
      estados.push([estado]);
      continue;
    }

    if (!nombreArchivo || !enlace) {
      estado = "Omitido: fila incompleta";
      totalOmitidos++;
      estados.push([estado]);
      continue;
    }

    var fileId = extraerFileId_(enlace);
    if (!fileId) {
      estado = "Error: no se pudo extraer fileId";
      totalErrores++;
      estados.push([estado]);
      continue;
    }

    try {
      var file = DriveApp.getFileById(fileId);
      var nuevoNombre = construirNuevoNombre_(nombreArchivo, cadena, posicion);
      file.setName(nuevoNombre);
      estado = "Renombrado -> " + nuevoNombre;
      totalRenombrados++;
    } catch (e) {
      estado = "Error: " + e.message;
      totalErrores++;
    }

    estados.push([estado]);
  }

  sheet.getRange(2, colEstadoIdx, estados.length, 1).setValues(estados);

  SpreadsheetApp.getUi().alert(
    "Proceso terminado.\n" +
    "Renombrados: " + totalRenombrados + "\n" +
    "Errores: " + totalErrores + "\n" +
    "Omitidos: " + totalOmitidos + "\n\n" +
    "Revisa la columna 'Estado' para detalle por fila."
  );
}

function validarDatosEntrada_(datos) {
  if (!datos) return { ok: false, error: "No se recibieron datos." };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return { ok: false, error: "No hay Spreadsheet activo." };

  var hoja = limpiarValor_(datos.hoja);
  var colNombre = limpiarValor_(datos.colNombre).toUpperCase();
  var colEnlace = limpiarValor_(datos.colEnlace).toUpperCase();
  var cadena = limpiarValor_(datos.cadena);
  var posicion = limpiarValor_(datos.posicion);

  if (!hoja) return { ok: false, error: "Debes indicar la hoja." };
  if (!colNombre || !/^[A-Z]+$/.test(colNombre)) return { ok: false, error: "Columna Nombre invalida." };
  if (!colEnlace || !/^[A-Z]+$/.test(colEnlace)) return { ok: false, error: "Columna Enlace invalida." };
  if (!cadena) return { ok: false, error: "La cadena para agregar no puede estar vacia." };
  if (posicion !== "principio" && posicion !== "final") {
    return { ok: false, error: "La posicion debe ser 'principio' o 'final'." };
  }

  var sheet = ss.getSheetByName(hoja);
  if (!sheet) return { ok: false, error: "La hoja '" + hoja + "' no existe." };

  return {
    ok: true,
    sheet: sheet,
    colNombreIdx: letraAIndice_(colNombre),
    colEnlaceIdx: letraAIndice_(colEnlace),
    cadena: cadena,
    posicion: posicion
  };
}

function obtenerOCrearColumnaEstado_(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = headers.indexOf("Estado") + 1;
  if (idx > 0) return idx;

  idx = sheet.getLastColumn() + 1;
  sheet.getRange(1, idx).setValue("Estado");
  return idx;
}

function construirNuevoNombre_(nombreActual, cadena, posicion) {
  return posicion === "principio" ? (cadena + nombreActual) : (nombreActual + cadena);
}

function limpiarValor_(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function letraAIndice_(letra) {
  var l = limpiarValor_(letra).toUpperCase();
  var base = "A".charCodeAt(0) - 1;
  var num = 0;
  for (var i = 0; i < l.length; i++) {
    num = num * 26 + (l.charCodeAt(i) - base);
  }
  return num;
}

function extraerEnlaceCelda_(valor, formula, richText) {
  var texto = limpiarValor_(valor);
  if (texto && /^https?:\/\//i.test(texto)) return texto;

  var fromFormula = extraerUrlDesdeFormulaHyperlink_(formula);
  if (fromFormula) return fromFormula;

  if (richText) {
    var richUrl = richText.getLinkUrl();
    if (richUrl) return richUrl;
  }

  return texto;
}

function extraerUrlDesdeFormulaHyperlink_(formula) {
  var f = limpiarValor_(formula);
  if (!f) return "";

  var m = f.match(/^=HYPERLINK\("([^"]+)"/i);
  return m ? m[1] : "";
}

function extraerFileId_(url) {
  var u = limpiarValor_(url);
  if (!u) return null;

  var byD = u.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (byD) return byD[1];

  var byIdQuery = u.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (byIdQuery) return byIdQuery[1];

  var onlyId = u.match(/^([a-zA-Z0-9_-]{10,})$/);
  if (onlyId) return onlyId[1];

  return null;
}
