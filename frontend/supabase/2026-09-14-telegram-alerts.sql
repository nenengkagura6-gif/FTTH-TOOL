-- ====================================================================
-- PEMBERITAHUAN TELEGRAM — 2026-09-14
-- Jalankan SETELAH 2026-09-14-admin-panel-upgrade.sql
-- Idempotent: aman dijalankan berulang kali.
--
-- Tujuan: admin tahu dalam hitungan detik, di HP, ketika ada yang
-- mengirim konfirmasi pembayaran — tanpa harus membuka panel.
--
-- Kenapa Telegram, bukan Web Push:
--
--   Web push butuh service worker, sepasang kunci VAPID, dan sebuah
--   server yang menyimpan kunci privatnya. Di iPhone ia hanya bekerja
--   kalau situsnya dipasang sebagai PWA lewat "Add to Home Screen" —
--   di Safari biasa tidak akan pernah muncul, dan proyek ini belum punya
--   manifest PWA sama sekali. Backend FastAPI-nya pun ada di Hugging Face
--   Space yang tidur saat idle, jadi justru tidak bisa diandalkan sebagai
--   pengirim.
--
--   Pengirim di sini adalah DATABASE, lewat pg_net. Ia tidak pernah
--   tidur, tidak peduli sistem operasi HP, dan tidak menambah satu baris
--   pun di frontend.
--
-- ====================================================================
-- LANGKAH PERSIAPAN (lakukan sebelum menjalankan berkas ini)
-- ====================================================================
--
--   1. Buat bot: chat @BotFather di Telegram -> /newbot -> ikuti langkah.
--      Salin token yang diberikan, bentuknya "123456789:AAE...".
--
--   2. Ambil chat id: kirim satu pesan apa saja ke bot Anda, lalu buka
--      https://api.telegram.org/bot<TOKEN>/getUpdates di browser.
--      Cari "chat":{"id":123456789 — angka itulah chat id-nya.
--      Untuk grup, tambahkan bot ke grup lalu ulangi; id grup diawali -.
--
--   3. Jalankan berkas ini.
--
--   4. Isi kredensialnya (JANGAN ditulis di berkas ini — berkas ini masuk
--      git). Jalankan terpisah di SQL Editor:
--
--        SELECT public.set_integration_setting('telegram_bot_token', 'ISI_TOKEN');
--        SELECT public.set_integration_setting('telegram_chat_id',   'ISI_CHAT_ID');
--
--   5. Uji:
--
--        SELECT public.send_telegram_message('Uji coba dari database.');
-- ====================================================================


-- ====================================================================
-- BAGIAN 1 — EKSTENSI pg_net
-- ====================================================================
-- pg_net mengirim HTTP secara ASINKRON: ia hanya menitipkan permintaan ke
-- antrean lalu kembali seketika. Itu penting — pengiriman notifikasi
-- tidak boleh menahan, apalagi menggagalkan, transaksi pembayaran.
--
-- Kalau baris ini gagal, nyalakan dulu lewat
-- Dashboard > Database > Extensions > pg_net, lalu jalankan ulang.

CREATE EXTENSION IF NOT EXISTS pg_net;


-- ====================================================================
-- BAGIAN 2 — PENYIMPANAN KREDENSIAL
-- ====================================================================
-- Tabel ini TIDAK punya satu pun policy RLS, dan seluruh hak dicabut dari
-- anon maupun authenticated. Artinya: tidak ada jalan membacanya dari
-- browser sama sekali. Yang bisa menyentuhnya hanya service_role dan
-- fungsi SECURITY DEFINER di bawah.
--
-- Catatan kejujuran: ini bukan setara brankas. Siapa pun yang memegang
-- service key atau akses langsung ke database bisa membaca tokennya.
-- Untuk token bot yang kemampuannya hanya mengirim pesan ke satu chat,
-- risiko itu wajar. Kalau ingin lebih ketat, pindahkan ke Supabase Vault.

CREATE TABLE IF NOT EXISTS public.integration_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_settings FROM PUBLIC, anon, authenticated;


CREATE OR REPLACE FUNCTION public.set_integration_setting(p_key TEXT, p_value TEXT)
RETURNS TEXT AS $fn$
BEGIN
    INSERT INTO public.integration_settings (key, value, updated_at)
    VALUES (p_key, p_value, NOW())
    ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = NOW();

    -- Nilainya sengaja tidak dikembalikan, supaya token tidak ikut
    -- tersimpan di riwayat hasil query SQL Editor.
    RETURN format('%s tersimpan (%s karakter)', p_key, length(p_value));
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.set_integration_setting(TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;


-- ====================================================================
-- BAGIAN 3 — PENGIRIM PESAN
-- ====================================================================

CREATE OR REPLACE FUNCTION public.send_telegram_message(p_text TEXT)
RETURNS BIGINT AS $fn$
DECLARE
    v_token TEXT;
    v_chat  TEXT;
    v_req   BIGINT;
BEGIN
    SELECT value INTO v_token FROM public.integration_settings
     WHERE key = 'telegram_bot_token';
    SELECT value INTO v_chat  FROM public.integration_settings
     WHERE key = 'telegram_chat_id';

    -- Belum dikonfigurasi: diam, jangan meledak. Berkas ini bisa saja
    -- dijalankan lebih dulu sebelum tokennya diisi.
    IF v_token IS NULL OR v_chat IS NULL THEN
        RAISE NOTICE 'Telegram belum dikonfigurasi — pesan dilewati';
        RETURN NULL;
    END IF;

    SELECT net.http_post(
        url     := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
        body    := jsonb_build_object(
                       'chat_id', v_chat,
                       'text', p_text,
                       'parse_mode', 'HTML',
                       'disable_web_page_preview', true
                   ),
        headers := '{"Content-Type": "application/json"}'::jsonb
    ) INTO v_req;

    RETURN v_req;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, net, pg_temp;

REVOKE EXECUTE ON FUNCTION public.send_telegram_message(TEXT)
    FROM PUBLIC, anon, authenticated;


-- ====================================================================
-- BAGIAN 4 — PEMBERITAHUAN: KONFIRMASI PEMBAYARAN BARU
-- ====================================================================
-- Inilah yang diminta: tahu begitu ada yang berlangganan.
--
-- Seluruh pengiriman dibungkus EXCEPTION. Kegagalan mengabari TIDAK BOLEH
-- menggagalkan pembayarannya — kalau Telegram sedang down atau tokennya
-- salah, user tetap harus bisa mengirim konfirmasi.

CREATE OR REPLACE FUNCTION public.tg_on_new_payment()
RETURNS TRIGGER AS $fn$
DECLARE
    v_email TEXT;
    v_nama  TEXT;
BEGIN
    BEGIN
        SELECT email, full_name INTO v_email, v_nama
        FROM public.profiles WHERE id = NEW.user_id;

        PERFORM public.send_telegram_message(
            '<b>Konfirmasi pembayaran baru</b>' || E'\n\n' ||
            'Paket   : <b>' || upper(NEW.plan) || '</b>' || E'\n' ||
            'Nominal : Rp ' || to_char(NEW.amount_paid, 'FM999G999G999') || E'\n' ||
            'Pengirim: ' || COALESCE(NEW.sender_name, '-') ||
                ' (' || upper(COALESCE(NEW.sender_bank, '-')) || ')' || E'\n' ||
            'Akun    : ' || COALESCE(v_nama, '-') || ' — ' || COALESCE(v_email, '-') || E'\n\n' ||
            'Menunggu verifikasi di panel admin.'
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Notifikasi Telegram gagal: %', SQLERRM;
    END;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS tr_tg_on_new_payment ON public.payment_confirmations;
CREATE TRIGGER tr_tg_on_new_payment
    AFTER INSERT ON public.payment_confirmations
    FOR EACH ROW
    WHEN (NEW.status = 'pending')
    EXECUTE FUNCTION public.tg_on_new_payment();


-- ====================================================================
-- BAGIAN 5 — PEMBERITAHUAN: TINDAKAN ADMIN BERBAHAYA
-- ====================================================================
-- Ini lapisan DETEKSI, bukan pencegahan, dan justru karena itu ia penting.
--
-- Tidak ada penjagaan yang menutup semua celah. Yang bisa dilakukan
-- adalah memastikan Anda TAHU dalam hitungan detik kalau ada akun yang
-- diangkat jadi admin atau ditangguhkan — sehingga penyerang tidak punya
-- waktu tenang untuk memasang pintu belakang.
--
-- Hanya severity 'critical' yang dikirim, yaitu admin.role_changed,
-- admin.account_suspended, dan admin.account_reactivated. Sisanya cukup
-- dibaca di tab Riwayat Aksi.

CREATE OR REPLACE FUNCTION public.tg_on_critical_audit()
RETURNS TRIGGER AS $fn$
DECLARE
    v_aktor   TEXT;
    v_sasaran TEXT;
BEGIN
    BEGIN
        SELECT email INTO v_aktor   FROM public.profiles WHERE id = NEW.actor_id;
        SELECT email INTO v_sasaran FROM public.profiles WHERE id = NEW.user_id;

        PERFORM public.send_telegram_message(
            '⚠️ <b>Tindakan admin sensitif</b>' || E'\n\n' ||
            'Jenis     : <b>' || NEW.event_type || '</b>' || E'\n' ||
            'Keterangan: ' || COALESCE(NEW.description, '-') || E'\n' ||
            'Oleh      : ' || COALESCE(v_aktor, 'sistem') || E'\n' ||
            'Terhadap  : ' || COALESCE(v_sasaran, '-') || E'\n\n' ||
            'Kalau ini bukan Anda, segera cabut sesi admin di Supabase.'
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Notifikasi Telegram gagal: %', SQLERRM;
    END;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS tr_tg_on_critical_audit ON public.audit_logs;
CREATE TRIGGER tr_tg_on_critical_audit
    AFTER INSERT ON public.audit_logs
    FOR EACH ROW
    WHEN (NEW.severity = 'critical')
    EXECUTE FUNCTION public.tg_on_critical_audit();


-- ====================================================================
-- VERIFIKASI
-- ====================================================================
SELECT
    t.tgname AS trigger_name,
    c.relname AS pada_tabel,
    CASE WHEN t.tgenabled = 'D' THEN 'NONAKTIF' ELSE 'aktif' END AS status
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal
  AND t.tgname IN ('tr_tg_on_new_payment', 'tr_tg_on_critical_audit')
ORDER BY t.tgname;

-- Harus muncul 2 baris, keduanya aktif.
--
-- Setelah mengisi token (langkah 4 di atas), uji dengan:
--   SELECT public.send_telegram_message('Uji coba dari database.');
--
-- Kalau pesannya tidak sampai, periksa antrean pg_net:
--   SELECT status_code, error_msg, created
--   FROM net._http_response ORDER BY created DESC LIMIT 5;
