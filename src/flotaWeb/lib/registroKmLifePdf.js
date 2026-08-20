/**
 * Nativo: pdf-lib vía Metro (funciona en APK).
 * Web usa registroKmLifePdf.web.js (UMD) para evitar el crash tslib/__extends.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildRegistroKmLifePdfBytesWithLib_ } from "./registroKmLifePdfShared";

export async function buildRegistroKmLifePdfBytes(opts = {}) {
  return buildRegistroKmLifePdfBytesWithLib_({ PDFDocument, StandardFonts, rgb }, opts);
}
