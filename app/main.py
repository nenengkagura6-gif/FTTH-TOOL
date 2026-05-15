"""
FastAPI Main Application - Cloud Ready KML Processing Tools
Supports Render + Cloudflare deployment
"""
import os
import io
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, HTTPException, Query, Form
from fastapi.responses import Response, StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from engines.kml_engine import process_kml_to_excel
from engines.apd_engine import process_apd_hpdb
from engines.duplikat_engine import check_duplicates_kml
from tasks import process_kml_to_boq_task, process_apd_hpdb_task
import sentry_sdk

sentry_dsn = os.environ.get("SENTRY_DSN_PYTHON")
if sentry_dsn:
    sentry_sdk.init(
        dsn=sentry_dsn,
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )
    print("Sentry initialized for FastAPI")

app = FastAPI(
    title="KML Processing API",
    description="API for processing KML/KMZ files - Cloud Ready",
    version="1.0.0"
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
    return {"status": "healthy"}


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

@app.post("/api/v1/queue/job")
async def queue_job(req: JobRequest):
    """
    Enqueue a job to be processed in the background by Celery.
    """
    try:
        if req.tool_name == "kml_to_boq":
            process_kml_to_boq_task.delay(
                job_id=req.job_id,
                input_file_path=req.file_path,
                original_filename=req.original_filename,
                user_id=req.user_id
            )
        elif req.tool_name == "kml_to_database_hp":
            process_apd_hpdb_task.delay(
                job_id=req.job_id,
                input_file_path=req.file_path,
                original_filename=req.original_filename,
                user_id=req.user_id
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported tool: {req.tool_name}")
            
        return {"status": "queued", "job_id": req.job_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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