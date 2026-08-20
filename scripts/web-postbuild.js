/**
 * Tras `expo export --platform web --output-dir dist-web`:
 * - Restaura releases APK y apk-version.json
 * - Copia fuente de iconos a ruta estable e inyecta @font-face en index.html
 * - Actualiza version.json
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const dist = process.env.WEB_DIST_DIR
  ? path.resolve(root, process.env.WEB_DIST_DIR)
  : path.join(root, "dist-web");
const releases = path.join(dist, "releases");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readVersion() {
  const appJson = readJson(path.join(root, "app.json"));
  return String(appJson?.expo?.version || "0.0.0").trim();
}

function parseSemver_(version) {
  const m = String(version || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), raw: m[0] };
}

function compareSemver_(a, b) {
  const sa = parseSemver_(a);
  const sb = parseSemver_(b);
  if (!sa && !sb) return 0;
  if (!sa) return -1;
  if (!sb) return 1;
  if (sa.major !== sb.major) return sa.major - sb.major;
  if (sa.minor !== sb.minor) return sa.minor - sb.minor;
  return sa.patch - sb.patch;
}

function findLatestApkRelease_() {
  const dir = path.join(root, "flota_releases");
  if (!fs.existsSync(dir)) return null;
  let best = null;
  for (const name of fs.readdirSync(dir)) {
    const m = String(name).match(/^GESTIFLOTA_(\d+\.\d+\.\d+)\.apk$/i);
    if (!m) continue;
    const version = m[1];
    const full = path.join(dir, name);
    if (!best || compareSemver_(version, best.version) > 0) {
      best = { version, apkPath: full, fileName: name };
    }
  }
  return best;
}

function findMaterialCommunityFont_(dir) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/^MaterialCommunityIcons.*\.ttf$/i.test(entry.name)) return full;
    }
  }
  return null;
}

function setupWebIconFonts_() {
  const srcFont = findMaterialCommunityFont_(path.join(dist, "assets"));
  if (!srcFont) {
    console.warn("[web-postbuild] No se encontró MaterialCommunityIcons.ttf en assets/");
    return null;
  }
  const fontsDir = path.join(dist, "assets", "fonts");
  fs.mkdirSync(fontsDir, { recursive: true });
  const destName = "material-community.ttf";
  const destFont = path.join(fontsDir, destName);
  fs.copyFileSync(srcFont, destFont);
  const publicUrl = `/assets/fonts/${destName}`;
  console.log(`[web-postbuild] Fuente iconos web: ${publicUrl}`);
  return publicUrl;
}

function injectIconFontsInHtml_(html) {
  if (html.includes("gestiflota-mdi-icons")) return html;
  const block = `
  <link id="gestiflota-mdi-icons" rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css" crossorigin="anonymous" />`;
  return html.replace("</head>", `${block}\n</head>`);
}

const version = readVersion();
const exactApkSrc = path.join(root, "flota_releases", `GESTIFLOTA_${version}.apk`);
const latestApk = findLatestApkRelease_();
const apkSrc = fs.existsSync(exactApkSrc) ? exactApkSrc : latestApk?.apkPath || "";
const apkVersion = fs.existsSync(exactApkSrc) ? version : latestApk?.version || version;

// Logos de plantillas LIFE/GREFA para PDF en web (rutas /sheets/logos/...).
const logosSrc = path.join(root, "web-static", "sheets", "logos");
const logosDest = path.join(dist, "sheets", "logos");
if (fs.existsSync(logosSrc)) {
  fs.mkdirSync(logosDest, { recursive: true });
  for (const name of fs.readdirSync(logosSrc)) {
    fs.copyFileSync(path.join(logosSrc, name), path.join(logosDest, name));
  }
  console.log(`[web-postbuild] Logos hojas: sheets/logos/ (${fs.readdirSync(logosDest).length} archivos)`);
}

// PDF.js (rasterizar tiquets PDF en anexo web).
const pdfjsSrc = path.join(root, "web-static", "vendor", "pdfjs");
const pdfjsDest = path.join(dist, "vendor", "pdfjs");
if (fs.existsSync(pdfjsSrc)) {
  fs.mkdirSync(pdfjsDest, { recursive: true });
  for (const name of fs.readdirSync(pdfjsSrc)) {
    fs.copyFileSync(path.join(pdfjsSrc, name), path.join(pdfjsDest, name));
  }
  console.log(`[web-postbuild] PDF.js: vendor/pdfjs/ (${fs.readdirSync(pdfjsDest).length} archivos)`);
}

const pdfLibSrc = path.join(root, "web-static", "vendor", "pdf-lib", "pdf-lib.min.js");
const pdfLibSrcFallback = path.join(root, "node_modules", "pdf-lib", "dist", "pdf-lib.min.js");
const pdfLibDestDir = path.join(dist, "vendor", "pdf-lib");
const pdfLibFile = fs.existsSync(pdfLibSrc) ? pdfLibSrc : pdfLibSrcFallback;
if (fs.existsSync(pdfLibFile)) {
  fs.mkdirSync(pdfLibDestDir, { recursive: true });
  fs.copyFileSync(pdfLibFile, path.join(pdfLibDestDir, "pdf-lib.min.js"));
  console.log("[web-postbuild] pdf-lib UMD: vendor/pdf-lib/pdf-lib.min.js");
}

if (!apkSrc) {
  console.warn(`[web-postbuild] Sin APK local para v${version} ni en flota_releases/`);
} else if (String(process.env.WEB_SKIP_APK || "").trim() === "1") {
  console.log("[web-postbuild] WEB_SKIP_APK=1: no se copia APK a este dist");
} else {
  fs.mkdirSync(releases, { recursive: true });
  const binName = `GESTIFLOTA_${apkVersion}.bin`;
  fs.copyFileSync(apkSrc, path.join(releases, binName));
  console.log(`[web-postbuild] APK publicado: releases/${binName}`);
  try {
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${apkSrc}' -DestinationPath '${path.join(
        releases,
        `GESTIFLOTA_${apkVersion}.zip`
      )}' -Force"`,
      { stdio: "inherit" }
    );
  } catch {
    // zip opcional
  }
}

const builtAt = new Date().toISOString();
const buildId = `${version}-${builtAt.replace(/[-:TZ.]/g, "").slice(0, 14)}`;
fs.writeFileSync(
  path.join(dist, "version.json"),
  JSON.stringify({ version, buildId, builtAt }, null, 2) + "\n",
  "utf8"
);

const manifestPath = path.join(dist, "apk-version.json");
const manifestVersion = apkSrc ? apkVersion : version;
const manifestDownloadUrl = apkSrc
  ? `https://gestiflota.web.app/releases/GESTIFLOTA_${apkVersion}.bin`
  : "";
fs.writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      version: manifestVersion,
      downloadUrl: manifestDownloadUrl,
      builtAt,
      releaseNotes: apkSrc
        ? `Web ${version} · APK ${apkVersion} publicado.`
        : `Web ${version} · sin APK publicado aún.`,
    },
    null,
    2
  ) + "\n",
  "utf8"
);
console.log(`[web-postbuild] apk-version.json → v${manifestVersion}`);

function injectWebZoomCss_(html) {
  if (html.includes("gestiflota-web-zoom")) return html;
  const block = `
    <style id="gestiflota-web-zoom">
      html, body { zoom: 0.75; }
    </style>`;
  return html.replace("</head>", `${block}\n</head>`);
}

const pageTitle = String(process.env.WEB_PAGE_TITLE || "GESTIFLOTA").trim() || "GESTIFLOTA";
const appShortName = String(process.env.WEB_APP_SHORT_NAME || pageTitle).trim() || pageTitle;

const indexHtml = path.join(dist, "index.html");
if (fs.existsSync(indexHtml)) {
  let html = fs.readFileSync(indexHtml, "utf8");
  html = html.replace(/<title>app<\/title>/i, `<title>${pageTitle}</title>`);
  html = html.replace(/<html lang="en">/i, '<html lang="es">');
  html = injectIconFontsInHtml_(html);
  html = injectWebZoomCss_(html);
  if (!html.includes("gestiflota-build")) {
    html = html.replace(
      "</head>",
      `  <meta name="gestiflota-build" content="${buildId}" />\n  <link rel="manifest" href="/manifest.webmanifest" />\n</head>`
    );
  }
  if (!html.includes("gestiflota-sw-cleanup")) {
    html = html.replace(
      "</body>",
      `  <script id="gestiflota-sw-cleanup">if("serviceWorker"in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister()})});if(window.caches){caches.keys().then(function(k){k.forEach(function(n){caches.delete(n)})})}}</script>\n</body>`
    );
  }
  fs.writeFileSync(indexHtml, html, "utf8");
}

if (!fs.existsSync(path.join(dist, "manifest.webmanifest"))) {
  fs.writeFileSync(
    path.join(dist, "manifest.webmanifest"),
    JSON.stringify(
      {
        name: pageTitle,
        short_name: appShortName,
        start_url: "/",
        display: "standalone",
        background_color: "#071423",
        theme_color: "#071423",
      },
      null,
      2
    ) + "\n",
    "utf8"
  );
}

console.log(`[web-postbuild] OK dist ${version} (${buildId})`);
