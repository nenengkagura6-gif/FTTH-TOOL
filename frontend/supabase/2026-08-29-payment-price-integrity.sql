-- ====================================================================
-- INTEGRITAS HARGA PEMBAYARAN — 2026-08-29
-- Jalankan di Supabase Dashboard > SQL Editor.
-- Idempotent: aman dijalankan berulang kali.
--
-- Masalah: halaman pricing menghitung price_cents dan amount_paid DI
-- BROWSER lalu meng-INSERT-nya ke payment_confirmations:
--
--     const priceCents = selectedPlan.target === 'pro' ? 1667 : 300
--     const amountPaid = selectedPlan.target === 'pro' ? 250000 : 45000
--     await supabase.from('payment_confirmations').insert({ price_cents, amount_paid, ... })
--
-- Artinya user bisa mengirim konfirmasi pembayaran dengan nominal
-- karangan (mis. plan 'pro' dengan amount_paid 1000), dan admin melihat
-- angka buatan user itu di panel verifikasi.
--
-- Policy RLS lama juga tidak membatasi kolom status, sehingga user bisa
-- meng-INSERT langsung dengan status 'approved'.
--
-- Solusi: daftar harga jadi milik server, dan trigger BEFORE INSERT
-- menimpa apa pun yang dikirim client.
-- ====================================================================


-- ====================================================================
-- BAGIAN 1 — TABEL HARGA (SUMBER KEBENARAN DI SERVER)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.plan_prices (
    plan           TEXT    NOT NULL,
    billing_cycle  TEXT    NOT NULL,
    -- Harga dalam rupiah penuh. IDR tidak dipakai dengan pecahan sen,
    -- jadi price_cents pada payment_confirmations diisi nilai yang sama;
    -- penamaan "cents" itu warisan skema lama, bukan satuan sebenarnya.
    price_idr      INTEGER NOT NULL CHECK (price_idr >= 0),
    currency       TEXT    NOT NULL DEFAULT 'IDR',
    is_active      BOOLEAN NOT NULL DEFAULT true,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (plan, billing_cycle)
);

-- Harga saat ini, disamakan dengan yang tampil di halaman pricing
INSERT INTO public.plan_prices (plan, billing_cycle, price_idr) VALUES
    ('basic',      'monthly',   45000),
    ('pro',        'monthly',  250000),
    ('basic',      'yearly',   450000),   -- 10 bulan, 2 bulan gratis
    ('pro',        'yearly',  2500000),
    ('enterprise', 'monthly',       0),   -- harga via negosiasi
    ('enterprise', 'yearly',        0)
ON CONFLICT (plan, billing_cycle) DO NOTHING;

ALTER TABLE public.plan_prices ENABLE ROW LEVEL SECURITY;

-- Semua orang boleh MEMBACA harga (halaman pricing publik),
-- tapi hanya service_role yang boleh mengubahnya.
DROP POLICY IF EXISTS "Anyone can read plan prices" ON public.plan_prices;
CREATE POLICY "Anyone can read plan prices"
    ON public.plan_prices FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Service role manages plan prices" ON public.plan_prices;
CREATE POLICY "Service role manages plan prices"
    ON public.plan_prices FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);


-- ====================================================================
-- BAGIAN 2 — TRIGGER: TIMPA NILAI DARI CLIENT
-- ====================================================================

CREATE OR REPLACE FUNCTION public.enforce_payment_price()
RETURNS TRIGGER AS $fn$
DECLARE
    v_price    INTEGER;
    v_currency TEXT;
BEGIN
    SELECT price_idr, currency
      INTO v_price, v_currency
      FROM public.plan_prices
     WHERE plan = NEW.plan
       AND billing_cycle = NEW.billing_cycle
       AND is_active;

    IF v_price IS NULL THEN
        RAISE EXCEPTION
            'Kombinasi paket tidak dikenali: % / %', NEW.plan, NEW.billing_cycle
            USING ERRCODE = '22023';
    END IF;

    -- Apa pun yang dikirim client diabaikan sepenuhnya.
    NEW.amount_paid := v_price;
    NEW.price_cents := v_price;
    NEW.currency    := v_currency;

    -- User tidak boleh menyatakan pembayarannya sendiri sudah disetujui.
    -- Persetujuan hanya lewat panel admin (UPDATE, bukan INSERT).
    NEW.status      := 'pending';
    NEW.admin_notes := NULL;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS tr_enforce_payment_price ON public.payment_confirmations;
CREATE TRIGGER tr_enforce_payment_price
    BEFORE INSERT ON public.payment_confirmations
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_payment_price();


-- ====================================================================
-- BAGIAN 3 — KOLOM HARGA BOLEH DIKOSONGKAN CLIENT
-- ====================================================================
-- Supaya frontend bisa berhenti mengirim kolom harga sama sekali.
-- Constraint NOT NULL dievaluasi SETELAH BEFORE-trigger, jadi trigger di
-- Bagian 2 sempat mengisinya lebih dulu. DEFAULT di sini hanya jaring
-- pengaman kalau trigger dinonaktifkan.

ALTER TABLE public.payment_confirmations
    ALTER COLUMN price_cents SET DEFAULT 0,
    ALTER COLUMN amount_paid SET DEFAULT 0;


-- ====================================================================
-- VERIFIKASI
-- ====================================================================
-- Jalankan sebagai user biasa dari console browser. Kirim nominal
-- karangan — hasilnya harus tetap tersimpan dengan harga resmi:
--
--   await supabase.from('payment_confirmations').insert({
--     user_id: (await supabase.auth.getUser()).data.user.id,
--     plan: 'pro', billing_cycle: 'monthly',
--     sender_name: 'Uji', sender_bank: 'BRI',
--     receipt_url: 'dummy/uji.jpg',
--     price_cents: 1, amount_paid: 1, status: 'approved'   // <- diabaikan
--   })
--
--   await supabase.from('payment_confirmations')
--     .select('plan,amount_paid,price_cents,status')
--     .order('created_at', { ascending: false }).limit(1)
--
--   -> harus: amount_paid 250000, price_cents 250000, status 'pending'
--   (hapus lagi baris uji itu lewat panel admin)
--
-- Cek daftar harga:
--   SELECT * FROM public.plan_prices ORDER BY plan, billing_cycle;
-- ====================================================================
