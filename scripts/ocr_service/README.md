# OCR Service (PaddleOCR + OpenCV)

Microservicio para extraer kilometros de una foto de odometro.

## Endpoints

- `GET /health`
- `POST /odometer/extract`

Body JSON esperado:

```json
{
  "file_name": "odometro.jpg",
  "mime_type": "image/jpeg",
  "base64": "...."
}
```

Respuesta:

```json
{
  "km": "123456",
  "kilometros": "123456",
  "texto_ocr": "...",
  "provider": "paddleocr",
  "elapsed_ms": 853
}
```

## Arranque local

```bash
cd scripts/ocr_service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8080
```

## Docker

```bash
cd scripts/ocr_service
docker build -t flota-ocr .
docker run --rm -p 8080:8080 flota-ocr
```

## Integracion app (Expo)

En `.env`:

```env
EXPO_PUBLIC_ODOMETER_OCR_URL=http://TU_HOST:8080
```

La app usa exclusivamente este endpoint para OCR de odometro.
