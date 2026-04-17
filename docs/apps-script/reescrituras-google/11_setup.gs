/**
 * 1) Pon temporalmente la misma cadena que EXPO_PUBLIC_API_SECRET en `secret` abajo.
 * 2) Ejecuta setupSecrets una vez en el editor.
 * 3) Borra el valor de `secret` (déjalo "") para no dejar la clave en el código.
 */
function setupSecrets() {
  var secret = "";
  secret = String(secret || "").trim();
  if (!secret) {
    throw new Error("Pega la API_SECRET en la variable secret, ejecuta, luego vacía secret.");
  }
  PropertiesService.getScriptProperties().setProperty("API_SECRET_KEY", secret);
  Logger.log("API_SECRET_KEY guardada en Script Properties");
}

function rotateSecret(nueva) {
  var s = String(nueva || "").trim();
  if (!s) throw new Error("Debes indicar una nueva clave");
  PropertiesService.getScriptProperties().setProperty("API_SECRET_KEY", s);
  Logger.log("API_SECRET_KEY actualizada");
}

function debugSecret() {
  var v = PropertiesService.getScriptProperties().getProperty("API_SECRET_KEY");
  Logger.log("API_SECRET_KEY definida: " + (v ? "sí (longitud " + String(v).length + ")" : "no"));
}
