import os
import time
import json
from celery_app import celery_app
from supabase_client import update_job_status, download_input_file, upload_output_file, get_expired_jobs, delete_storage_files, mark_jobs_expired
from engines.kml_engine import process_kml_to_excel
from engines.apd_engine import process_apd_hpdb
from datetime import datetime, timedelta, timezone

# Import specific engine for duplicate checking if needed
# from engines.duplikat_engine import DuplikatEngine

@celery_app.task(name="process_kml_to_boq_task", bind=True)
def process_kml_to_boq_task(self, job_id: str, input_file_path: str, original_filename: str, user_id: str):
    """Celery task to process KML to BOQ."""
    try:
        # 1. Update status to processing
        update_job_status(job_id, "processing", {"started_at": time.strftime('%Y-%m-%dT%H:%M:%S%z')})
        start_time = time.time()
        
        # 2. Download input file
        file_bytes = download_input_file(input_file_path)
        if not file_bytes:
            raise Exception("Failed to download input file from storage")
            
        # 3. Process the file
        is_kmz = original_filename.lower().endswith(".kmz")
        result = process_kml_to_excel(
            kml_content=file_bytes,
            filename=original_filename,
            template_content=None, # Assuming no custom template for now
            is_kmz=is_kmz
        )
        
        if result.get("status") == "error":
            raise Exception(result.get("message", "Unknown processing error"))
            
        # 4. Upload output file
        output_filename = result["filename"]
        output_path = upload_output_file(
            user_id=user_id,
            filename=output_filename,
            file_bytes=result["content"],
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        
        if not output_path:
            raise Exception("Failed to upload output file to storage")
            
        # 5. Mark as completed (+7 days expiration)
        processing_time_ms = int((time.time() - start_time) * 1000)
        expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        
        update_job_status(job_id, "completed", {
            "output_filename": output_filename,
            "output_file_url": output_path,
            "processing_time_ms": processing_time_ms,
            "completed_at": time.strftime('%Y-%m-%dT%H:%M:%S%z'),
            "output_file_size_bytes": len(result["content"]),
            "expires_at": expires_at
        })
        
        return {"status": "success", "job_id": job_id}
        
    except Exception as e:
        error_msg = str(e)
        expires_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        update_job_status(job_id, "failed", {
            "error_message": error_msg,
            "completed_at": time.strftime('%Y-%m-%dT%H:%M:%S%z'),
            "expires_at": expires_at
        })
        return {"status": "error", "message": error_msg}


@celery_app.task(name="process_apd_hpdb_task", bind=True)
def process_apd_hpdb_task(self, job_id: str, input_file_path: str, original_filename: str, user_id: str):
    """Celery task to process APD HPDB."""
    try:
        update_job_status(job_id, "processing", {"started_at": time.strftime('%Y-%m-%dT%H:%M:%S%z')})
        start_time = time.time()
        
        file_bytes = download_input_file(input_file_path)
        if not file_bytes:
            raise Exception("Failed to download input file from storage")
            
        result = process_apd_hpdb(
            kml_content=file_bytes,
            filename=original_filename,
            apd_template_content=None
        )
        
        if result.get("status") == "error":
            raise Exception(result.get("message", "Unknown processing error"))
            
        output_filename = result["filename"]
        output_path = upload_output_file(
            user_id=user_id,
            filename=output_filename,
            file_bytes=result["content"],
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        
        if not output_path:
            raise Exception("Failed to upload output file to storage")
            
        processing_time_ms = int((time.time() - start_time) * 1000)
        expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
        
        update_job_status(job_id, "completed", {
            "output_filename": output_filename,
            "output_file_url": output_path,
            "processing_time_ms": processing_time_ms,
            "completed_at": time.strftime('%Y-%m-%dT%H:%M:%S%z'),
            "output_file_size_bytes": len(result["content"]),
            "expires_at": expires_at
        })
        
        return {"status": "success", "job_id": job_id}
        
    except Exception as e:
        error_msg = str(e)
        expires_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        update_job_status(job_id, "failed", {
            "error_message": error_msg,
            "completed_at": time.strftime('%Y-%m-%dT%H:%M:%S%z'),
            "expires_at": expires_at
        })
        return {"status": "error", "message": error_msg}

@celery_app.task(name="cleanup_expired_jobs_task")
def cleanup_expired_jobs_task():
    """Periodic Celery Beat task to delete expired files from Supabase Storage."""
    try:
        print("Running cleanup_expired_jobs_task...")
        expired_jobs = get_expired_jobs()
        if not expired_jobs:
            print("No expired jobs found. Cleanup complete.")
            return {"status": "success", "deleted_count": 0}
            
        print(f"Found {len(expired_jobs)} expired jobs. Proceeding with cleanup.")
        
        uploads_to_delete = []
        outputs_to_delete = []
        job_ids = []
        
        for job in expired_jobs:
            job_ids.append(job["id"])
            if job.get("original_file_url"):
                uploads_to_delete.append(job["original_file_url"])
            if job.get("output_file_url"):
                outputs_to_delete.append(job["output_file_url"])
                
        # Batch delete files from Supabase Storage
        if uploads_to_delete:
            delete_storage_files("uploads", uploads_to_delete)
            print(f"Deleted {len(uploads_to_delete)} files from uploads bucket.")
            
        if outputs_to_delete:
            delete_storage_files("outputs", outputs_to_delete)
            print(f"Deleted {len(outputs_to_delete)} files from outputs bucket.")
            
        # Update database records
        mark_jobs_expired(job_ids)
        print(f"Marked {len(job_ids)} jobs as expired in database.")
        
        return {"status": "success", "deleted_count": len(job_ids)}
    except Exception as e:
        print(f"Error during cleanup task: {e}")
        return {"status": "error", "message": str(e)}
