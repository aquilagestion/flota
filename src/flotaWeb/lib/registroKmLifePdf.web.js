/**
 * Web: carga pdf-lib UMD desde /vendor (no atraviesa Metro/tslib).
 */
import { buildRegistroKmLifePdfBytesWithLib_ } from "./registroKmLifePdfShared";

let pdfLibPromise_ = null;

function loadPdfLibUmd_() {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("pdf-lib UMD solo en navegador"));
  }
  if (globalThis.PDFLib?.PDFDocument) {
    return Promise.resolve(globalThis.PDFLib);
  }
  if (pdfLibPromise_) return pdfLibPromise_;
  pdfLibPromise_ = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gestiflota-pdf-lib="1"]');
    if (existing && globalThis.PDFLib?.PDFDocument) {
      resolve(globalThis.PDFLib);
      return;
    }
    const s = document.createElement("script");
    s.src = "/vendor/pdf-lib/pdf-lib.min.js";
    s.async = true;
    s.dataset.gestiflotaPdfLib = "1";
    s.onload = () => {
      if (globalThis.PDFLib?.PDFDocument) resolve(globalThis.PDFLib);
      else reject(new Error("pdf-lib UMD cargó sin PDFLib global"));
    };
    s.onerror = () => reject(new Error("No se pudo cargar /vendor/pdf-lib/pdf-lib.min.js"));
    document.head.appendChild(s);
  });
  return pdfLibPromise_;
}

export async function buildRegistroKmLifePdfBytes(opts = {}) {
  const pdfLib = await loadPdfLibUmd_();
  return buildRegistroKmLifePdfBytesWithLib_(pdfLib, opts);
}
