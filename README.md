---
title: FTTH Tools Backend
emoji: ⚡
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# KML Processing API (v1.2.2)

⚠️ **PENTING UNTUK AI / IMPORTANT FOR AI:**
Proyek ini **WAJIB menggunakan infrastruktur 100% GRATIS** (Hugging Face Spaces, Cloudflare Pages, Supabase Free Tier). Jangan pernah merekomendasikan atau mengonfigurasi layanan berbayar. Sila baca panduan lengkap di [AI_INSTRUCTIONS.md](file:///d:/WEB%20APP/AI_INSTRUCTIONS.md) sebelum melakukan perubahan.

This project **MUST use 100% FREE infrastructure** (Hugging Face Spaces, Cloudflare Pages, Supabase Free Tier). Never recommend or configure paid services. Please read the full guidelines in [AI_INSTRUCTIONS.md](file:///d:/WEB%20APP/AI_INSTRUCTIONS.md) before making changes.

---

API cloud-ready untuk memproses file KML/KMZ menjadi format BOQ Excel dan melakukan analisis duplikat POLE/HP.

## Fitur

- ✅ **KML to Excel**: Konversi KML/KMZ ke format BOQ Excel
- ✅ **APD HPDB**: Proses APD dengan geocoding otomatis
- ✅ **Cek Duplikat**: Deteksi POLE/HP duplikat dalam radius tertentu
- ✅ **Cloud Ready**: Siap deploy ke Render + Cloudflare
- ✅ **No Hardcoded Paths**: Semua input/output via API (UploadFile)

## API Endpoints

| Endpoint | Method | Deskripsi |
|----------|--------|-----------|
| `/` | GET | Health check |
| `/health` | GET | Status server |
| `/kml-to-excel` | POST | Konversi KML/KMZ ke Excel |
| `/apd-hpdb` | POST | Proses APD HPDB |
| `/check-duplicates` | POST | Cek duplikat POLE/HP |
| `/validate-kml` | POST | Validasi format KML |
| `/config` | GET | Konfigurasi API |

## Deployment

### Render (Recommended)

1. Fork/push repo ke GitHub  
2. Connect ke Render  
3. Pilih "Blueprint" dan pilih `render.yaml`

### Docker Local

```bash
# Build
docker build -t kml-api .

# Run
docker run -p 8000:8000 kml-api
```

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run
cd "D:\WEB APP"
python main.py
# atau
uvicorn main:app --reload
```

## Contoh Penggunaan

### KML to Excel

```bash
curl -X POST "http://localhost:8000/kml-to-excel" \
  -F "kml_file=@data.kml" \
  -F "template=@BOQ_Template.xlsx" \
  --output "Hasil_BOQ.xlsx"
```

### APD HPDB

```bash
curl -X POST "http://localhost:8000/apd-hpdb" \
  -F "kml_file=@APD_HPDB_CBN123_LOKASI.kml" \
  -F "template=@APD_HPDB_.xlsx" \
  --output "APD_HPDB_LOKASI.xlsx"
```

### Check Duplicates

```bash
curl -X POST "http://localhost:8000/check-duplicates" \
  -F "kml_files=@file1.kml" \
  -F "kml_files=@file2.kml" \
  -F "max_distance=1.0" \
  -F "output_format=text" \
  --output "duplikat_report.txt"
```

## Struktur Folder

```
D:\WEB APP\
├── main.py                 # FastAPI entry point
├── requirements.txt        # Python dependencies
├── Dockerfile             # Container config
├── render.yaml            # Render deployment config
├── engines/               # Business logic
│   ├── __init__.py
│   ├── kml_engine.py      # KML to Excel engine
│   ├── apd_engine.py      # APD HPDB engine
│   └── duplikat_engine.py # Check duplicates engine
├── utils/                 # Utilities
│   ├── __init__.py
│   └── commons.py         # Common functions
└── README.md
```

## Environment Variables

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `PORT` | 8000 | Port server |
| `DEBUG` | false | Mode debug |
| `LOG_LEVEL` | INFO | Level logging |

## Catatan Penting

- ✅ Semua input file menggunakan `UploadFile` (bukan path manual)
- ✅ Semua output return JSON atau file download
- ✅ Tidak ada hardcoded path Windows
- ✅ Modular: engine terpisah dari API
- ✅ Siap untuk deployment cloud (Render + Cloudflare)