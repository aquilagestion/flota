import base64
import re
import time
from typing import List, Optional, Tuple

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

try:
    from paddleocr import PaddleOCR
except Exception as exc:  # pragma: no cover
    PaddleOCR = None
    PADDLE_IMPORT_ERROR = exc
else:
    PADDLE_IMPORT_ERROR = None


app = FastAPI(title="Flota OCR Service", version="1.0.0")
_ocr_engine = None


class OdometerExtractRequest(BaseModel):
    base64: str = Field(..., description="Imagen en base64 (opcionalmente con prefijo data:)")
    mime_type: Optional[str] = Field(default="image/jpeg")
    file_name: Optional[str] = Field(default="odometro.jpg")
    image_uri: Optional[str] = Field(default=None)


class OdometerExtractResponse(BaseModel):
    km: str
    kilometros: str
    texto_ocr: str
    provider: str = "paddleocr"
    elapsed_ms: int


def get_ocr_engine() -> PaddleOCR:
    global _ocr_engine
    if _ocr_engine is not None:
        return _ocr_engine
    if PaddleOCR is None:
        raise RuntimeError(f"No se pudo importar PaddleOCR: {PADDLE_IMPORT_ERROR}")
    _ocr_engine = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
    return _ocr_engine


def decode_base64_image(raw_base64: str) -> np.ndarray:
    clean = (raw_base64 or "").strip()
    if "," in clean and clean.lower().startswith("data:"):
        clean = clean.split(",", 1)[1]
    if not clean:
        raise ValueError("base64 vacío")
    try:
        data = base64.b64decode(clean, validate=False)
    except Exception as exc:
        raise ValueError(f"base64 inválido: {exc}") from exc
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("No se pudo decodificar la imagen")
    return img


def rotate_image(gray: np.ndarray, angle: float) -> np.ndarray:
    h, w = gray.shape[:2]
    center = (w // 2, h // 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(
        gray,
        matrix,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_REPLICATE,
    )


def preprocess_variants(img_bgr: np.ndarray) -> List[np.ndarray]:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    roi = gray[max(0, int(h * 0.30)) :, :]
    center_roi = gray[max(0, int(h * 0.20)) : min(h, int(h * 0.85)), max(0, int(w * 0.15)) : min(w, int(w * 0.95))]

    full_clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    full_blur = cv2.GaussianBlur(full_clahe, (3, 3), 0)
    _, full_otsu = cv2.threshold(full_blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    _, full_inv = cv2.threshold(full_blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(roi)
    blur = cv2.GaussianBlur(clahe, (3, 3), 0)
    _, th_otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    _, th_inv = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    th_adapt = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 7
    )
    th_adapt_inv = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 7
    )
    sharp = cv2.addWeighted(roi, 1.6, cv2.GaussianBlur(roi, (0, 0), 2.2), -0.6, 0)
    center_enlarged = cv2.resize(center_roi, None, fx=1.6, fy=1.6, interpolation=cv2.INTER_CUBIC)
    enlarged = cv2.resize(roi, None, fx=1.8, fy=1.8, interpolation=cv2.INTER_CUBIC)
    rot_p = rotate_image(roi, 7.0)
    rot_n = rotate_image(roi, -7.0)
    # Intentamos primero imagen completa y centro; luego variantes de la zona baja.
    return [
        img_bgr,
        gray,
        full_clahe,
        full_otsu,
        full_inv,
        center_roi,
        center_enlarged,
        roi,
        clahe,
        sharp,
        th_otsu,
        th_inv,
        th_adapt,
        th_adapt_inv,
        enlarged,
        rot_p,
        rot_n,
    ]


def run_paddle_text(ocr: PaddleOCR, img: np.ndarray) -> List[Tuple[str, float]]:
    raw = ocr.ocr(img, cls=True)
    out: List[Tuple[str, float]] = []
    if not raw:
        return out
    for line in raw:
        if not line:
            continue
        for item in line:
            if not item or len(item) < 2:
                continue
            txt = str(item[1][0] or "").strip()
            conf = float(item[1][1] or 0.0)
            if txt:
                out.append((txt, conf))
    return out


def normalize_text_for_km(text: str) -> str:
    return (
        (text or "")
        .upper()
        .replace("O", "0")
        .replace("Q", "0")
        .replace("I", "1")
        .replace("L", "1")
        .replace("|", "1")
    )


def collect_km_candidates(text: str) -> List[int]:
    normalized = normalize_text_for_km(text)
    re_num = re.compile(r"(\d{1,3}(?:[.,\s]\d{3})+|\d{3,8})")
    values: List[int] = []
    for match in re_num.finditer(normalized):
        digits = re.sub(r"[^\d]", "", match.group(1))
        if len(digits) < 3 or len(digits) > 8:
            continue
        try:
            n = int(digits)
            if n < 100 or n > 3_000_000:
                continue
            values.append(n)
        except Exception:
            continue
    # Caso común OCR: dígitos separados "1 2 3 4 5 6"
    grouped = re.findall(r"(?:\d[\s]){2,7}\d", normalized)
    for g in grouped:
        digits = re.sub(r"[^\d]", "", g)
        if 3 <= len(digits) <= 8:
            n = int(digits)
            if 100 <= n <= 3_000_000:
                values.append(n)
    return values


def extract_km_from_text(text: str) -> str:
    raw = text or ""
    if not raw:
        return ""
    lines = normalize_text_for_km(raw).splitlines()
    prioritized: List[int] = []
    for ln in lines:
        if re.search(r"(KM|KMS|KILOMET|ODOMET)", ln):
            prioritized.extend(collect_km_candidates(ln))
    if prioritized:
        return str(max(prioritized))
    fallback = collect_km_candidates(raw)
    return str(max(fallback)) if fallback else ""


def pick_best_km_from_pieces(pieces: List[Tuple[str, float]]) -> str:
    scored: List[Tuple[float, int]] = []
    for txt, conf in pieces:
        normalized = normalize_text_for_km(txt)
        nums = collect_km_candidates(normalized)
        if not nums:
            continue
        has_km = bool(re.search(r"(KM|KMS|KILOMET|ODOMET)", normalized))
        for n in nums:
            score = float(conf or 0.0) * 10.0
            if has_km:
                score += 50.0
            if 1000 <= n <= 1_500_000:
                score += 15.0
            scored.append((score, n))
    if not scored:
        return ""
    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return str(scored[0][1])


@app.get("/health")
def health():
    return {"ok": True, "service": "flota-ocr", "provider": "paddleocr"}


@app.post("/odometer/extract", response_model=OdometerExtractResponse)
def odometer_extract(body: OdometerExtractRequest):
    started = time.time()
    try:
        img = decode_base64_image(body.base64)
        ocr = get_ocr_engine()
        chunks: List[str] = []
        all_pieces: List[Tuple[str, float]] = []
        best_km = ""

        for variant in preprocess_variants(img):
            pieces = run_paddle_text(ocr, variant)
            if not pieces:
                continue
            all_pieces.extend(pieces)
            text_variant = "\n".join([t for t, _ in pieces])
            if text_variant:
                chunks.append(text_variant)
                km_variant = pick_best_km_from_pieces(pieces) or extract_km_from_text(text_variant)
                if km_variant:
                    best_km = km_variant
                    break

        full_text = "\n---\n".join(chunks).strip()
        if not best_km and full_text:
            best_km = pick_best_km_from_pieces(all_pieces) or extract_km_from_text(full_text)

        if not best_km:
            raise HTTPException(
                status_code=422,
                detail="No se detectaron kilometros en la imagen del cuentakilometros.",
            )

        elapsed_ms = int((time.time() - started) * 1000)
        trimmed = full_text[:2000] if full_text else ""
        return OdometerExtractResponse(
            km=best_km,
            kilometros=best_km,
            texto_ocr=trimmed,
            elapsed_ms=elapsed_ms,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"OCR error: {exc}") from exc
