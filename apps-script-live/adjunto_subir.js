function apiAdjuntoSubir(payload) {
  payload = payload || {};
  var base64 = String(payload.base64 || "");
  var mime = String(payload.mime_type || "image/jpeg");
  var name = String(payload.file_name || "adjunto-" + new Date().getTime() + ".jpg");

  if (!base64) throw new Error("Falta campo: base64");

  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mime, name);

  var parentId = driveResolveUploadParentId_(payload);
  var folderId = parentId || driveGetOrCreateFolder_("GESTIFLOTA_ADJUNTOS");

  var file = driveCreateFileInFolder_(folderId, name, blob, mime);
  driveSetAnyoneWithLinkView_(file.id);

  var url = "https://drive.google.com/uc?export=view&id=" + file.id;

  return {
    url: url,
    file_id: file.id,
    file_name: String(file.name || name),
    mime_type: mime,
  };
}
