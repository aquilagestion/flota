// Utilidades Drive API v3 (evita DriveApp, bloqueado en algunos despliegues).

function assertDriveApi_() {
  if (!Drive || !Drive.Files || typeof Drive.Files.create !== "function") {
    throw new Error("Drive API no disponible. Activa el servicio avanzado Drive v3 en Apps Script.");
  }
}

function driveEscapeQuery_(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function driveGetOrCreateFolder_(folderName, parentId) {
  assertDriveApi_();
  var esc = driveEscapeQuery_(folderName);
  var q =
    "mimeType='application/vnd.google-apps.folder' and name='" +
    esc +
    "' and trashed=false";
  if (parentId) {
    q += " and '" + driveEscapeQuery_(parentId) + "' in parents";
  }
  var list = Drive.Files.list({
    q: q,
    fields: "files(id,name)",
    pageSize: 1,
    spaces: "drive",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  var files = list && list.files ? list.files : [];
  if (files.length) return files[0].id;

  var meta = { name: folderName, mimeType: "application/vnd.google-apps.folder" };
  if (parentId) meta.parents = [parentId];
  var folder = Drive.Files.create(meta, null, { supportsAllDrives: true });
  if (!folder || !folder.id) throw new Error("No se pudo crear carpeta en Drive");
  return folder.id;
}

function driveCreateFileInFolder_(parentId, name, blob, mimeType) {
  assertDriveApi_();
  var meta = { name: name, parents: [parentId] };
  if (mimeType) meta.mimeType = mimeType;
  var file = Drive.Files.create(meta, blob, { supportsAllDrives: true });
  if (!file || !file.id) throw new Error("No se pudo crear archivo en Drive");
  return file;
}

function driveSetAnyoneWithLinkView_(fileId) {
  assertDriveApi_();
  try {
    Drive.Permissions.create(
      { role: "reader", type: "anyone" },
      fileId,
      { supportsAllDrives: true }
    );
  } catch (e) {
    var msg = e && e.message ? String(e.message) : "";
    if (msg.indexOf("already exists") >= 0) return;
    // En unidades compartidas el permiso puede gestionarse a nivel carpeta; no bloquear la subida.
  }
}

function driveGetFileMeta_(fileId) {
  assertDriveApi_();
  return Drive.Files.get(fileId, {
    fields: "id,name,mimeType,thumbnailLink",
    supportsAllDrives: true,
  });
}

function driveGetFileBlob_(fileId) {
  assertDriveApi_();
  var meta = driveGetFileMeta_(fileId);
  var token = ScriptApp.getOAuthToken();
  var url =
    "https://www.googleapis.com/drive/v3/files/" +
    encodeURIComponent(fileId) +
    "?alt=media&supportsAllDrives=true";
  var resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error(
      "No se pudo leer el archivo de Drive (HTTP " + resp.getResponseCode() + ")"
    );
  }
  var blob = resp.getBlob();
  if (meta.mimeType) blob.setContentType(meta.mimeType);
  if (meta.name) blob.setName(meta.name);
  return { meta: meta, blob: blob };
}

function driveGetThumbnailBlob_(meta) {
  var link = String(meta && meta.thumbnailLink ? meta.thumbnailLink : "").trim();
  if (!link) return null;
  try {
    var token = ScriptApp.getOAuthToken();
    var resp = UrlFetchApp.fetch(link, {
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true,
    });
    if (resp.getResponseCode() !== 200) return null;
    var blob = resp.getBlob();
    if (!blob.getBytes || blob.getBytes().length === 0) return null;
    return blob;
  } catch (_) {
    return null;
  }
}

function driveResolveUploadParentId_(payload) {
  payload = payload || {};
  var dest = payload.destination || {};
  return String(
    payload.corporate_drive_folder_id ||
      payload.personal_drive_folder_id ||
      dest.corporate_drive_folder_id ||
      dest.personal_drive_folder_id ||
      ""
  ).trim();
}
