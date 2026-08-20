import { Image } from "react-native";

/** Lado más largo permitido (px) para no subir imágenes de ticket innecesariamente pesadas. */
const TICKET_IMAGE_MAX_LONG_EDGE_PX = 2000;
const TICKET_IMAGE_JPEG_QUALITY = 0.85;

function getImageSize_(uri) {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err)
    );
  });
}

function computeTicketExportDimensions_(naturalW, naturalH, maxLongEdge) {
  const nw = Math.max(1, Number(naturalW) || 1);
  const nh = Math.max(1, Number(naturalH) || 1);
  const longEdge = Math.max(nw, nh);
  if (longEdge <= maxLongEdge) {
    return { width: nw, height: nh, changed: false };
  }
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.round(nw * scale),
    height: Math.round(nh * scale),
    changed: true,
  };
}

/**
 * Optimiza ticket para subir: conserva proporción, no deforma, no encoge por debajo del original.
 * @returns {Promise<string>} URI local lista para guardar/subir.
 */
export async function prepareTicketImageUriForA4(uri, naturalWidth = 0, naturalHeight = 0) {
  const raw = String(uri || "").trim();
  if (!raw) return raw;

  let nw = Math.max(0, Number(naturalWidth) || 0);
  let nh = Math.max(0, Number(naturalHeight) || 0);

  let ImageManipulator;
  try {
    ImageManipulator = require("expo-image-manipulator");
  } catch {
    return raw;
  }
  if (!ImageManipulator?.manipulateAsync) return raw;

  if (!nw || !nh) {
    try {
      const size = await getImageSize_(raw);
      nw = Math.max(1, Number(size?.width) || 1);
      nh = Math.max(1, Number(size?.height) || 1);
    } catch {
      return raw;
    }
  }

  const exp = computeTicketExportDimensions_(nw, nh, TICKET_IMAGE_MAX_LONG_EDGE_PX);
  if (!exp.changed && /\.jpe?g$/i.test(raw.split("?")[0])) {
    return raw;
  }

  try {
    const actions = exp.changed ? [{ resize: { width: exp.width, height: exp.height } }] : [];
    const out = await ImageManipulator.manipulateAsync(
      raw,
      actions,
      { compress: TICKET_IMAGE_JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );
    return String(out?.uri || raw);
  } catch {
    return raw;
  }
}
