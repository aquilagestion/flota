// ======================================================================
// 40_incidencia_sugerencia.js
// Envía incidencias / sugerencias de mejora por correo a los gestores.
// POST action=incidencia_sugerencia_enviar
// ======================================================================

function apiIncidenciaSugerenciaEnviar(payload) {
  payload = payload || {};
  var email = String(payload.user_email || payload.email || "").trim().toLowerCase();
  if (!email) throw new Error("Falta campo: user_email");

  var u = getUsuarioByEmail_(email);
  if (!u) throw new Error("Usuario no existe o está inactivo");

  var tipo = String(payload.tipo || "INCIDENCIA").trim().toUpperCase();
  if (tipo !== "INCIDENCIA" && tipo !== "SUGERENCIA") tipo = "INCIDENCIA";
  var asunto = String(payload.asunto || "").trim();
  var mensaje = String(payload.mensaje || "").trim();
  if (!asunto) throw new Error("Falta campo: asunto");
  if (!mensaje) throw new Error("Falta campo: mensaje");

  var nombre = String(payload.nombre || u.nombre || email).trim();
  var gestores = [];
  try {
    gestores = getGestoresActivosEmails_() || [];
  } catch (e0) {
    gestores = [];
  }
  if (!gestores.length) {
    throw new Error("No hay gestores activos configurados para recibir el aviso");
  }

  var tipoLabel = tipo === "SUGERENCIA" ? "Sugerencia de mejora" : "Incidencia";
  var subject = "[GESTIFLOTA] " + tipoLabel + ": " + asunto;
  var html =
    "<p>Se ha recibido una <b>" +
    tipoLabel.toLowerCase() +
    "</b> desde GESTIFLOTA.</p>" +
    "<p><b>Remitente:</b> " +
    String(nombre || "").replace(/</g, "&lt;") +
    " &lt;" +
    email +
    "&gt;<br/>" +
    "<b>Asunto:</b> " +
    String(asunto).replace(/</g, "&lt;") +
    "</p>" +
    "<p><b>Mensaje:</b></p>" +
    "<pre style=\"white-space:pre-wrap;font-family:Arial,sans-serif;\">" +
    String(mensaje).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
    "</pre>";

  var sendResult = null;
  if (typeof enviarCorreoHtml_ === "function") {
    sendResult = enviarCorreoHtml_(gestores, subject, html);
  } else {
    MailApp.sendEmail({
      to: gestores.join(","),
      subject: subject,
      htmlBody: html,
      replyTo: email,
    });
    sendResult = { sent: true };
  }

  if (sendResult && sendResult.sent === false) {
    throw new Error("No se pudo enviar el correo: " + String(sendResult.reason || "error"));
  }

  return {
    ok: true,
    tipo: tipo,
    destinatarios: gestores.length,
  };
}
