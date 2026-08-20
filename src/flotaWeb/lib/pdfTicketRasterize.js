/**
 * Rasteriza un PDF (data URI) a páginas JPEG para embeber en HTML/impresión web.
 * Usa PDF.js por CDN (evita líos de worker con Metro/Expo).
 */

let pdfJsPromise_ = null;

function parseDataUriToUint8_(dataUri) {
  const raw = String(dataUri || "").trim();
  const m = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i.exec(raw);
  if (!m) return null;
  const b64 = String(m[2] || "").replace(/\s/g, "");
  if (!b64 || typeof atob !== "function") return null;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function loadScriptOnce_(src) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Sin document"));
      return;
    }
    const existing = document.querySelector(`script[data-flota-pdfjs="1"]`);
    if (existing && window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.dataset.flotaPdfjs = "1";
    s.onload = () => {
      if (window.pdfjsLib) resolve(window.pdfjsLib);
      else reject(new Error("PDF.js no disponible tras cargar el script"));
    };
    s.onerror = () => reject(new Error("No se pudo cargar PDF.js"));
    document.head.appendChild(s);
  });
}

async function ensurePdfJs_() {
  if (typeof window === "undefined") throw new Error("PDF.js solo en navegador");
  if (window.pdfjsLib) return window.pdfjsLib;
  if (!pdfJsPromise_) {
    const localMain = "/vendor/pdfjs/pdf.min.js";
    const localWorker = "/vendor/pdfjs/pdf.worker.min.js";
    const cdnMain = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
    const cdnWorker = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    pdfJsPromise_ = loadScriptOnce_(localMain)
      .catch(() => loadScriptOnce_(cdnMain))
      .then((lib) => {
        try {
          lib.GlobalWorkerOptions.workerSrc = localWorker;
          // Si el worker local falla en runtime, pdf.js reintentará; dejamos también CDN como nota.
          void cdnWorker;
        } catch {
          // ignore
        }
        return lib;
      });
  }
  return pdfJsPromise_;
}

/**
 * @param {string} dataUri data:application/pdf;base64,...
 * @returns {Promise<string[]>} data:image/jpeg;base64,... por página
 */
export async function rasterizePdfDataUriToJpegPages_(dataUri, { scale = 2 } = {}) {
  if (typeof document === "undefined") return [];
  const bytes = parseDataUriToUint8_(dataUri);
  if (!bytes?.length) return [];
  // Cabecera %PDF
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    return [];
  }
  try {
    const pdfjs = await ensurePdfJs_();
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    const out = [];
    const nPages = Math.max(0, Number(pdf.numPages) || 0);
    for (let n = 1; n <= nPages; n += 1) {
      const page = await pdf.getPage(n);
      const viewport = page.getViewport({ scale: Math.max(1.25, Number(scale) || 2) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      out.push(canvas.toDataURL("image/jpeg", 0.92));
    }
    return out;
  } catch {
    return [];
  }
}

export function isPdfTicketDataUri_(dataUri, mime = "") {
  const src = String(dataUri || "").trim();
  if (src.startsWith("data:image/")) return false;
  if (src.startsWith("data:application/pdf")) return true;
  if (String(mime || "").toLowerCase().includes("pdf")) return true;
  return /\.pdf(\?|#|$)/i.test(src);
}
