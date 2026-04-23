function apiAdjuntoSubir(payload) {
  payload = payload || {};
  var base64 = String(payload.base64 || "");
  var mime = String(payload.mime_type || "image/jpeg");
  var name = String(payload.file_name || ("adjunto-" + new Date().getTime() + ".jpg"));

  if (!base64) throw new Error("Falta campo: base64");

  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mime, name);

  // Crea (o reutiliza) carpeta en Drive
  var folderName = "GESTIFLOTA_ADJUNTOS";
  var it = DriveApp.getFoldersByName(folderName);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(folderName);

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var fileId = file.getId();
  var url = "https://drive.google.com/uc?export=view&id=" + fileId;

  return { url: url, file_id: fileId, file_name: file.getName(), mime_type: mime };
}