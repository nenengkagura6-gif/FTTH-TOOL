-- ==================================================
-- MIGRATION: Manual Bank Payment & Admin Verification
-- Run this in the Supabase Dashboard SQL Editor
-- ==================================================

-- 1. Create payment_confirmations table
CREATE TABLE IF NOT EXISTS public.payment_confirmations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan TEXT NOT NULL CHECK (plan IN ('basic', 'pro', 'enterprise')),
    billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
    price_cents INTEGER NOT NULL,
    currency TEXT DEFAULT 'IDR',
    
    -- Sender bank details
    sender_name TEXT NOT NULL,
    sender_bank TEXT NOT NULL,
    amount_paid INTEGER NOT NULL,
    
    -- Verification details
    receipt_url TEXT NOT NULL, -- URL of uploaded transfer proof
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_user_id ON public.payment_confirmations(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_status ON public.payment_confirmations(status);

-- Enable RLS
ALTER TABLE public.payment_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_confirmations FORCE ROW LEVEL SECURITY;

-- 2. RLS Policies for payment_confirmations
DROP POLICY IF EXISTS "Users can insert own payment confirmations" ON public.payment_confirmations;
CREATE POLICY "Users can insert own payment confirmations"
    ON public.payment_confirmations FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can read own payment confirmations" ON public.payment_confirmations;
CREATE POLICY "Users can read own payment confirmations"
    ON public.payment_confirmations FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all payment confirmations" ON public.payment_confirmations;
CREATE POLICY "Admins can manage all payment confirmations"
    ON public.payment_confirmations FOR ALL
    TO authenticated
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- 3. Setup Trigger for updated_at
DROP TRIGGER IF EXISTS update_payment_confirmations_updated_at ON public.payment_confirmations;
CREATE TRIGGER update_payment_confirmations_updated_at
    BEFORE UPDATE ON public.payment_confirmations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. Create public receipts storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('receipts', 'receipts', true, 5242880, ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ])
ON CONFLICT (id) DO NOTHING;

-- 5. RLS Policies for receipts storage bucket
DROP POLICY IF EXISTS "Users can upload own receipts" ON storage.objects;
CREATE POLICY "Users can upload own receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Public read receipts" ON storage.objects;
CREATE POLICY "Public read receipts"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Admins can delete receipts" ON storage.objects;
CREATE POLICY "Admins can delete receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'receipts' AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');
