function autorizarUrlFetch_() {
  var r = UrlFetchApp.fetch("https://www.google.com", { muteHttpExceptions: true });
  Logger.log(r.getResponseCode());
}