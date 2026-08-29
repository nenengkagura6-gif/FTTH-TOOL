"""
FastAPI Main Application - Cloud Ready KML Processing Tools
Supports Render + Cloudflare deployment
"""
import os
import io
import sys
import secrets
import zipfile
import tempfile
from typing import List, Optional

# Redirect stdout and stderr to a file for debugging
class LoggerWriter:
    def __init__(self, filepath):
        self.terminal = sys.stdout
        self.log = open(filepath, "a", encoding="utf-8")

    def write(self, message):
        if self.terminal:
            self.terminal.write(message)
        self.log.write(message)
        self.log.flush()

    def flush(self):
        if self.terminal:
            self.terminal.flush()
        self.log.flush()

log_file_path = os.path.join(tempfile.gettempdir(), "app_debug.log")
sys.stdout = LoggerWriter(log_file_path)
sys.stderr = sys.stdout
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Form, BackgroundTasks, Header, Depends
from fastapi.responses import Response, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from engines.kml_engine import process_kml_to_excel
from engines.apd_engine import process_apd_hpdb
from engines.duplikat_engine import check_duplicates_kml, DuplikatEngine
from engines.kml_extractor_engine import process_kml_extractor
from engines.pole_sorter_engine import process_pole_sorter
from engines.insert_coding_engine import process_insert_coding
import sentry_sdk

sentry_dsn = os.environ.get("SENTRY_DSN_PYTHON")
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )
    print("Sentry initialized for FastAPI")

APP_VERSION = "1.2.5"
APP_BUILD_DATE = "2026-05-23"

app = FastAPI(
    title="KML Processing API",
    description="API for processing KML/KMZ files - Cloud Ready",
    version=APP_VERSION
)

# CORS Configuration
# Allowlist eksplisit. Origin tambahan (mis. domain preview) di-set lewat env
# ALLOWED_ORIGINS, dipisah koma. Wildcard "*" digabung allow_credentials=True
# dilarang oleh spesifikasi CORS dan membatalkan proteksi same-origin.
DEFAULT_ALLOWED_ORIGINS = [
    "https://ftthtools.my.id",
    "https://www.ftthtools.my.id",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

_extra_origins = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=DEFAULT_ALLOWED_ORIGINS + _extra_origins,
    # Preview deploy Cloudflare Pages: <hash>.<project>.pages.dev
    allow_origin_regex=r"https://[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


# =========================
# Batas Ukuran Upload
# =========================
# Semua endpoint sebelumnya melakukan `await file.read()` tanpa batas apa pun,
# sehingga satu request bisa menarik file berukuran berapa pun ke memori dan
# menjatuhkan instance free tier. Nilainya selaras dengan file_size_limit
# bucket 'uploads' di frontend/supabase/03-storage.sql.

MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_SIZE", 50 * 1024 * 1024))
MAX_FILES_PER_REQUEST = int(os.environ.get("MAX_FILES_PER_REQUEST", 10))

# Rasio ekspansi maksimum untuk arsip ZIP (proteksi zip bomb)
MAX_ZIP_RATIO = 100
MAX_ZIP_UNCOMPRESSED_BYTES = 200 * 1024 * 1024


def _human(n: int) -> str:
    return f"{n / (1024 * 1024):.1f} MB"


async def read_upload_limited(
    upload: UploadFile,
    max_bytes: int = None,
    label: str = "File",
) -> bytes:
    """
    Baca UploadFile secara bertahap dan batalkan begitu melewati batas.

    Dibaca per potongan supaya file raksasa ditolak SEBELUM seluruh isinya
    masuk memori — berbeda dengan `await file.read()` yang menarik semuanya
    lebih dulu, baru bisa diperiksa.
    """
    limit = max_bytes or MAX_UPLOAD_BYTES
    chunks = []
    total = 0

    while True:
        chunk = await upload.read(1024 * 1024)  # 1 MB per potongan
        if not chunk:
            break
        total += len(chunk)
        if total > limit:
            raise HTTPException(
                status_code=413,
                detail=f"{label} melebihi batas {_human(limit)}",
            )
        chunks.append(chunk)

    return b"".join(chunks)


def safe_zip_members(content: bytes, suffix: str) -> zipfile.ZipFile:
    """
    Buka arsip ZIP setelah memastikan ukuran hasil ekstraksinya wajar.

    Tanpa ini, arsip beberapa kilobyte yang mengembang jadi puluhan gigabyte
    (zip bomb) akan diekstrak apa adanya.
    """
    zf = zipfile.ZipFile(io.BytesIO(content))

    total_uncompressed = sum(
        i.file_size for i in zf.infolist()
        if i.filename.lower().endswith(suffix) and not i.filename.startswith("__")
    )

    if total_uncompressed > MAX_ZIP_UNCOMPRESSED_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Isi arsip terlalu besar ({_human(total_uncompressed)})",
        )

    if len(content) > 0 and total_uncompressed / len(content) > MAX_ZIP_RATIO:
        raise HTTPException(
            status_code=400,
            detail="Arsip ditolak: rasio kompresi mencurigakan (kemungkinan zip bomb)",
        )

    return zf


# =========================
# Health Check
# =========================
@app.get("/")
async def root():
    """Root endpoint for health check."""
    return {"status": "ok", "service": "KML Processing API", "version": APP_VERSION}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": APP_VERSION}


@app.get("/debug-logs")
async def get_debug_logs(lines: int = 200, token: str = Query(None)):
    """
    Retrieve the latest stdout/stderr logs for debugging.

    Terkunci: hanya aktif jika env DEBUG_LOGS_TOKEN di-set, dan token yang
    dikirim cocok. Log berisi job id, path storage, user id, dan stack trace —
    sebelumnya endpoint ini terbuka untuk publik.
    """
    expected = os.environ.get("DEBUG_LOGS_TOKEN")
    if not expected or not token or not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=404, detail="Not Found")

    log_file_path = os.path.join(tempfile.gettempdir(), "app_debug.log")
    if not os.path.exists(log_file_path):
        return {"error": "Log file not found"}
    try:
        with open(log_file_path, "r", encoding="utf-8", errors="ignore") as f:
            log_lines = f.readlines()
        return {"logs": log_lines[-lines:]}
    except Exception as e:
        return {"error": f"Failed to read log file: {e}"}


@app.get("/api/v1/version")
async def get_version():
    """Version endpoint for deployment verification."""
    return {
        "version": APP_VERSION,
        "build_date": APP_BUILD_DATE,
        "supported_tools": ["kml_to_boq", "kml_to_database_hp", "kml_to_database", "kml_duplicate_checker"]
    }



# =========================
# KML to BOQ Excel
# =========================
@app.post("/kml-to-excel")
async def convert_kml_to_excel(
    kml_file: UploadFile = File(..., description="KML or KMZ file to process"),
    template: Optional[UploadFile] = File(None, description="Optional Excel template (BOQ_Template.xlsx)")
):
    """
    Convert KML/KMZ file to BOQ Excel format.
    
    - **kml_file**: KML or KMZ file containing network data
    - **template**: Optional Excel template for BOQ format
    """
    try:
        # Validate file extension
        filename = kml_file.filename
        is_kmz = filename.lower().endswith(".kmz")
        
        if not (filename.lower().endswith(".kml") or is_kmz):
            raise HTTPException(
                status_code=400, 
                detail="File must be .kml or .kmz"
            )
        
        # Read files
        kml_content = await read_upload_limited(kml_file, label="File KML")
        template_content = (
            await read_upload_limited(template, label="Template")
            if template else None
        )
        
        # Process
        result = process_kml_to_excel(
            kml_content=kml_content,
            filename=filename,
            template_content=template_content,
            is_kmz=is_kmz
        )
        
        if result["status"] == "error":
            raise HTTPException(status_code=500, detail=result["message"])
        
        # Return file
        return StreamingResponse(
            io.BytesIO(result["content"]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{result["filename"]}"'
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =========================
# APD HPDB Processing
# =========================
@app.post("/apd-hpdb")
async def process_apd(
    kml_file: UploadFile = File(..., description="KML or KMZ file to process"),
    template: Optional[UploadFile] = File(None, description="Optional APD template (APD_HPDB_.xlsx)")
):
    """
    Process APD HPDB from KML or KMZ file with geocoding (Synchronous - Legacy)
    """
    try:
        # Validate file extension
        filename = kml_file.filename
        is_kmz = filename.lower().endswith(".kmz")
        
        if not (filename.lower().endswith(".kml") or is_kmz):
            raise HTTPException(status_code=400, detail="File must be .kml or .kmz")
        
        # Read files
        kml_content = await read_upload_limited(kml_file, label="File KML")
        template_content = (
            await read_upload_limited(template, label="Template")
            if template else None
        )
        
        # Process
        result = process_apd_hpdb(
            kml_content=kml_content,
            filename=kml_file.filename,
            apd_template_content=template_content
        )
        
        if result["status"] == "error":
            raise HTTPException(status_code=500, detail=result["message"])
        
        # Return file
        return StreamingResponse(
            io.BytesIO(result["content"]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="{result["filename"]}"'
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================
# ASYNC QUEUE ENDPOINTS
# =========================
from pydantic import BaseModel

class JobRequest(BaseModel):
    job_id: str
    file_path: str
    original_filename: str
    # Diabaikan oleh server — user id diambil dari JWT yang terverifikasi.
    # Tetap diterima demi kompatibilitas dengan client lama.
    user_id: Optional[str] = None
    tool_name: str
    template_path: Optional[str] = None

def _process_job_sync(
    job_id: str,
    file_path: str,
    original_filename: str,
    user_id: str,
    tool_name: str,
    template_path: Optional[str] = None
):
    """
    Process a KML job directly (no Celery/Redis needed).
    Runs as a FastAPI BackgroundTask.
    """
    import time
    import traceback
    from datetime import datetime, timedelta, timezone

    print(f"[job {job_id}] _process_job_sync started: tool_name={tool_name}, file={original_filename}, template={template_path}")

    # Import supabase functions early, fail fast if missing
    try:
        from supabase_client import update_job_status, download_input_file, upload_output_file
    except Exception as import_err:
        print(f"[job {job_id}] ❌ FATAL: Cannot import supabase_client: {import_err}")
        traceback.print_exc()
        return

    try:
        update_job_status(job_id, "processing", {
            "started_at": time.strftime('%Y-%m-%dT%H:%M:%S%z'),
            "progress_percent": 5,
            "progress_message": "Memulai proses..."
        })
        start_time = time.time()

        # 1. Download file from Supabase Storage
        print(f"[job {job_id}] Step 1: Downloading input file: {file_path}")
        update_job_status(job_id, "processing", {
            "progress_percent": 10,
            "progress_message": "Mengunduh file..."
        })
        
        try:
            file_bytes = download_input_file(file_path)
            
            template_bytes = None
            if template_path:
                print(f"[job {job_id}] Step 1.5: Downloading template file: {template_path}")
                template_bytes = download_input_file(template_path)
        except Exception as dl_err:
            print(f"[job {job_id}] download_input_file threw exception: {dl_err}")
            traceback.print_exc()
            raise Exception(f"Download error: {dl_err}")
            
        if not file_bytes:
            raise Exception(f"Failed to download input file from storage: {file_path}")
        print(f"[job {job_id}] Downloaded {len(file_bytes)} bytes")

        # 2. Process the file
        print(f"[job {job_id}] Step 2: Processing with tool={tool_name}")
        update_job_status(job_id, "processing", {
            "progress_percent": 25,
            "progress_message": "Memproses KML..."
        })
        is_kmz = original_filename.lower().endswith(".kmz")

        if tool_name == "kml_extractor":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Mengekstraksi KML/KMZ..."
            })
            result = process_kml_extractor(
                kml_content=file_bytes,
                filename=original_filename,
                is_kmz=is_kmz
            )
        elif tool_name == "kml_to_boq":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Konversi KML ke BOQ Excel..."
            })
            result = process_kml_to_excel(
                kml_content=file_bytes,
                filename=original_filename,
                template_content=template_bytes,
                is_kmz=is_kmz
            )
        elif tool_name in ("kml_to_database_hp", "kml_to_database"):
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Memproses APD HPDB..."
            })
            result = process_apd_hpdb(
                kml_content=file_bytes,
                filename=original_filename,
                apd_template_content=template_bytes
            )
        elif tool_name == "kml_duplicate_checker":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Mengecek duplikat POLE/HP..."
            })
            engine = DuplikatEngine(max_distance_meter=3.0)
            dup_result = engine.process_multiple([(file_bytes, original_filename)])
            report_text = engine.generate_report(dup_result)
            output_name = original_filename.rsplit('.', 1)[0] + "_duplikat_report.csv"
            result = {
                "status": dup_result.get("status", "success"),
                "filename": output_name,
                "content": report_text.encode("utf-8"),
                "content_type": "text/csv"
            }
        elif tool_name == "kml_to_csv":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Mengkonversi KML ke CSV..."
            })
            from engines.conversion_engine import convert_kml_to_csv
            csv_content = convert_kml_to_csv(file_bytes, is_kmz)
            output_name = original_filename.rsplit('.', 1)[0] + ".csv"
            result = {
                "status": "success",
                "filename": output_name,
                "content": csv_content,
                "content_type": "text/csv"
            }
        elif tool_name == "kml_to_shp":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Mengkonversi KML ke Shapefile..."
            })
            from engines.conversion_engine import convert_kml_to_shp
            shp_zip_content = convert_kml_to_shp(file_bytes, is_kmz)
            output_name = original_filename.rsplit('.', 1)[0] + "_shp.zip"
            result = {
                "status": "success",
                "filename": output_name,
                "content": shp_zip_content,
                "content_type": "application/zip"
            }
        elif tool_name == "shp_to_kml":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Mengkonversi Shapefile ke KML..."
            })
            from engines.conversion_engine import convert_shp_to_kml
            kml_content = convert_shp_to_kml(file_bytes)
            output_name = original_filename.rsplit('.', 1)[0] + "_converted.kml"
            result = {
                "status": "success",
                "filename": output_name,
                "content": kml_content,
                "content_type": "application/vnd.google-earth.kml+xml"
            }
        elif tool_name == "kml_to_dxf":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Mengkonversi KML ke AutoCAD (DXF)..."
            })
            from engines.conversion_engine import convert_kml_to_dxf
            dxf_content = convert_kml_to_dxf(file_bytes, is_kmz)
            output_name = original_filename.rsplit('.', 1)[0] + ".dxf"
            result = {
                "status": "success",
                "filename": output_name,
                "content": dxf_content,
                "content_type": "application/octet-stream"
            }
        elif tool_name == "dxf_to_kml":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Mengkonversi AutoCAD (DXF) ke KML..."
            })
            from supabase_client import get_job_config
            job_config = get_job_config(job_id)
            
            utm_zone = job_config.get("utm_zone", 48)
            is_southern = job_config.get("is_southern", True)
            
            from engines.conversion_engine import convert_dxf_to_kml
            kml_content = convert_dxf_to_kml(file_bytes, utm_zone, is_southern)
            output_name = original_filename.rsplit('.', 1)[0] + "_converted.kml"
            result = {
                "status": "success",
                "filename": output_name,
                "content": kml_content,
                "content_type": "application/vnd.google-earth.kml+xml"
            }
        elif tool_name == "pole_sorter":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Mengurutkan pole berdasarkan kabel..."
            })
            result = process_pole_sorter(
                kml_content=file_bytes,
                filename=original_filename,
                is_kmz=is_kmz
            )
        elif tool_name == "insert_coding":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Menyisipkan kode prefix FDT/FAT/Kabel/Pole..."
            })
            from supabase_client import get_job_config
            job_config = get_job_config(job_id)
            
            # Extract FDT prefixes from job config
            prefix_1 = job_config.get("prefix_fdt_01", "").strip()
            prefix_2 = job_config.get("prefix_fdt_02", "").strip()
            prefix_3 = job_config.get("prefix_fdt_03", "").strip()
            
            prefixes_dict = {}
            if prefix_1:
                prefixes_dict[1] = prefix_1
            if prefix_2:
                prefixes_dict[2] = prefix_2
            if prefix_3:
                prefixes_dict[3] = prefix_3
                
            # Fallback if dictionary is empty
            if not prefixes_dict:
                prefixes_dict[1] = "DEFAULT"
                
            result = process_insert_coding(
                kml_content=file_bytes,
                filename=original_filename,
                prefixes=prefixes_dict,
                is_kmz=is_kmz
            )
        elif tool_name == "kml_apd":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Memproses KML APD (FAT, Cable, Pole, HP)..."
            })
            from engines.kml_apd_engine import process_kml_apd
            result = process_kml_apd(
                kml_content=file_bytes,
                filename=original_filename,
                is_kmz=is_kmz
            )
        elif tool_name == "auto_placemark":
            def _ap_progress(msg: str):
                update_job_status(job_id, "processing", {
                    "progress_percent": 40,
                    "progress_message": msg
                })
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Mengambil data bangunan & jalan dari OSM..."
            })
            from engines.auto_placemark_engine import process_auto_placemark
            result = process_auto_placemark(
                boundary_content=file_bytes,
                filename=original_filename,
                is_kmz=is_kmz,
                progress_cb=_ap_progress
            )
        else:
            raise Exception(f"Unsupported tool: {tool_name}")

        print(f"[job {job_id}] Step 2 done. Result status: {result.get('status')}")
        update_job_status(job_id, "processing", {
            "progress_percent": 70,
            "progress_message": "Validasi hasil..."
        })

        if result.get("status") == "error":
            raise Exception(result.get("message", "Unknown processing error"))

        # 3. Upload output to Supabase Storage
        output_filename = result["filename"]
        output_content_type = result.get("content_type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        print(f"[job {job_id}] Step 3: Uploading output: {output_filename}")
        update_job_status(job_id, "processing", {
            "progress_percent": 80,
            "progress_message": "Mengupload hasil..."
        })
        output_path = upload_output_file(
            user_id=user_id,
            filename=output_filename,
            file_bytes=result["content"],
            content_type=output_content_type
        )

        if not output_path:
            raise Exception("Failed to upload output file to storage")

        # 4. Mark as completed
        processing_time_ms = int((time.time() - start_time) * 1000)
        expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

        update_job_status(job_id, "completed", {
            "output_filename": output_filename,
            "output_file_url": output_path,
            "processing_time_ms": processing_time_ms,
            "completed_at": time.strftime('%Y-%m-%dT%H:%M:%S%z'),
            "output_file_size_bytes": len(result["content"]),
            "expires_at": expires_at,
            "progress_percent": 100,
            "progress_message": "Selesai!"
        })
        print(f"[job {job_id}] ✅ Completed in {processing_time_ms}ms")

    except Exception as exc:
        error_msg = str(exc)
        print(f"[job {job_id}] ❌ Failed: {error_msg}")
        traceback.print_exc()
        
        # Robust error update — wrapped in its own try/catch so it never silently fails
        try:
            expires_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
            update_result = update_job_status(job_id, "failed", {
                "error_message": error_msg[:500],  # Truncate to avoid DB issues
                "completed_at": time.strftime('%Y-%m-%dT%H:%M:%S%z'),
                "expires_at": expires_at,
                "progress_percent": 0,
                "progress_message": f"Error: {error_msg[:100]}"
            })
            print(f"[job {job_id}] Error status update result: {update_result}")
        except Exception as update_err:
            print(f"[job {job_id}] ❌❌ CRITICAL: Failed to update job status to 'failed': {update_err}")
            traceback.print_exc()


# =========================
# AUTENTIKASI
# =========================
async def require_user_id(authorization: str = Header(None)) -> str:
    """
    Verifikasi Supabase JWT dari header Authorization dan kembalikan user id.

    Sebelumnya /api/v1/queue/job tidak punya autentikasi sama sekali, padahal
    backend memproses request memakai service role key yang mem-bypass RLS.
    Siapa pun bisa mengirim file_path milik user lain untuk diunduh, diproses,
    lalu hasilnya ditulis ke folder miliknya sendiri.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()

    from supabase_client import get_user_from_token
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return str(user.id)


def _assert_owned_path(path: str, user_id: str, label: str) -> None:
    """Storage key wajib berada di dalam folder milik user, tanpa traversal."""
    if not path:
        raise HTTPException(status_code=400, detail=f"{label} is required")
    if ".." in path or path.startswith("/") or "\\" in path:
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    if not path.startswith(f"{user_id}/"):
        raise HTTPException(status_code=403, detail=f"{label} does not belong to this user")


@app.post("/api/v1/queue/job")
async def queue_job(
    req: JobRequest,
    background_tasks: BackgroundTasks,
    auth_user_id: str = Depends(require_user_id),
):
    """
    Process a KML job in the background using FastAPI BackgroundTasks.
    No Celery/Redis required.

    Semua identitas diambil dari JWT yang terverifikasi — bukan dari body.
    """
    supported_tools = (
        "kml_to_boq", "kml_to_database_hp", "kml_to_database", "kml_duplicate_checker",
        "kml_to_csv", "kml_to_shp", "shp_to_kml", "kml_to_dxf", "dxf_to_kml", "kml_extractor",
        "pole_sorter", "insert_coding", "kml_apd", "auto_placemark"
    )
    print(f"[queue_job] Received: tool_name={req.tool_name}, job_id={req.job_id}, file={req.original_filename}")
    
    if req.tool_name not in supported_tools:
        print(f"[queue_job] ❌ Rejected: tool_name='{req.tool_name}' not in {supported_tools}")
        raise HTTPException(status_code=400, detail=f"Unsupported tool: {req.tool_name}. Supported: {', '.join(supported_tools)}")

    # --- Otorisasi: identitas dari JWT, bukan dari body ---
    # req.user_id sengaja diabaikan; body tidak dipercaya sama sekali.
    _assert_owned_path(req.file_path, auth_user_id, "file_path")
    if req.template_path:
        _assert_owned_path(req.template_path, auth_user_id, "template_path")

    from supabase_client import job_belongs_to_user
    if not job_belongs_to_user(req.job_id, auth_user_id):
        print(f"[queue_job] ❌ Rejected: job {req.job_id} bukan milik user {auth_user_id}")
        raise HTTPException(status_code=403, detail="Job does not belong to this user")

    # Schedule processing as a background task
    background_tasks.add_task(
        _process_job_sync,
        job_id=req.job_id,
        file_path=req.file_path,
        original_filename=req.original_filename,
        user_id=auth_user_id,
        tool_name=req.tool_name,
        template_path=req.template_path
    )

    print(f"[job {req.job_id}] ✅ Queued for processing (tool={req.tool_name}, version={APP_VERSION})")
    return {"status": "queued", "job_id": req.job_id}


# =========================
# Check Duplicates
# =========================
@app.post("/check-duplicates")
async def check_duplicates(
    kml_files: List[UploadFile] = File(..., description="One or more KML files to check"),
    max_distance: float = Form(1.0, description="Maximum distance in meters for duplicate detection"),
    output_format: str = Form("text", description="Output format: 'text' or 'json'"),
    keywords: Optional[str] = Form(None, description="Comma-separated keywords (default: POLE,HP)")
):
    """
    Check for duplicate POLE/HP points across KML files.
    
    - **kml_files**: One or more KML files
    - **max_distance**: Distance threshold in meters (default: 1.0)
    - **output_format**: 'text' for human-readable report, 'json' for structured data
    - **keywords**: Custom keywords to filter folders
    """
    try:
        if not kml_files:
            raise HTTPException(status_code=400, detail="At least one file required")
        if len(kml_files) > MAX_FILES_PER_REQUEST:
            raise HTTPException(
                status_code=413,
                detail=f"Maksimal {MAX_FILES_PER_REQUEST} file per request",
            )
        
        # Validate and read files
        file_list = []
        for f in kml_files:
            if not f.filename.lower().endswith(".kml"):
                raise HTTPException(status_code=400, detail=f"File {f.filename} must be .kml")
            content = await read_upload_limited(f, label=f"File {f.filename}")
            file_list.append((content, f.filename))
        
        # Parse keywords
        target_keywords = None
        if keywords:
            target_keywords = [k.strip() for k in keywords.split(",")]
        
        # Process
        from engines.duplikat_engine import DuplikatEngine
        engine = DuplikatEngine(max_distance_meter=max_distance)
        if target_keywords:
            engine.set_target_keywords(target_keywords)
        
        result = engine.process_multiple(file_list)
        
        if output_format.lower() == "json":
            return JSONResponse(content=engine.generate_json_report(result))
        else:
            report = engine.generate_report(result)
            return StreamingResponse(
                io.BytesIO(report.encode("utf-8")),
                media_type="text/plain; charset=utf-8",
                headers={
                    "Content-Disposition": 'attachment; filename="duplikat_report.txt"'
                }
            )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/check-duplicates/json")
async def check_duplicates_json(
    kml_files: List[UploadFile] = File(..., description="One or more KML files to check"),
    max_distance: float = Form(1.0, description="Maximum distance in meters"),
    keywords: Optional[str] = Form(None, description="Comma-separated keywords")
):
    """
    Check duplicates and return JSON format (convenience endpoint).
    """
    return await check_duplicates(kml_files, max_distance, "json", keywords)


# =========================
# KML Path Extractor
# =========================
from engines.otdr_fault_engine import extract_kml_geometries

@app.post("/api/v1/kml/extract-path")
async def extract_kml_path(
    kml_file: UploadFile = File(..., description="KML or KMZ file containing the cable path")
):
    """
    Extract paths and points from KML or KMZ for mapping.
    """
    try:
        filename = kml_file.filename
        is_kmz = filename.lower().endswith(".kmz")
        
        if not (filename.lower().endswith(".kml") or is_kmz):
            raise HTTPException(
                status_code=400, 
                detail="File must be .kml or .kmz"
            )
            
        content = await read_upload_limited(kml_file, label="File KML")
        result = extract_kml_geometries(content, is_kmz=is_kmz)
        
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("message"))
            
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =========================
# OTDR Parser
# =========================
from engines.otdr_engine import parse_sor_file

@app.post("/api/v1/otdr/parse")
async def parse_otdr_trace(
    sor_file: UploadFile = File(..., description="Bellcore/Telcordia .sor binary trace file")
):
    """
    Parse a standard OTDR SOR file and return structured trace coordinates and events.
    """
    try:
        content = await read_upload_limited(sor_file, label="File SOR")
        result = parse_sor_file(content, filename=sor_file.filename)
        return JSONResponse(content=result)
    # HTTPException (mis. 413 batas ukuran) harus lolos apa adanya —
    # tanpa ini handler catch-all di bawah mengubahnya jadi 500.
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/otdr/parse-batch")
async def parse_otdr_batch(
    files: List[UploadFile] = File(..., description="One or more .sor files, or a .zip archive containing .sor files")
):
    """
    Parse multiple standard OTDR SOR files, or files inside a ZIP archive,
    and return a sorted list of trace results.
    """
    import zipfile
    
    parsed_results = []
    
    try:
        for file in files:
            filename = file.filename
            content = await read_upload_limited(file, label=f"File {filename}")
            
            if filename.lower().endswith(".zip"):
                # Handle ZIP archive
                with safe_zip_members(content, ".sor") as z:
                    for name in z.namelist():
                        # Skip directories or system files (like __MACOSX)
                        if name.lower().endswith(".sor") and not name.startswith("__"):
                            sor_bytes = z.read(name)
                            res = parse_sor_file(sor_bytes, filename=name)
                            # Ensure we set a clean filename for sorting
                            res["filename"] = os.path.basename(name)
                            parsed_results.append(res)
            elif filename.lower().endswith(".sor"):
                # Handle direct SOR file
                res = parse_sor_file(content, filename=filename)
                res["filename"] = filename
                parsed_results.append(res)
                
        # Sort alphabetically (A-Z) by filename (case-insensitive)
        parsed_results.sort(key=lambda x: x.get("filename", "").lower())
        
        return JSONResponse(content={
            "status": "success",
            "results": parsed_results
        })
        
    # HTTPException (mis. 413 batas ukuran) harus lolos apa adanya —
    # tanpa ini handler catch-all di bawah mengubahnya jadi 500.
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch parsing failed: {str(e)}")



# =========================
# File Validation
# =========================
@app.post("/validate-kml")
async def validate_kml(kml_file: UploadFile = File(...)):
    """
    Validate if a KML file is properly formatted.
    """
    try:
        content = await read_upload_limited(kml_file, label="File KML")
        
        # Try to parse securely
        from lxml import etree
        parser = etree.XMLParser(resolve_entities=False, no_network=True, recover=True)
        tree = etree.parse(io.BytesIO(content), parser)
        root = tree.getroot()
        
        # Count elements
        folders = len([e for e in root.iter() if e.tag and "Folder" in str(e.tag)])
        placemarks = len([e for e in root.iter() if e.tag and "Placemark" in str(e.tag)])
        
        return {
            "valid": True,
            "filename": kml_file.filename,
            "folders": folders,
            "placemarks": placemarks
        }
    
    # HTTPException (mis. 413 batas ukuran) harus lolos apa adanya —
    # tanpa ini handler catch-all di bawah mengubahnya jadi 500.
    except HTTPException:
        raise
    except Exception as e:
        return {
            "valid": False,
            "filename": kml_file.filename,
            "error": str(e)
        }


# =========================
# Configuration
# =========================
# =========================
# Maintenance / Retensi File
# =========================
@app.post("/api/v1/maintenance/cleanup")
async def maintenance_cleanup(x_maintenance_token: str = Header(None)):
    """
    Hapus file storage milik job yang sudah lewat masa simpan.

    Menggantikan cleanup_expired_jobs_task milik Celery yang tidak pernah
    dideploy. Penghapusan HARUS lewat Storage API, bukan DELETE langsung ke
    storage.objects lewat SQL: menghapus barisnya saja meninggalkan byte
    file sebagai objek yatim yang tidak lagi bisa dihapus dan tetap
    menghabiskan kuota storage.

    Dilindungi shared secret. Jadwalkan sekali sehari dengan penjadwal
    gratis apa pun (GitHub Actions, cron-job.org, Cloudflare Worker cron):

        curl -fsS -X POST "$BACKEND_URL/api/v1/maintenance/cleanup" \
             -H "X-Maintenance-Token: $MAINTENANCE_TOKEN"
    """
    expected = os.environ.get("MAINTENANCE_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="MAINTENANCE_TOKEN not configured")
    if not x_maintenance_token or not secrets.compare_digest(x_maintenance_token, expected):
        raise HTTPException(status_code=401, detail="Invalid maintenance token")

    from supabase_client import (
        get_expired_jobs,
        delete_storage_files,
        mark_jobs_expired,
    )

    expired = get_expired_jobs()
    if not expired:
        return {"status": "ok", "jobs_processed": 0, "files_deleted": 0}

    upload_paths = [j["original_file_url"] for j in expired if j.get("original_file_url")]
    output_paths = [j["output_file_url"] for j in expired if j.get("output_file_url")]

    deleted = 0
    if upload_paths and delete_storage_files("uploads", upload_paths):
        deleted += len(upload_paths)
    if output_paths and delete_storage_files("outputs", output_paths):
        deleted += len(output_paths)

    # Kosongkan URL hanya SETELAH file benar-benar terhapus, supaya
    # putaran berikutnya tidak kehilangan jejak file yang gagal dihapus.
    job_ids = [j["id"] for j in expired]
    mark_jobs_expired(job_ids)

    print(f"[maintenance] {len(job_ids)} job dibersihkan, {deleted} file dihapus")
    return {
        "status": "ok",
        "jobs_processed": len(job_ids),
        "files_deleted": deleted,
    }


@app.get("/config")
async def get_config():
    """Get API configuration and supported formats."""
    return {
        "version": APP_VERSION,
        "endpoints": [
            {
                "path": "/kml-to-excel",
                "method": "POST",
                "description": "Convert KML/KMZ to BOQ Excel"
            },
            {
                "path": "/apd-hpdb",
                "method": "POST",
                "description": "Process APD HPDB with geocoding"
            },
            {
                "path": "/check-duplicates",
                "method": "POST",
                "description": "Check for duplicate POLE/HP"
            }
        ],
        "supported_formats": {
            "input": [".kml", ".kmz"],
            "output": [".xlsx", ".txt"]
        }
    }


# =========================
# Main Entry Point
# =========================
if __name__ == "__main__":
    # Get port from environment (for Render)
    port = int(os.environ.get("PORT", 8000))
    
    # Run server
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.environ.get("DEBUG", "false").lower() == "true"
    )