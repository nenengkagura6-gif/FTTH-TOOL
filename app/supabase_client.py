import os
import io
import json
import tempfile
from typing import Optional, Dict, Any, Union
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# We need the service role key to bypass RLS for server-to-server operations
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("WARNING: SUPABASE_URL or SUPABASE_KEY is not set. Supabase integration will fail.")

def get_supabase() -> Optional[Client]:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return None
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def update_job_status(job_id: str, status: str, extra_data: dict = None) -> bool:
    """Update job status in processing_jobs table."""
    supabase = get_supabase()
    if not supabase:
        return False
        
    data = {"status": status}
    if extra_data:
        data.update(extra_data)
        
    try:
        supabase.table("processing_jobs").update(data).eq("id", job_id).execute()
        return True
    except Exception as e:
        print(f"Error updating job status: {e}")
        return False


def download_input_file(file_path: str) -> Optional[bytes]:
    """Download a file from the uploads bucket."""
    supabase = get_supabase()
    if not supabase:
        return None
        
    try:
        # Supabase Python client returns bytes for download()
        res = supabase.storage.from_("uploads").download(file_path)
        return res
    except Exception as e:
        print(f"Error downloading input file {file_path}: {e}")
        return None


def upload_output_file(user_id: str, filename: str, file_bytes: bytes, content_type: str) -> Optional[str]:
    """
    Upload a file to the outputs bucket.
    Returns the file path within the bucket.
    """
    supabase = get_supabase()
    if not supabase:
        return None
        
    try:
        # Save to temp file since supabase python client sometimes prefers file objects
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(file_bytes)
            temp_path = f.name
            
        file_path = f"{user_id}/{filename}"
        
        # Upload
        with open(temp_path, "rb") as f:
            supabase.storage.from_("outputs").upload(
                file_path, 
                f, 
                file_options={"content-type": content_type, "upsert": "true"}
            )
            
        os.unlink(temp_path)
        return file_path
    except Exception as e:
        print(f"Error uploading output file: {e}")
        return None

def delete_storage_files(bucket_name: str, file_paths: list[str]) -> bool:
    """Delete multiple files from a specific storage bucket."""
    if not file_paths:
        return True
        
    supabase = get_supabase()
    if not supabase:
        return False
        
    try:
        res = supabase.storage.from_(bucket_name).remove(file_paths)
        return True
    except Exception as e:
        print(f"Error deleting files from {bucket_name}: {e}")
        return False

def get_expired_jobs() -> list[dict]:
    """Get all jobs that have passed their expiration date."""
    supabase = get_supabase()
    if not supabase:
        return []
        
    try:
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).isoformat()
        
        # Only get jobs that are completed, failed, or cancelled AND have expired
        res = supabase.table("processing_jobs") \
            .select("id, original_file_url, output_file_url") \
            .lt("expires_at", now_iso) \
            .in_("status", ["completed", "failed", "cancelled"]) \
            .execute()
            
        return res.data or []
    except Exception as e:
        print(f"Error fetching expired jobs: {e}")
        return []

def mark_jobs_expired(job_ids: list[str]) -> bool:
    """Mark jobs as expired and clear their file URLs so they can't be downloaded."""
    if not job_ids:
        return True
        
    supabase = get_supabase()
    if not supabase:
        return False
        
    try:
        for job_id in job_ids:
            supabase.table("processing_jobs").update({
                "status": "expired",
                "original_file_url": None,
                "output_file_url": None,
                "error_message": "Files have been permanently deleted due to expiration policy."
            }).eq("id", job_id).execute()
        return True
    except Exception as e:
        print(f"Error marking jobs expired: {e}")
        return False

def get_job_config(job_id: str) -> dict:
    """Fetch the configuration JSON for a job from processing_jobs table."""
    supabase = get_supabase()
    if not supabase:
        return {}
    try:
        res = supabase.table("processing_jobs").select("config").eq("id", job_id).execute()
        if res.data:
            return res.data[0].get("config") or {}
        return {}
    except Exception as e:
        print(f"Error fetching job config: {e}")
        return {}

