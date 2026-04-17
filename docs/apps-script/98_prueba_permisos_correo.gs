// ======================================================================
// 98_prueba_permisos_correo.gs (opcional)
// Copia este archivo al proyecto Apps Script o pega las funciones al final
// de un .gs. Ejecuta UNA desde el editor (▶) para disparar la autorización
// de Gmail/MailApp. Luego puedes borrar este archivo o las funciones.
//
// Session.getActiveUser().getEmail() exige en appsscript.json el ámbito:
//   https://www.googleapis.com/auth/userinfo.email
// Si no quieres añadirlo, usa PRUEBA_PERMISOS_CORREO con tu email literal.
// ======================================================================

/** Sin Session: pon tu correo y ejecuta ▶ (solo pide permisos de envío). */
function PRUEBA_PERMISOS_CORREO() {
  var to = "CAMBIA_POR_TU_EMAIL@dominio.com";
  if (to.indexOf("CAMBIA") >= 0) {
    throw new Error("Edita 98_prueba_permisos_correo.gs y pon tu email en la variable to.");
  }
  GmailApp.sendEmail(to, "[FLOTA] Prueba permisos Gmail", "Si lees esto, GmailApp está autorizado.");
}

/**
 * Usa la cuenta con la que ejecutas en el editor.
 * Requiere en appsscript.json: https://www.googleapis.com/auth/userinfo.email
 */
function PRUEBA_PERMISOS_CORREO_CUENTA_EDITOR() {
  var to = Session.getActiveUser().getEmail();
  GmailApp.sendEmail(to, "[FLOTA] Prueba permisos Gmail", "OK — cuenta: " + to);
}
