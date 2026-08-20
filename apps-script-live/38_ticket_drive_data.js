// 38_ticket_drive_data.js
// Devuelve base64 + mime de un archivo de Drive (imagen o PDF) para preview/anexo.

function apiTicketDriveData(payload) {
  payload = payload || {};
  var fileId = String(payload.file_id || payload.fileId || "").trim();
  if (!fileId) throw new Error("Falta campo: file_id");

  var got = driveGetFileBlob_(fileId);
  var meta = got.meta || {};
  var blob = got.blob;
  var mime = String(meta.mimeType || (blob && blob.getContentType && blob.getContentType()) || "application/octet-stream").trim();
  var name = String(meta.name || (blob && blob.getName && blob.getName()) || "").trim();
  var bytes = blob.getBytes();
  var b64 = Utilities.base64Encode(bytes);

  return {
    file_id: fileId,
    file_name: name,
    mimeType: mime,
    mime_type: mime,
    base64: b64,
  };
}
