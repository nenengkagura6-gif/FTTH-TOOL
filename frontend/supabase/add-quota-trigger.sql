-- ==================================================
-- MIGRATION: Auto-increment user quota on job completion
-- Run this in the Supabase Dashboard SQL Editor
-- URL: https://supabase.com/dashboard/project/itfwqexiekhjaxbhjlpf/sql/new
-- ==================================================

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_job_completion()
RETURNS TRIGGER AS $$
BEGIN
    -- Increment profiles.quota_used only when status transitions to 'completed'
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        PERFORM public.increment_quota_usage(NEW.user_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop the trigger if it already exists
DROP TRIGGER IF EXISTS tr_on_job_completed ON public.processing_jobs;

-- 3. Create the trigger to execute after a job status updates to completed
CREATE TRIGGER tr_on_job_completed
    AFTER UPDATE OF status ON public.processing_jobs
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
    EXECUTE FUNCTION public.handle_job_completion();
