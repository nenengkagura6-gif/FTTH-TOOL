"""
FastAPI Main Application - Cloud Ready KML Processing Tools
Supports Render + Cloudflare deployment
"""
import os
import io
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Form, BackgroundTasks
from fastapi.responses import Response, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from engines.kml_engine import process_kml_to_excel
from engines.apd_engine import process_apd_hpdb
from engines.duplikat_engine import check_duplicates_kml, DuplikatEngine
import sentry_sdk

sentry_dsn = os.environ.get("SENTRY_DSN_PYTHON")
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )
    print("Sentry initialized for FastAPI")

APP_VERSION = "1.2.1"
APP_BUILD_DATE = "2026-05-23"

app = FastAPI(
    title="KML Processing API",
    description="API for processing KML/KMZ files - Cloud Ready",
    version=APP_VERSION
)

# CORS Configuration - Allow all origins for Cloudflare
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# Health Check
# =========================
@app.get("/")
async def root():
    """Root endpoint for health check."""
    return {"status": "ok", "service": "KML Processing API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": APP_VERSION}


@app.get("/api/v1/version")
async def get_version():
    """Version endpoint for deployment verification."""
    return {
        "version": APP_VERSION,
        "build_date": APP_BUILD_DATE,
        "supported_tools": ["kml_to_boq", "kml_to_database_hp", "kml_to_database", "kml_duplicate_checker"]
    }


@app.get("/api/v1/debug/supabase")
async def debug_supabase():
    """Debug endpoint to check Supabase connectivity from backend."""
    result = {
        "supabase_url_set": False,
        "supabase_key_set": False,
        "client_created": False,
        "storage_accessible": False,
        "uploads_bucket": False,
        "outputs_bucket": False,
        "error": None,
        "import_error": None
    }
    
    try:
        from supabase_client import get_supabase, SUPABASE_URL, SUPABASE_KEY
        
        result["supabase_url_set"] = bool(SUPABASE_URL)
        result["supabase_url_preview"] = SUPABASE_URL[:30] + "..." if SUPABASE_URL else None
        result["supabase_key_set"] = bool(SUPABASE_KEY)
        result["supabase_key_type"] = "service_role" if (SUPABASE_KEY and "service_role" in (SUPABASE_KEY or "")) else ("anon" if SUPABASE_KEY else None)
        
        try:
            client = get_supabase()
            result["client_created"] = client is not None
            
            if client:
                # Test storage access
                try:
                    buckets = client.storage.list_buckets()
                    result["storage_accessible"] = True
                    bucket_names = [b.name for b in buckets] if buckets else []
                    result["buckets"] = bucket_names
                    result["uploads_bucket"] = "uploads" in bucket_names
                    result["outputs_bucket"] = "outputs" in bucket_names
                except Exception as storage_err:
                    result["storage_error"] = str(storage_err)
                    
                # Test DB access
                try:
                    test = client.table("processing_jobs").select("id").limit(1).execute()
                    result["db_accessible"] = True
                    result["db_test_rows"] = len(test.data) if test.data else 0
                except Exception as db_err:
                    result["db_error"] = str(db_err)
                    
        except Exception as e:
            result["error"] = str(e)
            
    except Exception as import_err:
        import traceback
        result["import_error"] = str(import_err)
        result["traceback"] = traceback.format_exc()
        
    return result


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
        kml_content = await kml_file.read()
        template_content = await template.read() if template else None
        
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
        kml_content = await kml_file.read()
        template_content = await template.read() if template else None
        
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
    user_id: str
    tool_name: str

def _process_job_sync(
    job_id: str,
    file_path: str,
    original_filename: str,
    user_id: str,
    tool_name: str,
):
    """
    Process a KML job directly (no Celery/Redis needed).
    Runs as a FastAPI BackgroundTask.
    """
    import time
    import traceback
    from datetime import datetime, timedelta, timezone

    print(f"[job {job_id}] _process_job_sync started: tool_name={tool_name}, file={original_filename}")

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

        if tool_name == "kml_to_boq":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Konversi KML ke BOQ Excel..."
            })
            result = process_kml_to_excel(
                kml_content=file_bytes,
                filename=original_filename,
                template_content=None,
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
                apd_template_content=None
            )
        elif tool_name == "kml_duplicate_checker":
            update_job_status(job_id, "processing", {
                "progress_percent": 35,
                "progress_message": "Mengecek duplikat POLE/HP..."
            })
            engine = DuplikatEngine(max_distance_meter=3.0)
            dup_result = engine.process_multiple([(file_bytes, original_filename)])
            report_text = engine.generate_report(dup_result)
            output_name = original_filename.rsplit('.', 1)[0] + "_duplikat_report.txt"
            result = {
                "status": dup_result.get("status", "success"),
                "filename": output_name,
                "content": report_text.encode("utf-8"),
                "content_type": "text/plain; charset=utf-8"
            }
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


@app.post("/api/v1/queue/job")
async def queue_job(req: JobRequest, background_tasks: BackgroundTasks):
    """
    Process a KML job in the background using FastAPI BackgroundTasks.
    No Celery/Redis required.
    """
    supported_tools = ("kml_to_boq", "kml_to_database_hp", "kml_to_database", "kml_duplicate_checker")
    print(f"[queue_job] Received: tool_name={req.tool_name}, job_id={req.job_id}, file={req.original_filename}")
    
    if req.tool_name not in supported_tools:
        print(f"[queue_job] ❌ Rejected: tool_name='{req.tool_name}' not in {supported_tools}")
        raise HTTPException(status_code=400, detail=f"Unsupported tool: {req.tool_name}. Supported: {', '.join(supported_tools)}")

    # Schedule processing as a background task
    background_tasks.add_task(
        _process_job_sync,
        job_id=req.job_id,
        file_path=req.file_path,
        original_filename=req.original_filename,
        user_id=req.user_id,
        tool_name=req.tool_name,
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
        
        # Validate and read files
        file_list = []
        for f in kml_files:
            if not f.filename.lower().endswith(".kml"):
                raise HTTPException(status_code=400, detail=f"File {f.filename} must be .kml")
            content = await f.read()
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
# File Validation
# =========================
@app.post("/validate-kml")
async def validate_kml(kml_file: UploadFile = File(...)):
    """
    Validate if a KML file is properly formatted.
    """
    try:
        content = await kml_file.read()
        
        # Try to parse
        from lxml import etree
        parser = etree.XMLParser(recover=True)
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
    
    except Exception as e:
        return {
            "valid": False,
            "filename": kml_file.filename,
            "error": str(e)
        }


# =========================
# Configuration
# =========================
@app.get("/config")
async def get_config():
    """Get API configuration and supported formats."""
    return {
        "version": "1.0.0",
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