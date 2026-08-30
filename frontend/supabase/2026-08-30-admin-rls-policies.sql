-- ====================================================================
-- POLICY RLS UNTUK ADMIN — 2026-08-30
-- Jalankan di Supabase Dashboard > SQL Editor.
-- Idempotent: aman dijalankan berulang kali.
--
-- Gejala: menyetujui pembayaran gagal dengan
--   "new row violates row-level security policy for table subscriptions"
--
-- Sebab: panel admin berjalan di browser sebagai role `authenticated`
-- (anon key + JWT), BUKAN service_role. Tabel subscriptions hanya punya
-- dua policy — SELECT untuk pemiliknya, dan ALL untuk service_role. Tidak
-- ada satu pun yang mengizinkan admin menulis, sehingga INSERT langganan
-- selalu ditolak.
--
-- Ada masalah kedua yang lebih senyap pada tabel profiles:
--
--   CREATE POLICY "Users can update own profile"
--       ON profiles FOR UPDATE USING (auth.uid() = id);
--
-- Admin hanya bisa memperbarui profilnya SENDIRI. Saat admin mengubah
-- paket user lain, UPDATE tidak ditolak — ia hanya mengenai NOL baris,
-- tanpa error apa pun. Itu sebabnya dropdown paket di panel admin bisa
-- terlihat berhasil padahal tidak pernah tersimpan.
--
-- Aman digabung dengan trigger penjaga kolom istimewa
-- (protect_profile_privileged_columns): trigger itu memang sudah
-- mengizinkan admin mengubah plan/role/quota.
-- ====================================================================


-- ====================================================================
-- BAGIAN 1 — ADMIN BOLEH MENGELOLA LANGGANAN
-- ====================================================================
-- is_admin() adalah SECURITY DEFINER, jadi tidak memicu rekursi RLS saat
-- membaca tabel profiles dari dalam policy.

DROP POLICY IF EXISTS "Admins can manage subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can manage subscriptions"
    ON public.subscriptions FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ====================================================================
-- BAGIAN 2 — ADMIN BOLEH MEMPERBARUI PROFIL USER LAIN
-- ====================================================================

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ====================================================================
-- BAGIAN 3 — ADMIN BOLEH MEMBACA SEMUA LANGGANAN
-- ====================================================================
-- Kartu statistik di panel admin menghitung langganan aktif seluruh user.
-- Tanpa policy ini angkanya selalu hanya menghitung milik admin sendiri —
-- salah tanpa memunculkan error.

DROP POLICY IF EXISTS "Admins can read all subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can read all subscriptions"
    ON public.subscriptions FOR SELECT
    TO authenticated
    USING (public.is_admin());


-- ====================================================================
-- BAGIAN 4 — ADMIN BOLEH MEMBACA SEMUA JOB
-- ====================================================================
-- Alasan yang sama: kartu "Total Jobs" dan "Today" di panel admin.

DROP POLICY IF EXISTS "Admins can read all jobs" ON public.processing_jobs;
CREATE POLICY "Admins can read all jobs"
    ON public.processing_jobs FOR SELECT
    TO authenticated
    USING (public.is_admin());


-- ====================================================================
-- VERIFIKASI — statement terakhir, hasilnya yang tampil
-- ====================================================================
SELECT
    tablename  AS tabel,
    policyname AS policy,
    cmd        AS operasi,
    roles::text AS untuk_role
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('subscriptions', 'profiles', 'processing_jobs')
ORDER BY tablename, cmd, policyname;

-- Yang harus muncul, minimal:
--   subscriptions   | Admins can manage subscriptions    | ALL    | {authenticated}
--   subscriptions   | Admins can read all subscriptions  | SELECT | {authenticated}
--   profiles        | Admins can update all profiles     | UPDATE | {authenticated}
--   processing_jobs | Admins can read all jobs           | SELECT | {authenticated}
