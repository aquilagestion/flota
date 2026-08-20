import * as FileSystem from "expo-file-system/legacy";

function base64ToUint8Array_(b64) {
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function extractDriveFileId_(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  let m = /[?&]id=([^&]+)/i.exec(s);
  if (m) return decodeURIComponent(m[1]);
  m = /\/file\/d\/([^/]+)/i.exec(s);
  if (m) return decodeURIComponent(m[1]);
  m = /\/d\/([^/]+)/i.exec(s);
  if (m) return decodeURIComponent(m[1]);
  return "";
}

function isLocalUri_(uri) {
  const u = String(uri || "").trim();
  return /^file:\/\//i.test(u) || /^content:\/\//i.test(u) || /^data:/i.test(u);
}

function detectKind_(bytes, hintUrl = "") {
  if (!bytes || bytes.length < 4) return "";
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  const u = String(hintUrl || "").toLowerCase();
  if (u.includes("application/pdf") || /\.pdf(\?|$)/i.test(u)) return "pdf";
  return "";
}

async function readLocalUriBytes_(uri) {
  const u = String(uri || "").trim();
  if (/^data:/i.test(u)) {
    const comma = u.indexOf(",");
    if (comma < 0) throw new Error("Data URI inválida");
    const meta = u.slice(0, comma);
    const data = u.slice(comma + 1);
    const b64 = meta.includes(";base64") ? data : btoa(data);
    return base64ToUint8Array_(b64);
  }
  const enc = FileSystem.EncodingType?.Base64 || "base64";
  const b64 = await FileSystem.readAsStringAsync(u, { encoding: enc });
  return base64ToUint8Array_(b64);
}

async function fetchRemoteBytes_(url) {
  const id = extractDriveFileId_(url);
  const candidates = id
    ? [
        `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`,
        `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`,
        `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w3200`,
        url,
      ]
    : [url];
  let lastErr = null;
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { cache: "no-store" });
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (!buf || buf.byteLength < 400) continue;
      return new Uint8Array(buf);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(lastErr?.message || "No se pudo descargar el ticket");
}

/** Carga bytes de imagen o PDF de ticket (local o Drive). */
export async function loadTicketImageBytes(url) {
  const u = String(url || "").trim();
  if (!u) throw new Error("URL de ticket vacía");
  const bytes = isLocalUri_(u) ? await readLocalUriBytes_(u) : await fetchRemoteBytes_(u);
  const kind = detectKind_(bytes, u);
  if (!kind) throw new Error("El adjunto no es una imagen JPEG/PNG ni un PDF válido");
  return { bytes, kind };
}
