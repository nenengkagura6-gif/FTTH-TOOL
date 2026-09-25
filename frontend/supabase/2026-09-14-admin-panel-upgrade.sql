-- ====================================================================
-- PANEL ADMIN: AGREGAT, MONITORING LANGGANAN, KENDALI AKUN,
--              JEJAK AUDIT, DAN NOTIFIKASI PENGGUNA
-- 2026-09-14
-- Jalankan di Supabase Dashboard > SQL Editor.
-- Idempotent: aman dijalankan berulang kali.
--
-- CATATAN: berkas ini menggantikan versi sebelumnya yang hanya berisi
-- Bagian 1-8. Kalau versi itu sudah pernah dijalankan, jalankan ulang
-- berkas ini — seluruhnya CREATE OR REPLACE / IF NOT EXISTS.
--
-- Yang diperbaiki migrasi ini:
--
--   1. is_admin() bisa mengembalikan NULL — dan `IF NOT NULL` di PL/pgSQL
--      TIDAK masuk ke cabang THEN. Artinya setiap penjagaan berbentuk
--      `IF NOT public.is_admin() THEN RAISE` gagal terbuka (fail-open)
--      untuk user yang barisnya tidak ada di profiles.
--
--   2. Panel admin menarik SELURUH isi profiles + processing_jobs +
--      subscriptions ke browser hanya untuk menghitung lima angka.
--
--   3. Tidak ada cara melihat kapan langganan seorang user berakhir,
--      apalagi memperpanjang / mencabutnya, tanpa membuka SQL Editor.
--
--   4. Tabel audit_logs, fungsi create_audit_log(), dan helper
--      lib/audit.ts sudah ada sejak awal — tetapi TIDAK PERNAH dipanggil
--      dari mana pun. Setiap tindakan admin (ubah paket, angkat admin,
--      setujui uang) tidak meninggalkan jejak sama sekali.
--
--   5. Verifikasi pembayaran manual tidak pernah sampai ke penggunanya.
--      Alasan penolakan tersimpan di admin_notes dan berhenti di situ.
-- ====================================================================


-- ====================================================================
-- BAGIAN 1 — is_admin() TIDAK BOLEH MENGEMBALIKAN NULL
-- ====================================================================
-- Definisi lama (add-subscription-check.sql):
--
--     SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid();
--
-- Dua jalan menuju NULL:
--   a. auth.uid() tidak punya baris di profiles  -> query nihil -> NULL
--   b. kolom role berisi NULL                    -> NULL = 'admin' -> NULL
--
-- Dan NULL berbahaya justru karena pemanggilnya menulis:
--
--     IF NOT public.is_admin() THEN RAISE EXCEPTION 'Hanya admin' END IF;
--
-- `NOT NULL` bernilai NULL, dan IF hanya masuk cabang THEN bila TRUE.
-- Jadi exception-nya TIDAK pernah dilempar dan eksekusi lanjut ke
-- badan fungsi — approve_payment, admin_set_user_plan, dan seluruh
-- fungsi di bawah ikut terdampak.
--
-- COALESCE membuat ketiadaan baris berarti "bukan admin".

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $fn$
    SELECT COALESCE(
        (SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()),
        false
    );
$fn$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO authenticated;


-- ====================================================================
-- BAGIAN 2 — audit_logs DIPERLUAS AGAR BISA MENCATAT TINDAKAN ADMIN
-- ====================================================================
-- Dua hal menghalangi tabel ini dipakai untuk tindakan admin:
--
--   a. CHECK pada event_type memuat daftar tetap yang sama sekali tidak
--      punya kategori 'admin.*', jadi INSERT tindakan admin ditolak.
--   b. Hanya ada kolom user_id. Untuk tindakan admin kita butuh DUA
--      identitas: siapa yang dikenai, dan siapa yang melakukan.
--
-- Konvensi setelah migrasi ini:
--   user_id  = akun yang TERDAMPAK (supaya policy "read own" tetap
--              bermakna: user bisa melihat riwayat akunnya sendiri)
--   actor_id = admin yang MELAKUKAN (NULL untuk tindakan mandiri user)

ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_event_type_check;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_event_type_check CHECK (
    event_type IN (
        -- Daftar asli dari 01-schema.sql — jangan dihapus, sudah dipakai
        'auth.login', 'auth.logout', 'auth.signup', 'auth.password_reset',
        'auth.email_verified', 'job.created', 'job.completed', 'job.failed',
        'file.uploaded', 'file.downloaded', 'file.deleted', 'quota.exceeded',
        'subscription.changed', 'api_key.created', 'api_key.revoked',
        'security.suspicious_activity',
        -- Tindakan panel admin
        'admin.plan_changed',
        'admin.subscription_extended',
        'admin.subscription_revoked',
        'admin.role_changed',
        'admin.account_suspended',
        'admin.account_reactivated',
        'admin.quota_reset',
        'admin.payment_approved',
        'admin.payment_rejected',
        'admin.devices_reset',
        -- Keamanan akun admin
        'admin.step_up_failed',
        'admin.mfa_enrolled',
        'admin.mfa_unenrolled'
    )
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor      ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs(event_type);

-- Tanpa policy ini, admin tidak bisa membaca jejak milik orang lain —
-- satu-satunya policy SELECT yang ada adalah "Users can read own".
DROP POLICY IF EXISTS "Admins can read all audit logs" ON public.audit_logs;
CREATE POLICY "Admins can read all audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (public.is_admin());


-- ====================================================================
-- BAGIAN 3 — TABEL NOTIFIKASI PENGGUNA
-- ====================================================================
-- Lonceng notifikasi di components/dashboard/header.tsx sudah ada, tetapi
-- isinya tiga entri yang ditulis mati di dalam kode dan status bacanya
-- disimpan di localStorage. Tabel ini menggantikannya dengan data nyata.
--
-- Teks TIDAK disimpan di sini. Yang disimpan adalah `kind` + `payload`,
-- lalu klien merangkai kalimatnya sesuai bahasa yang sedang aktif.
-- Kalau teksnya disimpan jadi string, notifikasi lama akan terkunci pada
-- satu bahasa selamanya.

CREATE TABLE IF NOT EXISTS public.notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    payload    JSONB NOT NULL DEFAULT '{}',
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.notifications;
CREATE POLICY "Users can mark own notifications read"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- RLS tidak bisa membatasi KOLOM, hanya baris. Hak update dipersempit di
-- tingkat privilege supaya user hanya boleh menyentuh read_at — bukan
-- mengarang ulang `kind` atau `payload` notifikasinya sendiri.
-- INSERT sengaja tidak diberikan ke siapa pun: notifikasi hanya lahir
-- dari fungsi SECURITY DEFINER di bawah.
REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT SELECT            ON public.notifications TO authenticated;
GRANT UPDATE (read_at)  ON public.notifications TO authenticated;


-- ====================================================================
-- BAGIAN 4 — HELPER INTERNAL: CATAT JEJAK & KIRIM NOTIFIKASI
-- ====================================================================
-- Keduanya sengaja TIDAK diberikan ke role authenticated. Keduanya hanya
-- dipanggil dari dalam fungsi SECURITY DEFINER di bawah, yang berjalan
-- sebagai pemilik fungsi.
--
-- Ini alasannya pencatatan diletakkan di database, bukan di browser:
-- kalau panel yang memanggil create_audit_log() sendiri, klien yang sudah
-- dikuasai penyerang tinggal TIDAK memanggilnya. Di dalam fungsi, catatan
-- dan perubahannya berada dalam satu transaksi — tidak bisa dipisahkan.

CREATE OR REPLACE FUNCTION public.log_admin_action(
    p_target_user UUID,
    p_event_type  TEXT,
    p_description TEXT,
    p_metadata    JSONB DEFAULT '{}',
    p_severity    TEXT  DEFAULT 'info'
)
RETURNS UUID AS $fn$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.audit_logs (
        user_id, actor_id, event_type, description, severity, metadata
    ) VALUES (
        p_target_user, auth.uid(), p_event_type, p_description, p_severity, p_metadata
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.log_admin_action(UUID, TEXT, TEXT, JSONB, TEXT)
    FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.notify_user(
    p_user_id UUID,
    p_kind    TEXT,
    p_payload JSONB DEFAULT '{}'
)
RETURNS UUID AS $fn$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.notifications (user_id, kind, payload)
    VALUES (p_user_id, p_kind, p_payload)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.notify_user(UUID, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;


-- ====================================================================
-- BAGIAN 4B — VERIFIKASI ULANG IDENTITAS (STEP-UP) UNTUK AKSI ISTIMEWA
-- ====================================================================
-- Masalah: "Jadikan admin" dan "Setujui pembayaran" hanya dijaga dialog
-- confirm() di browser. Sesi admin yang dibajak — laptop yang ditinggal
-- terbuka, token yang dicuri — langsung berarti kendali penuh, termasuk
-- mengangkat akun lain jadi admin sebagai pintu belakang permanen.
--
-- Yang TIDAK dipakai, dan alasannya:
--
--   Menyuruh klien memanggil "saya sudah verifikasi ulang, lho" tidak ada
--   gunanya. Klien yang sudah dikuasai penyerang tinggal memanggil itu
--   tanpa pernah meminta password. Penanda kesegaran harus datang dari
--   sesuatu yang TIDAK bisa dikarang browser.
--
-- Yang dipakai: klaim `amr` di dalam JWT Supabase (Authentication Methods
-- References). Isinya daftar peristiwa autentikasi beserta waktunya,
-- mis. [{"method":"password","timestamp":1757800000}]. JWT-nya
-- ditandatangani Supabase, jadi stempel waktu itu tidak bisa dipalsukan
-- dari sisi klien.
--
-- Alurnya: RPC menolak dengan STEP_UP_REQUIRED -> panel meminta password
-- lagi -> signInWithPassword menerbitkan JWT BARU dengan amr segar ->
-- panel mengulang aksinya.

CREATE OR REPLACE FUNCTION public.auth_age_seconds()
RETURNS INTEGER AS $fn$
DECLARE
    v_amr  JSONB;
    v_last BIGINT;
BEGIN
    v_amr := auth.jwt() -> 'amr';

    -- Tidak ada klaim, atau bentuknya bukan array: tidak bisa disimpulkan.
    IF v_amr IS NULL OR jsonb_typeof(v_amr) <> 'array' THEN
        RETURN NULL;
    END IF;

    SELECT MAX((e ->> 'timestamp')::BIGINT)
    INTO v_last
    FROM jsonb_array_elements(v_amr) AS e
    WHERE e ? 'timestamp'
      AND jsonb_typeof(e -> 'timestamp') = 'number';

    IF v_last IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN GREATEST(0, EXTRACT(EPOCH FROM NOW())::BIGINT - v_last)::INTEGER;
END;
$fn$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.auth_age_seconds() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.auth_age_seconds() TO authenticated;


-- Dipakai panel untuk menampilkan "terverifikasi 2 menit lalu", dan untuk
-- memastikan klaim amr memang tersedia sebelum penegakan diandalkan.
CREATE OR REPLACE FUNCTION public.my_auth_age()
RETURNS JSONB AS $fn$
BEGIN
    RETURN jsonb_build_object(
        'age_seconds', public.auth_age_seconds(),
        'amr_tersedia', (auth.jwt() -> 'amr') IS NOT NULL,
        'aal', auth.jwt() ->> 'aal'
    );
END;
$fn$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.my_auth_age() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_auth_age() TO authenticated;


-- ── Faktor kedua (TOTP) ─────────────────────────────────────────────
-- Password yang dimasukkan ulang hanya melindungi dari sesi yang dibajak.
-- Terhadap password yang BOCOR — phishing, dipakai ulang di situs lain,
-- keylogger — ia tidak melindungi apa pun: penyerang tinggal mengetik
-- ulang password yang sudah ia miliki.
--
-- Yang menutup celah itu adalah faktor yang tidak bisa didapat dari
-- password. Supabase menaruh hasilnya di klaim `aal`: 'aal2' berarti
-- TOTP sudah diverifikasi pada sesi ini. Sama seperti `amr`, klaim itu
-- ditandatangani Supabase dan tidak bisa dikarang browser.

/**
 * TRUE  = akun ini punya TOTP terverifikasi
 * FALSE = belum mendaftarkan
 * NULL  = tabel auth.mfa_factors tidak bisa dibaca
 *
 * Bedanya FALSE dan NULL penting. Kalau pemilik fungsi ini ternyata tidak
 * punya hak baca ke skema auth, memaksakan aal2 akan mengunci panel dari
 * semua admin dan pemulihannya hanya lewat SQL Editor. Maka NULL sengaja
 * diperlakukan sebagai "jangan tegakkan" — tetapi TIDAK disamarkan jadi
 * FALSE, supaya panel bisa menampilkannya sebagai kondisi yang salah dan
 * bukan sekadar "belum aktif".
 */
CREATE OR REPLACE FUNCTION public.has_mfa_enrolled()
RETURNS BOOLEAN AS $fn$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM auth.mfa_factors
        WHERE user_id = auth.uid() AND status = 'verified'
    );
EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    RETURN NULL;
END;
$fn$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = auth, public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.has_mfa_enrolled() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_mfa_enrolled() TO authenticated;


/**
 * Menolak aksi kalau identitas pemanggil belum cukup diyakinkan.
 *
 * Dua lapis:
 *
 *   1. Kesegaran — autentikasi terakhir tidak boleh lebih tua dari
 *      p_max_age detik (dibaca dari klaim `amr`).
 *
 *   2. Faktor kedua — kalau akun ini SUDAH mendaftarkan TOTP, sesinya
 *      wajib aal2.
 *
 * Kenapa lapis kedua bersyarat "kalau sudah mendaftarkan", bukan wajib
 * untuk semua: memaksakan aal2 sebelum ada admin yang mendaftarkan TOTP
 * akan mengunci panel dari semua orang, dan pemulihannya hanya lewat SQL
 * Editor. Dengan bentuk ini, penegakan menyala SENDIRI begitu TOTP
 * didaftarkan — tidak ada saklar yang bisa lupa dinyalakan, dan tidak ada
 * jendela waktu di mana panel tidak bisa dipakai.
 *
 * Konsekuensinya jujur: admin yang belum mendaftarkan TOTP tidak
 * terlindungi dari password yang bocor. Panel menampilkan peringatan
 * menetap untuk akun seperti itu.
 *
 * Awalan pesan errornya dibaca panel: STEP_UP_REQUIRED membuka dialog
 * password, STEP_UP_MFA_REQUIRED membuka dialog kode TOTP.
 */
CREATE OR REPLACE FUNCTION public.require_fresh_auth(p_max_age INTEGER DEFAULT 300)
RETURNS VOID AS $fn$
DECLARE
    v_age INTEGER := public.auth_age_seconds();
    v_aal TEXT    := COALESCE(auth.jwt() ->> 'aal', 'aal1');
BEGIN
    IF v_age IS NULL THEN
        RAISE EXCEPTION
            'STEP_UP_REQUIRED: sesi ini tidak memuat waktu autentikasi (klaim amr). Keluar lalu masuk kembali.'
            USING ERRCODE = '42501';
    END IF;

    IF v_age > p_max_age THEN
        RAISE EXCEPTION
            'STEP_UP_REQUIRED: verifikasi ulang identitas Anda untuk melanjutkan (login terakhir % menit lalu).',
            (v_age / 60)
            USING ERRCODE = '42501';
    END IF;

    -- COALESCE(..., false): NULL berarti status MFA tidak bisa dibaca,
    -- dan itu tidak boleh mengunci panel. Panel menampilkannya terpisah.
    IF COALESCE(public.has_mfa_enrolled(), false) AND v_aal <> 'aal2' THEN
        RAISE EXCEPTION
            'STEP_UP_MFA_REQUIRED: masukkan kode dari aplikasi autentikator Anda.'
            USING ERRCODE = '42501';
    END IF;
END;
$fn$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.require_fresh_auth(INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.require_fresh_auth(INTEGER) TO authenticated;


-- ── Status keamanan akun, untuk ditampilkan di panel ────────────────

CREATE OR REPLACE FUNCTION public.my_security_status()
RETURNS JSONB AS $fn$
BEGIN
    RETURN jsonb_build_object(
        'mfa_enrolled', public.has_mfa_enrolled(),
        'aal',          COALESCE(auth.jwt() ->> 'aal', 'aal1'),
        'auth_age_seconds', public.auth_age_seconds(),
        'amr_tersedia', (auth.jwt() -> 'amr') IS NOT NULL
    );
END;
$fn$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.my_security_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_security_status() TO authenticated;


-- ── Catat percobaan verifikasi yang gagal ───────────────────────────
--
-- Kegagalan password terjadi di dalam Supabase Auth (GoTrue), bukan di
-- database ini — tidak ada trigger yang bisa menangkapnya. Satu-satunya
-- tempat yang tahu adalah panel, jadi panel yang melaporkannya.
--
-- Batas yang jujur: laporan ini datang dari klien, sehingga penyerang
-- yang memakai API langsung bisa saja tidak melaporkannya. Nilainya ada
-- pada kasus yang realistis — orang di depan keyboard yang menebak-nebak
-- lewat antarmuka. Keamanannya sendiri TIDAK bergantung pada fungsi ini;
-- yang menjaga tetap require_fresh_auth() di atas.
--
-- Tiga kegagalan dalam 15 menit dinaikkan ke 'critical', yang memicu
-- pemberitahuan Telegram (lihat 2026-09-14-telegram-alerts.sql).

CREATE OR REPLACE FUNCTION public.admin_log_step_up_failure(p_alasan TEXT DEFAULT NULL)
RETURNS JSONB AS $fn$
DECLARE
    v_gagal_terakhir INTEGER;
    v_severity       TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin' USING ERRCODE = '42501';
    END IF;

    SELECT COUNT(*) INTO v_gagal_terakhir
    FROM public.audit_logs
    WHERE event_type = 'admin.step_up_failed'
      AND actor_id = auth.uid()
      AND created_at >= NOW() - INTERVAL '15 minutes';

    -- Satu salah ketik itu wajar. Tiga kali beruntun bukan.
    v_severity := CASE WHEN v_gagal_terakhir >= 2 THEN 'critical' ELSE 'warning' END;

    PERFORM public.log_admin_action(
        auth.uid(), 'admin.step_up_failed',
        format('Verifikasi ulang gagal (%s kali dalam 15 menit terakhir)', v_gagal_terakhir + 1),
        jsonb_build_object('alasan', COALESCE(p_alasan, '-'), 'percobaan', v_gagal_terakhir + 1),
        v_severity
    );

    RETURN jsonb_build_object('success', true, 'percobaan', v_gagal_terakhir + 1);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.admin_log_step_up_failure(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_log_step_up_failure(TEXT) TO authenticated;


-- ── Catat pendaftaran / pencabutan TOTP ─────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_log_mfa_change(p_terdaftar BOOLEAN)
RETURNS JSONB AS $fn$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin' USING ERRCODE = '42501';
    END IF;

    PERFORM public.log_admin_action(
        auth.uid(),
        CASE WHEN p_terdaftar THEN 'admin.mfa_enrolled' ELSE 'admin.mfa_unenrolled' END,
        CASE WHEN p_terdaftar
             THEN 'Autentikasi dua faktor (TOTP) diaktifkan'
             ELSE 'Autentikasi dua faktor (TOTP) DICABUT' END,
        '{}'::jsonb,
        -- Mencabut faktor kedua menurunkan keamanan akun istimewa.
        CASE WHEN p_terdaftar THEN 'info' ELSE 'critical' END
    );

    RETURN jsonb_build_object('success', true);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.admin_log_mfa_change(BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_log_mfa_change(BOOLEAN) TO authenticated;


-- ====================================================================
-- BAGIAN 5 — STATISTIK DIHITUNG DI DATABASE
-- ====================================================================
-- Menggantikan tiga `select('*')` tanpa limit di app/admin/page.tsx yang
-- menarik semua baris ke browser lalu me-reduce-nya di JavaScript.
--
-- Catatan pendapatan: subscriptions.price_cents menyimpan RUPIAH PENUH,
-- bukan sen (lihat plan_prices di 2026-08-29-payment-price-integrity.sql
-- — pro = 250000 berarti Rp 250.000). Paket tahunan dibagi 12 supaya
-- angkanya benar-benar bulanan (MRR), bukan campur aduk.

CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS JSONB AS $fn$
DECLARE
    v_today   TIMESTAMPTZ := date_trunc('day', NOW());
    v_result  JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh membaca statistik'
            USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'overview', jsonb_build_object(
            'totalUsers',          (SELECT COUNT(*) FROM public.profiles),
            'activeUsers',         (SELECT COUNT(*) FROM public.profiles WHERE is_active),
            'suspendedUsers',      (SELECT COUNT(*) FROM public.profiles WHERE NOT is_active),
            'totalJobs',           (SELECT COUNT(*) FROM public.processing_jobs),
            'todayJobs',           (SELECT COUNT(*) FROM public.processing_jobs
                                     WHERE created_at >= v_today),
            'failedJobs24h',       (SELECT COUNT(*) FROM public.processing_jobs
                                     WHERE status = 'failed'
                                       AND created_at >= NOW() - INTERVAL '24 hours'),
            'activeSubscriptions', (SELECT COUNT(*) FROM public.subscriptions
                                     WHERE status = 'active'
                                       AND (expires_at IS NULL OR expires_at > NOW())),
            -- Langganan aktif yang berakhir dalam 7 hari ke depan
            'expiringSoon',        (SELECT COUNT(*) FROM public.subscriptions
                                     WHERE status = 'active'
                                       AND expires_at IS NOT NULL
                                       AND expires_at > NOW()
                                       AND expires_at <= NOW() + INTERVAL '7 days'),
            -- Sudah lewat tanggal tapi masih bertanda aktif: butuh sapuan
            'overdueSubscriptions',(SELECT COUNT(*) FROM public.subscriptions
                                     WHERE status = 'active'
                                       AND expires_at IS NOT NULL
                                       AND expires_at <= NOW()),
            'pendingPayments',     (SELECT COUNT(*) FROM public.payment_confirmations
                                     WHERE status = 'pending'),
            'monthlyRevenueIdr',   (SELECT COALESCE(SUM(
                                        CASE WHEN billing_cycle = 'yearly'
                                             THEN COALESCE(price_cents, 0) / 12.0
                                             ELSE COALESCE(price_cents, 0)
                                        END), 0)::BIGINT
                                     FROM public.subscriptions
                                     WHERE status = 'active'
                                       AND (expires_at IS NULL OR expires_at > NOW()))
        ),
        'usersByPlan', COALESCE((
            SELECT jsonb_object_agg(plan, jumlah)
            FROM (SELECT COALESCE(plan, 'free') AS plan, COUNT(*) AS jumlah
                  FROM public.profiles GROUP BY 1) t
        ), '{}'::jsonb),
        'jobsByStatus', COALESCE((
            SELECT jsonb_object_agg(status, jumlah)
            FROM (SELECT status, COUNT(*) AS jumlah
                  FROM public.processing_jobs GROUP BY 1) t
        ), '{}'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_admin_stats() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_admin_stats() TO authenticated;


-- ====================================================================
-- BAGIAN 6 — DAFTAR USER LENGKAP DENGAN MASA BERLAKU LANGGANAN
-- ====================================================================
-- Satu panggilan mengembalikan halaman user + baris langganan aktifnya,
-- sehingga panel bisa menampilkan "PRO, sisa 12 hari, berakhir 26 Sep"
-- tanpa query tambahan per baris.
--
-- total_count ikut dibawa di setiap baris supaya paginasi tidak perlu
-- panggilan COUNT terpisah.

DROP FUNCTION IF EXISTS public.get_admin_users(TEXT, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION public.get_admin_users(
    p_search TEXT    DEFAULT NULL,
    p_limit  INTEGER DEFAULT 15,
    p_offset INTEGER DEFAULT 0,
    p_filter TEXT    DEFAULT 'all'   -- all | free | basic | pro | enterprise
                                     -- | expiring | expired | suspended | admin
)
RETURNS TABLE (
    id                 UUID,
    email              TEXT,
    full_name          TEXT,
    plan               TEXT,
    role               TEXT,
    quota_used         INTEGER,
    quota_limit        INTEGER,
    is_active          BOOLEAN,
    created_at         TIMESTAMPTZ,
    last_login_at      TIMESTAMPTZ,
    sub_status         TEXT,
    sub_billing_cycle  TEXT,
    sub_started_at     TIMESTAMPTZ,
    sub_expires_at     TIMESTAMPTZ,
    days_remaining     INTEGER,
    device_count       INTEGER,
    total_count        BIGINT
) AS $fn$
DECLARE
    v_search TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
    v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_limit, 15), 1), 100);
    v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
    v_filter TEXT := LOWER(COALESCE(NULLIF(TRIM(p_filter), ''), 'all'));
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh membaca daftar user'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH sub_aktif AS (
        -- Satu langganan terakhir per user. DISTINCT ON memilih baris
        -- teratas setelah diurutkan, jadi kalau ada sisa data lama yang
        -- menyisakan dua baris 'active', yang terbaru yang menang.
        SELECT DISTINCT ON (s.user_id)
               s.user_id, s.status, s.billing_cycle, s.started_at, s.expires_at
        FROM public.subscriptions s
        WHERE s.status = 'active'
        ORDER BY s.user_id, s.started_at DESC, s.created_at DESC
    ),
    tersaring AS (
        SELECT p.id, p.email, p.full_name, p.plan, p.role,
               p.quota_used, p.quota_limit, p.is_active,
               p.created_at, p.last_login_at,
               sa.status        AS sub_status,
               sa.billing_cycle AS sub_billing_cycle,
               sa.started_at    AS sub_started_at,
               sa.expires_at    AS sub_expires_at,
               (SELECT COUNT(*) FROM public.device_registrations dr
                 WHERE dr.user_id = p.id)::INTEGER AS device_count
        FROM public.profiles p
        LEFT JOIN sub_aktif sa ON sa.user_id = p.id
        WHERE (
            v_search IS NULL
            OR p.email     ILIKE '%' || v_search || '%'
            OR p.full_name ILIKE '%' || v_search || '%'
        )
        AND CASE v_filter
                WHEN 'all'       THEN TRUE
                WHEN 'suspended' THEN NOT p.is_active
                WHEN 'admin'     THEN p.role = 'admin'
                WHEN 'expiring'  THEN sa.expires_at IS NOT NULL
                                      AND sa.expires_at > NOW()
                                      AND sa.expires_at <= NOW() + INTERVAL '7 days'
                WHEN 'expired'   THEN sa.expires_at IS NOT NULL
                                      AND sa.expires_at <= NOW()
                ELSE p.plan = v_filter
            END
    )
    SELECT t.id, t.email, t.full_name, t.plan, t.role,
           t.quota_used, t.quota_limit, t.is_active,
           t.created_at, t.last_login_at,
           t.sub_status, t.sub_billing_cycle, t.sub_started_at, t.sub_expires_at,
           CASE WHEN t.sub_expires_at IS NULL THEN NULL
                ELSE CEIL(EXTRACT(EPOCH FROM (t.sub_expires_at - NOW())) / 86400)::INTEGER
           END AS days_remaining,
           t.device_count,
           COUNT(*) OVER () AS total_count
    FROM tersaring t
    ORDER BY t.created_at DESC
    LIMIT v_limit OFFSET v_offset;
END;
$fn$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_admin_users(TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_admin_users(TEXT, INTEGER, INTEGER, TEXT) TO authenticated;


-- ====================================================================
-- BAGIAN 7 — DETAIL SATU USER (riwayat job + riwayat pembayaran)
-- ====================================================================
-- Dipakai modal "Kelola" di panel admin. Tanpa ini, saat user melapor
-- "konversi saya gagal", admin tidak punya cara melihat job mana yang
-- gagal dan apa pesan errornya.

CREATE OR REPLACE FUNCTION public.get_admin_user_detail(
    p_user_id UUID,
    p_limit   INTEGER DEFAULT 10
)
RETURNS JSONB AS $fn$
DECLARE
    v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 50);
    v_result JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh membaca detail user'
            USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'jobs', COALESCE((
            SELECT jsonb_agg(j ORDER BY j->>'created_at' DESC)
            FROM (
                SELECT jsonb_build_object(
                    'id', pj.id,
                    'tool_name', pj.tool_name,
                    'status', pj.status,
                    'original_filename', pj.original_filename,
                    'error_message', pj.error_message,
                    'error_code', pj.error_code,
                    'processing_time_ms', pj.processing_time_ms,
                    'created_at', pj.created_at
                ) AS j
                FROM public.processing_jobs pj
                WHERE pj.user_id = p_user_id
                ORDER BY pj.created_at DESC
                LIMIT v_limit
            ) sub
        ), '[]'::jsonb),
        'payments', COALESCE((
            SELECT jsonb_agg(p ORDER BY p->>'created_at' DESC)
            FROM (
                SELECT jsonb_build_object(
                    'id', pc.id,
                    'plan', pc.plan,
                    'amount_paid', pc.amount_paid,
                    'status', pc.status,
                    'sender_name', pc.sender_name,
                    'admin_notes', pc.admin_notes,
                    'created_at', pc.created_at
                ) AS p
                FROM public.payment_confirmations pc
                WHERE pc.user_id = p_user_id
                ORDER BY pc.created_at DESC
                LIMIT v_limit
            ) sub
        ), '[]'::jsonb),
        'jobStats', COALESCE((
            SELECT jsonb_object_agg(status, jumlah)
            FROM (SELECT status, COUNT(*) AS jumlah
                  FROM public.processing_jobs
                  WHERE user_id = p_user_id
                  GROUP BY 1) t
        ), '{}'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_admin_user_detail(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_admin_user_detail(UUID, INTEGER) TO authenticated;


-- ====================================================================
-- BAGIAN 8 — RIWAYAT TINDAKAN ADMIN (penampil jejak audit)
-- ====================================================================

CREATE OR REPLACE FUNCTION public.get_admin_audit_logs(
    p_search TEXT    DEFAULT NULL,
    p_limit  INTEGER DEFAULT 25,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id           UUID,
    event_type   TEXT,
    description  TEXT,
    severity     TEXT,
    metadata     JSONB,
    created_at   TIMESTAMPTZ,
    actor_id     UUID,
    actor_email  TEXT,
    target_id    UUID,
    target_email TEXT,
    total_count  BIGINT
) AS $fn$
DECLARE
    v_search TEXT := NULLIF(TRIM(COALESCE(p_search, '')), '');
    v_limit  INTEGER := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);
    v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh membaca jejak audit'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH tersaring AS (
        SELECT al.id, al.event_type, al.description, al.severity, al.metadata,
               al.created_at, al.actor_id, al.user_id AS target_id,
               aktor.email  AS actor_email,
               sasaran.email AS target_email
        FROM public.audit_logs al
        LEFT JOIN public.profiles aktor   ON aktor.id   = al.actor_id
        LEFT JOIN public.profiles sasaran ON sasaran.id = al.user_id
        WHERE al.event_type LIKE 'admin.%'
          AND (
              v_search IS NULL
              OR aktor.email   ILIKE '%' || v_search || '%'
              OR sasaran.email ILIKE '%' || v_search || '%'
              OR al.description ILIKE '%' || v_search || '%'
          )
    )
    SELECT t.id, t.event_type, t.description, t.severity, t.metadata,
           t.created_at, t.actor_id, t.actor_email, t.target_id, t.target_email,
           COUNT(*) OVER () AS total_count
    FROM tersaring t
    ORDER BY t.created_at DESC
    LIMIT v_limit OFFSET v_offset;
END;
$fn$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_admin_audit_logs(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_admin_audit_logs(TEXT, INTEGER, INTEGER) TO authenticated;


-- ====================================================================
-- BAGIAN 9 — UBAH PAKET (dropdown panel admin)
-- ====================================================================
-- Didefinisikan ulang dari 2026-08-30-approve-payment-atomic.sql dengan
-- tambahan jejak audit + notifikasi ke penggunanya.

CREATE OR REPLACE FUNCTION public.admin_set_user_plan(
    p_user_id UUID,
    p_plan    TEXT,
    p_days    INTEGER DEFAULT 30
)
RETURNS JSONB AS $fn$
DECLARE
    v_quota     INTEGER;
    v_expires   TIMESTAMPTZ;
    v_plan_lama TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh mengubah paket'
            USING ERRCODE = '42501';
    END IF;

    IF p_plan NOT IN ('free', 'basic', 'pro', 'enterprise') THEN
        RAISE EXCEPTION 'Paket tidak dikenali: %', p_plan USING ERRCODE = '22023';
    END IF;

    SELECT plan INTO v_plan_lama FROM public.profiles WHERE id = p_user_id;
    IF v_plan_lama IS NULL THEN
        RAISE EXCEPTION 'User % tidak ditemukan', p_user_id USING ERRCODE = '22023';
    END IF;

    v_quota := CASE p_plan
                   WHEN 'basic'      THEN 500
                   WHEN 'pro'        THEN 99999
                   WHEN 'enterprise' THEN 99999
                   ELSE 50
               END;

    -- Hentikan langganan berjalan
    UPDATE public.subscriptions
    SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
    WHERE user_id = p_user_id AND status = 'active';

    IF p_plan <> 'free' THEN
        v_expires := NOW() + (p_days || ' days')::INTERVAL;
        INSERT INTO public.subscriptions (
            user_id, plan, status, billing_cycle, currency,
            started_at, expires_at, payment_provider, provider_subscription_id
        ) VALUES (
            p_user_id, p_plan, 'active', 'monthly', 'IDR',
            NOW(), v_expires, 'manual',
            'admin_' || left(replace(gen_random_uuid()::text, '-', ''), 8)
        );
    END IF;

    PERFORM set_config('app.profile_guard_bypass', 'on', true);

    UPDATE public.profiles
    SET plan = p_plan, quota_limit = v_quota, updated_at = NOW()
    WHERE id = p_user_id;

    PERFORM set_config('app.profile_guard_bypass', 'off', true);

    PERFORM public.log_admin_action(
        p_user_id, 'admin.plan_changed',
        format('Paket diubah dari %s ke %s', v_plan_lama, p_plan),
        jsonb_build_object(
            'plan_lama', v_plan_lama, 'plan_baru', p_plan,
            'quota_limit', v_quota, 'expires_at', v_expires
        ),
        'warning'
    );

    PERFORM public.notify_user(p_user_id, 'plan.changed', jsonb_build_object(
        'plan', p_plan, 'quota_limit', v_quota, 'expires_at', v_expires
    ));

    RETURN jsonb_build_object(
        'success', true, 'plan', p_plan,
        'quota_limit', v_quota, 'expires_at', v_expires
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_plan(UUID, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_plan(UUID, TEXT, INTEGER) TO authenticated;


-- ====================================================================
-- BAGIAN 10 — PERPANJANG LANGGANAN
-- ====================================================================
-- Menambah hari pada langganan yang sedang berjalan. Kalau sudah telanjur
-- lewat tanggal (atau tidak ada barisnya sama sekali), masa berlaku baru
-- dihitung dari SEKARANG, bukan dari tanggal lampau — supaya perpanjangan
-- 30 hari atas langganan yang kedaluwarsa sebulan lalu tidak langsung
-- habis lagi di hari yang sama.

CREATE OR REPLACE FUNCTION public.admin_extend_subscription(
    p_user_id UUID,
    p_days    INTEGER DEFAULT 30
)
RETURNS JSONB AS $fn$
DECLARE
    v_sub     RECORD;
    v_profil  RECORD;
    v_dasar   TIMESTAMPTZ;
    v_expires TIMESTAMPTZ;
    v_quota   INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh memperpanjang langganan'
            USING ERRCODE = '42501';
    END IF;

    IF p_days IS NULL OR p_days = 0 OR ABS(p_days) > 3650 THEN
        RAISE EXCEPTION 'Jumlah hari tidak masuk akal: %', p_days
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_profil FROM public.profiles WHERE id = p_user_id;
    IF v_profil IS NULL THEN
        RAISE EXCEPTION 'User % tidak ditemukan', p_user_id USING ERRCODE = '22023';
    END IF;

    IF v_profil.plan = 'free' THEN
        RAISE EXCEPTION 'Akun masih paket Free — naikkan paketnya dulu sebelum diperpanjang'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_sub
    FROM public.subscriptions
    WHERE user_id = p_user_id AND status = 'active'
    ORDER BY started_at DESC
    LIMIT 1;

    v_quota := CASE v_profil.plan
                   WHEN 'basic'      THEN 500
                   WHEN 'pro'        THEN 99999
                   WHEN 'enterprise' THEN 99999
                   ELSE 50
               END;

    IF v_sub IS NULL THEN
        -- Paket sudah non-free tapi baris langganannya hilang. Buatkan,
        -- supaya akun ini ikut punya tanggal kedaluwarsa seperti yang lain.
        v_expires := NOW() + (p_days || ' days')::INTERVAL;

        INSERT INTO public.subscriptions (
            user_id, plan, status, billing_cycle, currency,
            started_at, expires_at, payment_provider, provider_subscription_id
        ) VALUES (
            p_user_id, v_profil.plan, 'active', 'monthly', 'IDR',
            NOW(), v_expires, 'manual',
            'extend_' || left(replace(gen_random_uuid()::text, '-', ''), 8)
        );
    ELSE
        v_dasar := GREATEST(COALESCE(v_sub.expires_at, NOW()), NOW());
        v_expires := v_dasar + (p_days || ' days')::INTERVAL;

        IF v_expires <= NOW() THEN
            RAISE EXCEPTION 'Pemotongan % hari membuat langganan langsung berakhir', p_days
                USING ERRCODE = '22023';
        END IF;

        UPDATE public.subscriptions
        SET expires_at = v_expires, updated_at = NOW()
        WHERE id = v_sub.id;
    END IF;

    PERFORM public.log_admin_action(
        p_user_id, 'admin.subscription_extended',
        format('Langganan %s diubah %s hari', v_profil.plan, p_days),
        jsonb_build_object('days', p_days, 'expires_at', v_expires),
        'warning'
    );

    PERFORM public.notify_user(p_user_id, 'subscription.extended', jsonb_build_object(
        'days', p_days, 'expires_at', v_expires, 'plan', v_profil.plan
    ));

    RETURN jsonb_build_object(
        'success', true,
        'plan', v_profil.plan,
        'quota_limit', v_quota,
        'expires_at', v_expires,
        'days_remaining', CEIL(EXTRACT(EPOCH FROM (v_expires - NOW())) / 86400)::INTEGER
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.admin_extend_subscription(UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_extend_subscription(UUID, INTEGER) TO authenticated;


-- ====================================================================
-- BAGIAN 11 — CABUT LANGGANAN (TURUNKAN KE FREE SEKARANG JUGA)
-- ====================================================================

CREATE OR REPLACE FUNCTION public.admin_revoke_subscription(p_user_id UUID)
RETURNS JSONB AS $fn$
DECLARE
    v_jumlah    INTEGER;
    v_plan_lama TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh mencabut langganan'
            USING ERRCODE = '42501';
    END IF;

    SELECT plan INTO v_plan_lama FROM public.profiles WHERE id = p_user_id;
    IF v_plan_lama IS NULL THEN
        RAISE EXCEPTION 'User % tidak ditemukan', p_user_id USING ERRCODE = '22023';
    END IF;

    UPDATE public.subscriptions
    SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
    WHERE user_id = p_user_id AND status = 'active';

    GET DIAGNOSTICS v_jumlah = ROW_COUNT;

    PERFORM set_config('app.profile_guard_bypass', 'on', true);

    UPDATE public.profiles
    SET plan = 'free', quota_limit = 50, updated_at = NOW()
    WHERE id = p_user_id;

    PERFORM set_config('app.profile_guard_bypass', 'off', true);

    PERFORM public.log_admin_action(
        p_user_id, 'admin.subscription_revoked',
        format('Langganan %s dicabut, diturunkan ke Free', v_plan_lama),
        jsonb_build_object('plan_lama', v_plan_lama, 'baris_dibatalkan', v_jumlah),
        'warning'
    );

    PERFORM public.notify_user(p_user_id, 'subscription.revoked', jsonb_build_object(
        'plan_lama', v_plan_lama
    ));

    RETURN jsonb_build_object(
        'success', true, 'plan', 'free',
        'quota_limit', 50, 'cancelled_rows', v_jumlah
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.admin_revoke_subscription(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_revoke_subscription(UUID) TO authenticated;


-- ====================================================================
-- BAGIAN 12 — UBAH ROLE (PROMOTE / DEMOTE)
-- ====================================================================
-- Panel lama hanya punya "Make Admin" satu arah. Dua penjagaan di sini:
--
--   a. Admin tidak boleh menurunkan dirinya sendiri — kalau ia satu-satunya
--      admin, panelnya langsung terkunci dan hanya bisa dipulihkan lewat
--      SQL Editor.
--   b. Admin terakhir tidak boleh diturunkan oleh siapa pun, dengan alasan
--      yang sama.

CREATE OR REPLACE FUNCTION public.admin_set_user_role(
    p_user_id UUID,
    p_role    TEXT
)
RETURNS JSONB AS $fn$
DECLARE
    v_sisa_admin INTEGER;
    v_role_lama  TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh mengubah role'
            USING ERRCODE = '42501';
    END IF;

    -- Mengangkat admin baru = membuat pintu belakang permanen. Aksi ini
    -- menuntut identitas yang baru diverifikasi, bukan sekadar sesi yang
    -- kebetulan masih terbuka.
    PERFORM public.require_fresh_auth(300);

    IF p_role NOT IN ('user', 'admin') THEN
        RAISE EXCEPTION 'Role tidak dikenali: %', p_role USING ERRCODE = '22023';
    END IF;

    SELECT role INTO v_role_lama FROM public.profiles WHERE id = p_user_id;
    IF v_role_lama IS NULL THEN
        RAISE EXCEPTION 'User % tidak ditemukan', p_user_id USING ERRCODE = '22023';
    END IF;

    IF p_role = 'user' AND v_role_lama = 'admin' THEN
        IF p_user_id = auth.uid() THEN
            RAISE EXCEPTION 'Tidak bisa menurunkan role diri sendiri — minta admin lain yang melakukannya'
                USING ERRCODE = '42501';
        END IF;

        SELECT COUNT(*) INTO v_sisa_admin FROM public.profiles WHERE role = 'admin';
        IF v_sisa_admin <= 1 THEN
            RAISE EXCEPTION 'Ini admin terakhir — sistem harus selalu punya minimal satu admin'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    PERFORM set_config('app.profile_guard_bypass', 'on', true);

    UPDATE public.profiles
    SET role = p_role, updated_at = NOW()
    WHERE id = p_user_id;

    PERFORM set_config('app.profile_guard_bypass', 'off', true);

    -- Perubahan hak akses adalah peristiwa paling sensitif di panel ini.
    PERFORM public.log_admin_action(
        p_user_id, 'admin.role_changed',
        format('Role diubah dari %s ke %s', v_role_lama, p_role),
        jsonb_build_object('role_lama', v_role_lama, 'role_baru', p_role),
        'critical'
    );

    RETURN jsonb_build_object('success', true, 'role', p_role);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_role(UUID, TEXT) TO authenticated;


-- ====================================================================
-- BAGIAN 13 — SUSPEND / AKTIFKAN AKUN
-- ====================================================================
-- profiles.is_active sudah ada sejak 01-schema.sql dan sudah ditegakkan
-- lewat has_quota_remaining() pada policy INSERT processing_jobs, tetapi
-- tidak ada satu pun antarmuka yang bisa mengubahnya.

CREATE OR REPLACE FUNCTION public.admin_set_user_active(
    p_user_id UUID,
    p_active  BOOLEAN
)
RETURNS JSONB AS $fn$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh menangguhkan akun'
            USING ERRCODE = '42501';
    END IF;

    IF p_active IS NULL THEN
        RAISE EXCEPTION 'Status aktif tidak boleh NULL' USING ERRCODE = '22023';
    END IF;

    -- Menangguhkan diri sendiri = mengunci diri dari panel.
    IF p_user_id = auth.uid() AND NOT p_active THEN
        RAISE EXCEPTION 'Tidak bisa menangguhkan akun sendiri'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'User % tidak ditemukan', p_user_id USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('app.profile_guard_bypass', 'on', true);

    UPDATE public.profiles
    SET is_active = p_active, updated_at = NOW()
    WHERE id = p_user_id;

    PERFORM set_config('app.profile_guard_bypass', 'off', true);

    PERFORM public.log_admin_action(
        p_user_id,
        CASE WHEN p_active THEN 'admin.account_reactivated' ELSE 'admin.account_suspended' END,
        CASE WHEN p_active THEN 'Akun diaktifkan kembali' ELSE 'Akun ditangguhkan' END,
        jsonb_build_object('is_active', p_active),
        'critical'
    );

    PERFORM public.notify_user(
        p_user_id,
        CASE WHEN p_active THEN 'account.reactivated' ELSE 'account.suspended' END,
        '{}'::jsonb
    );

    RETURN jsonb_build_object('success', true, 'is_active', p_active);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_user_active(UUID, BOOLEAN) TO authenticated;


-- ====================================================================
-- BAGIAN 14 — RESET KUOTA
-- ====================================================================
-- Untuk kasus dukungan: job gagal karena kesalahan sistem tetapi kuotanya
-- terlanjur terpakai.

CREATE OR REPLACE FUNCTION public.admin_reset_quota(p_user_id UUID)
RETURNS JSONB AS $fn$
DECLARE
    v_limit    INTEGER;
    v_terpakai INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh mereset kuota'
            USING ERRCODE = '42501';
    END IF;

    SELECT quota_limit, quota_used INTO v_limit, v_terpakai
    FROM public.profiles WHERE id = p_user_id;

    IF v_limit IS NULL THEN
        RAISE EXCEPTION 'User % tidak ditemukan', p_user_id USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('app.profile_guard_bypass', 'on', true);

    UPDATE public.profiles
    SET quota_used = 0, quota_reset_at = NOW(), updated_at = NOW()
    WHERE id = p_user_id;

    PERFORM set_config('app.profile_guard_bypass', 'off', true);

    PERFORM public.log_admin_action(
        p_user_id, 'admin.quota_reset',
        format('Kuota direset dari %s/%s ke 0', v_terpakai, v_limit),
        jsonb_build_object('quota_sebelum', v_terpakai, 'quota_limit', v_limit)
    );

    PERFORM public.notify_user(p_user_id, 'quota.reset', jsonb_build_object(
        'quota_limit', v_limit
    ));

    RETURN jsonb_build_object('success', true, 'quota_used', 0, 'quota_limit', v_limit);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.admin_reset_quota(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_reset_quota(UUID) TO authenticated;


-- ====================================================================
-- BAGIAN 15 — RESET PERANGKAT TERDAFTAR (dari panel admin)
-- ====================================================================
-- reset_user_devices() sudah ada di 2026-08-29-security-hardening.sql dan
-- sudah mengizinkan admin. Yang kurang hanya jejak auditnya — pembatasan
-- perangkat adalah mekanisme anti-abuse, jadi setiap pelonggaran oleh
-- admin harus tercatat.

CREATE OR REPLACE FUNCTION public.admin_reset_devices(p_user_id UUID)
RETURNS JSONB AS $fn$
DECLARE
    v_dihapus INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh mereset perangkat'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'User % tidak ditemukan', p_user_id USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.device_registrations WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_dihapus = ROW_COUNT;

    PERFORM public.log_admin_action(
        p_user_id, 'admin.devices_reset',
        format('%s perangkat terdaftar dihapus', v_dihapus),
        jsonb_build_object('dihapus', v_dihapus),
        'warning'
    );

    RETURN jsonb_build_object('success', true, 'deleted_count', v_dihapus);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.admin_reset_devices(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_reset_devices(UUID) TO authenticated;


-- ====================================================================
-- BAGIAN 16 — SETUJUI PEMBAYARAN
-- ====================================================================
-- Didefinisikan ulang dari 2026-08-30-approve-payment-atomic.sql dengan
-- tambahan jejak audit + notifikasi. Alasan asli tetap berlaku: seluruh
-- alur harus berada dalam SATU transaksi, supaya tidak ada pembayaran
-- bertanda 'approved' yang penggunanya tidak pernah dinaikkan.

CREATE OR REPLACE FUNCTION public.approve_payment(p_payment_id UUID)
RETURNS JSONB AS $fn$
DECLARE
    v_pay        RECORD;
    v_quota      INTEGER;
    v_days       INTEGER;
    v_expires    TIMESTAMPTZ;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh menyetujui pembayaran'
            USING ERRCODE = '42501';
    END IF;

    -- Menyetujui pembayaran memindahkan nilai uang ke dalam akun.
    PERFORM public.require_fresh_auth(300);

    SELECT * INTO v_pay
    FROM public.payment_confirmations
    WHERE id = p_payment_id;

    IF v_pay IS NULL THEN
        RAISE EXCEPTION 'Pembayaran % tidak ditemukan', p_payment_id
            USING ERRCODE = '22023';
    END IF;

    IF v_pay.status <> 'pending' THEN
        RAISE EXCEPTION 'Pembayaran ini sudah berstatus % — tidak bisa disetujui dua kali', v_pay.status
            USING ERRCODE = '22023';
    END IF;

    -- Kuota mengikuti paket
    v_quota := CASE v_pay.plan
                   WHEN 'basic'      THEN 500
                   WHEN 'pro'        THEN 99999
                   WHEN 'enterprise' THEN 99999
                   ELSE 50
               END;

    -- Masa aktif mengikuti siklus tagihan
    v_days := CASE WHEN v_pay.billing_cycle = 'yearly' THEN 365 ELSE 30 END;
    v_expires := NOW() + (v_days || ' days')::INTERVAL;

    -- 1. Tandai pembayaran disetujui
    UPDATE public.payment_confirmations
    SET status = 'approved', updated_at = NOW()
    WHERE id = p_payment_id;

    -- 2. Hentikan langganan berjalan agar tidak ada dua baris aktif
    UPDATE public.subscriptions
    SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
    WHERE user_id = v_pay.user_id AND status = 'active';

    -- 3. Buat langganan baru
    INSERT INTO public.subscriptions (
        user_id, plan, status, billing_cycle, price_cents, currency,
        started_at, expires_at, payment_provider, provider_subscription_id
    ) VALUES (
        v_pay.user_id, v_pay.plan, 'active', v_pay.billing_cycle,
        v_pay.price_cents, COALESCE(v_pay.currency, 'IDR'),
        NOW(), v_expires, 'manual',
        'manual_' || left(replace(p_payment_id::text, '-', ''), 8)
    );

    -- 4. Naikkan paket penggunanya
    PERFORM set_config('app.profile_guard_bypass', 'on', true);

    UPDATE public.profiles
    SET plan = v_pay.plan, quota_limit = v_quota, quota_used = 0, updated_at = NOW()
    WHERE id = v_pay.user_id;

    PERFORM set_config('app.profile_guard_bypass', 'off', true);

    PERFORM public.log_admin_action(
        v_pay.user_id, 'admin.payment_approved',
        format('Pembayaran Rp %s untuk paket %s disetujui',
               to_char(v_pay.amount_paid, 'FM999G999G999'), v_pay.plan),
        jsonb_build_object(
            'payment_id', p_payment_id, 'plan', v_pay.plan,
            'amount_paid', v_pay.amount_paid, 'expires_at', v_expires
        ),
        'warning'
    );

    PERFORM public.notify_user(v_pay.user_id, 'payment.approved', jsonb_build_object(
        'plan', v_pay.plan, 'quota_limit', v_quota, 'expires_at', v_expires
    ));

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_pay.user_id,
        'plan', v_pay.plan,
        'quota_limit', v_quota,
        'expires_at', v_expires
    );
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.approve_payment(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.approve_payment(UUID) TO authenticated;


-- ====================================================================
-- BAGIAN 17 — TOLAK PEMBAYARAN
-- ====================================================================
-- Sebelumnya penolakan dilakukan sebagai UPDATE langsung dari browser.
-- Dua akibatnya: tidak ada jejak audit, dan alasan penolakan berhenti di
-- kolom admin_notes tanpa pernah sampai ke penggunanya.

CREATE OR REPLACE FUNCTION public.admin_reject_payment(
    p_payment_id UUID,
    p_notes      TEXT DEFAULT NULL
)
RETURNS JSONB AS $fn$
DECLARE
    v_pay    RECORD;
    v_alasan TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Hanya admin yang boleh menolak pembayaran'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_pay FROM public.payment_confirmations WHERE id = p_payment_id;

    IF v_pay IS NULL THEN
        RAISE EXCEPTION 'Pembayaran % tidak ditemukan', p_payment_id
            USING ERRCODE = '22023';
    END IF;

    IF v_pay.status <> 'pending' THEN
        RAISE EXCEPTION 'Pembayaran ini sudah berstatus % — tidak bisa ditolak lagi', v_pay.status
            USING ERRCODE = '22023';
    END IF;

    v_alasan := COALESCE(NULLIF(TRIM(p_notes), ''),
                         'Pembayaran tidak valid atau dana tidak masuk.');

    UPDATE public.payment_confirmations
    SET status = 'rejected', admin_notes = v_alasan, updated_at = NOW()
    WHERE id = p_payment_id;

    PERFORM public.log_admin_action(
        v_pay.user_id, 'admin.payment_rejected',
        format('Pembayaran Rp %s untuk paket %s ditolak',
               to_char(v_pay.amount_paid, 'FM999G999G999'), v_pay.plan),
        jsonb_build_object(
            'payment_id', p_payment_id, 'plan', v_pay.plan,
            'amount_paid', v_pay.amount_paid, 'alasan', v_alasan
        ),
        'warning'
    );

    PERFORM public.notify_user(v_pay.user_id, 'payment.rejected', jsonb_build_object(
        'plan', v_pay.plan, 'alasan', v_alasan
    ));

    RETURN jsonb_build_object('success', true, 'status', 'rejected', 'alasan', v_alasan);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.admin_reject_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_reject_payment(UUID, TEXT) TO authenticated;


-- ====================================================================
-- VERIFIKASI — statement terakhir, hasilnya yang tampil
-- ====================================================================
SELECT
    p.proname AS fungsi,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'invoker' END AS mode,
    pg_get_function_identity_arguments(p.oid) AS argumen
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'is_admin', 'log_admin_action', 'notify_user',
      'auth_age_seconds', 'my_auth_age', 'require_fresh_auth',
      'has_mfa_enrolled', 'my_security_status',
      'admin_log_step_up_failure', 'admin_log_mfa_change',
      'get_admin_stats', 'get_admin_users', 'get_admin_user_detail',
      'get_admin_audit_logs', 'admin_set_user_plan',
      'admin_extend_subscription', 'admin_revoke_subscription',
      'admin_set_user_role', 'admin_set_user_active', 'admin_reset_quota',
      'admin_reset_devices', 'approve_payment', 'admin_reject_payment'
  )
ORDER BY p.proname;

-- Harus muncul 23 baris, semuanya SECURITY DEFINER.
--
-- ====================================================================
-- SETELAH MIGRASI — PASTIKAN KLAIM amr MEMANG ADA
-- ====================================================================
-- Penjagaan step-up bergantung pada klaim `amr` di JWT. SQL Editor
-- berjalan tanpa JWT, jadi pemeriksaannya TIDAK bisa dilakukan di sini —
-- harus dari aplikasi, sebagai admin yang sedang login.
--
-- Buka panel /admin, lalu di Console browser jalankan:
--
--   const { getSupabaseClient } = await import('/_next/static/chunks/...')
--
-- Cara yang lebih mudah: panel admin sudah menampilkannya sendiri di
-- dialog verifikasi. Kalau 'amr_tersedia' bernilai false, tombol
-- "Jadikan admin" dan "Approve" akan selalu menolak — dalam hal itu
-- naikkan p_max_age atau lepas PERFORM require_fresh_auth() dari kedua
-- fungsi sampai penyebabnya ditemukan.
