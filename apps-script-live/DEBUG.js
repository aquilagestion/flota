// ======================================================================
// debug.gs — Solo odómetro / Gemini (no dupliques setupSecrets ni setup de hojas aquí;
// eso va en 11_setup.gs y 10_gastos_por_tipo.gs).
// ======================================================================

function apiOdometroExtraer(payload) {
  payload = payload || {};
  var fileName = String(payload.file_name || "odometro-" + new Date().getTime() + ".jpg").trim();
  var mimeType = String(payload.mime_type || "image/jpeg").trim();
  var b64 = String(payload.base64 || "").trim();
  if (!b64) throw new Error("Falta campo: base64");

  var text = "";
  var driveErr = "";
  try {
    var blob = base64ToBlobSafe_(b64, mimeType, fileName);
    text = ocrImageToText_(blob, fileName, payload.ocr_language || "es");
  } catch (eDrive) {
    driveErr = eDrive && eDrive.message ? String(eDrive.message) : "Drive OCR no disponible";
  }

  var km = extractKmFromOcrText_(text);
  if (!km) {
    try {
      var gem = geminiExtractKmFromBase64_(b64, mimeType);
      if (gem && gem.km) {
        km = String(gem.km);
        text = String(text || "") + (text ? "\n---\n" : "") + "[GEMINI]\n" + String(gem.rawText || "");
      }
    } catch (eGem) {
      var gemErr = eGem && eGem.message ? String(eGem.message) : "Gemini OCR no disponible";
      throw new Error("OCR no disponible. Drive: " + driveErr + " | Gemini: " + gemErr);
    }
  }

  if (!km) {
    throw new Error(
      "No se detectaron kilometros en la imagen del cuentakilometros. " + (driveErr ? "Detalle Drive: " + driveErr : "")
    );
  }

  return {
    km: String(km),
    kilometros: String(km),
    texto_ocr: String(text || "").slice(0, 2000),
  };
}

function base64ToBlobSafe_(base64, mimeType, fileName) {
  var clean = String(base64 || "")
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/\s+/g, "");
  var bytes = Utilities.base64Decode(clean);
  return Utilities.newBlob(bytes, mimeType || "image/jpeg", fileName || "odometro.jpg");
}

function ocrImageToText_(imageBlob, fileName, lang) {
  var file = null;
  try {
    var metadata = {
      title: fileName || "odometro-" + new Date().getTime(),
      name: fileName || "odometro-" + new Date().getTime(),
      mimeType: MimeType.GOOGLE_DOCS,
    };
    if (Drive && Drive.Files && typeof Drive.Files.create === "function") {
      file = Drive.Files.create(metadata, imageBlob, {
        ocrLanguage: String(lang || "es"),
      });
    } else if (Drive && Drive.Files && typeof Drive.Files.insert === "function") {
      file = Drive.Files.insert(metadata, imageBlob, { ocr: true, ocrLanguage: String(lang || "es") });
    } else {
      throw new Error("Drive.Files.create/insert no disponible");
    }
    if (!file || !file.id) throw new Error("Drive.Files.create/insert no devolvio id");
    var txt = DocumentApp.openById(file.id).getBody().getText();
    return String(txt || "");
  } catch (err) {
    var msg = err && err.message ? String(err.message) : "OCR no disponible";
    throw new Error("OCR no disponible. Activa Drive API (servicio avanzado + cloud project). Detalle: " + msg);
  } finally {
    try {
      if (file && file.id) DriveApp.getFileById(file.id).setTrashed(true);
    } catch (_) {}
  }
}

function extractKmFromOcrText_(text) {
  var raw = String(text || "");
  if (!raw) return "";

  var normalized = raw
    .toUpperCase()
    .replace(/[OQ]/g, "0")
    .replace(/[I|L]/g, "1");

  var lines = normalized.split(/\r?\n/);
  var candidates = [];

  for (var i = 0; i < lines.length; i++) {
    var ln = String(lines[i] || "");
    if (!/(KM|KMS|KILOMET|ODOMET)/.test(ln)) continue;
    collectKmCandidates_(ln, candidates);
  }

  if (!candidates.length) collectKmCandidates_(normalized, candidates);
  if (!candidates.length) return "";

  candidates.sort(function (a, b) {
    return b - a;
  });
  return String(candidates[0]);
}

function collectKmCandidates_(str, outArr) {
  var re = /(\d{1,3}(?:[.,\s]\d{3})+|\d{4,7})/g;
  var m;
  while ((m = re.exec(str)) !== null) {
    var digits = String(m[1] || "").replace(/[^\d]/g, "");
    if (digits.length < 4 || digits.length > 7) continue;
    var n = parseInt(digits, 10);
    if (!isNaN(n)) outArr.push(n);
  }
}

function getGeminiApiKey_() {
  var key = String(PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY") || "").trim();
  if (!key) throw new Error("Falta Script Property GEMINI_API_KEY");
  return key;
}

function geminiExtractKmFromBase64_(base64, mimeType) {
  var apiKey = getGeminiApiKey_();
  var model = String(PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL") || "gemini-1.5-flash").trim();
  var endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);

  var prompt =
    "Extrae SOLO la lectura del cuentakilometros/odometro de la imagen. " +
    'Responde en JSON estricto con esta forma: {"km":"123456"}. ' +
    'Si no se ve claro, responde {"km":""}.';

  var body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: String(mimeType || "image/jpeg"),
              data: String(base64 || "").replace(/^data:[^;]+;base64,/, ""),
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
    },
  };

  var res = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  var txt = String(res.getContentText() || "");
  if (code < 200 || code >= 300) {
    throw new Error("Gemini HTTP " + code + ": " + txt.slice(0, 300));
  }

  var json = {};
  try {
    json = JSON.parse(txt);
  } catch (_) {
    throw new Error("Respuesta Gemini no JSON");
  }

  var rawText = extractGeminiText_(json);
  var km = "";

  try {
    var parsed = JSON.parse(rawText);
    km = String(parsed.km || "").replace(/[^\d]/g, "");
  } catch (_) {
    km = extractKmFromOcrText_(rawText);
  }

  return {
    km: String(km || ""),
    rawText: rawText,
  };
}

function extractGeminiText_(json) {
  var out = "";
  var cands = json && json.candidates ? json.candidates : [];
  for (var i = 0; i < cands.length; i++) {
    var parts = (((cands[i] || {}).content || {}).parts) || [];
    for (var j = 0; j < parts.length; j++) {
      if (parts[j] && parts[j].text) out += String(parts[j].text);
    }
  }
  return String(out || "").trim();
}
