import os
import io
import json
import uuid
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


def get_user_from_token(access_token: str) -> Optional[Any]:
    """
    Verifikasi Supabase access token (JWT) dan kembalikan objek user.

    Memakai Supabase Auth API supaya tidak perlu menyimpan JWT secret
    tambahan dan token yang sudah dicabut ikut tertolak. Dipanggil sekali
    per submit job, jadi biaya round-trip-nya dapat diterima.
    """
    if not access_token:
        return None

    supabase = get_supabase()
    if not supabase:
        return None

    try:
        res = supabase.auth.get_user(access_token)
        user = getattr(res, "user", None)
        return user if user and getattr(user, "id", None) else None
    except Exception as e:
        print(f"Token verification failed: {e}")
        return None


def job_belongs_to_user(job_id: str, user_id: str) -> bool:
    """Pastikan job_id benar-benar milik user_id sebelum diproses/diubah."""
    supabase = get_supabase()
    if not supabase:
        return False

    try:
        res = supabase.table("processing_jobs")             .select("user_id")             .eq("id", job_id)             .limit(1)             .execute()
        if not res.data:
            return False
        return str(res.data[0].get("user_id")) == str(user_id)
    except Exception as e:
        print(f"Error verifying job ownership: {e}")
        return False


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


def sanitize_filename(filename: str) -> str:
    """
    Bersihkan nama file sebelum dipakai sebagai storage key.

    Nama file berasal dari input user (original_filename), jadi tanpa ini
    nilai seperti "../../other-user/x.xlsx" bisa menulis ke luar folder
    milik user — service role mem-bypass RLS.
    """
    import re

    # Buang komponen direktori apa pun (POSIX maupun Windows)
    name = os.path.basename(str(filename or "").replace("\\", "/"))

    # Sisakan karakter yang aman untuk storage key
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)

    # Tolak path traversal & nama kosong yang tersisa
    name = name.lstrip(".") or "output"

    # Batasi panjang, pertahankan ekstensi
    if len(name) > 120:
        stem, dot, ext = name.rpartition(".")
        name = (stem[:100] + dot + ext[:15]) if dot else name[:120]

    return name


def upload_output_file(user_id: str, filename: str, file_bytes: bytes, content_type: str) -> Optional[str]:
    """
    Upload a file to the outputs bucket.
    Returns the file path within the bucket.
    """
    supabase = get_supabase()
    if not supabase:
        return None

    temp_path = None
    try:
        # Save to temp file since supabase python client sometimes prefers file objects
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(file_bytes)
            temp_path = f.name

        # Prefix unik: dua job dengan nama file sumber sama tidak lagi
        # saling menimpa, dan signed URL-nya tidak tertukar.
        safe_name = sanitize_filename(filename)
        unique_prefix = uuid.uuid4().hex[:8]
        file_path = f"{user_id}/{unique_prefix}_{safe_name}"

        # Upload
        with open(temp_path, "rb") as f:
            supabase.storage.from_("outputs").upload(
                file_path,
                f,
                file_options={"content-type": content_type, "upsert": "true"}
            )

        return file_path
    except Exception as e:
        print(f"Error uploading output file: {e}")
        return None
    finally:
        # Sebelumnya unlink berada di dalam try, jadi file temp bocor
        # setiap kali upload gagal.
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

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
        
        # 'expired' ikut disertakan: pg_cron (mark_expired_jobs) menandai
        # job lebih dulu, jadi tanpa ini daftarnya selalu kosong dan file
        # tidak pernah benar-benar terhapus.
        res = supabase.table("processing_jobs") \
            .select("id, original_file_url, output_file_url") \
            .lt("expires_at", now_iso) \
            .in_("status", ["completed", "failed", "cancelled", "expired"]) \
            .execute()
            
        # Lewati baris yang URL-nya sudah dikosongkan — file-nya sudah
        # dihapus di putaran sebelumnya.
        return [
            row for row in (res.data or [])
            if row.get("original_file_url") or row.get("output_file_url")
        ]
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

