// ==================================================
// Notifikasi pengguna — perangkai teks
// ==================================================
//
// Tabel `notifications` sengaja TIDAK menyimpan kalimat jadi. Yang
// disimpan hanya `kind` + `payload`, lalu berkas ini merangkainya sesuai
// bahasa yang sedang aktif. Kalau teksnya ikut disimpan, notifikasi lama
// akan terkunci pada bahasa saat ia dibuat — pengguna yang berganti ke
// Inggris tetap melihat notifikasi lamanya dalam bahasa Indonesia.
//
// Notifikasi hanya dibuat oleh fungsi SECURITY DEFINER di
// supabase/2026-09-14-admin-panel-upgrade.sql.

export type NotificationLocale = "en" | "id"

export type NotificationRow = {
    id: string
    kind: string
    payload: Record<string, unknown> | null
    read_at: string | null
    created_at: string
}

export type RenderedNotification = {
    title: string
    body: string
    /** Menentukan warna aksen di lonceng. */
    tone: "info" | "success" | "warning" | "danger"
}

const fmtRp = (v: unknown) => `Rp ${Number(v || 0).toLocaleString("id-ID")}`

const fmtDate = (v: unknown, locale: NotificationLocale) => {
    if (!v) return "—"
    const d = new Date(String(v))
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
    })
}

const fmtQuota = (v: unknown) => {
    const n = Number(v || 0)
    return n >= 99999 ? "∞" : String(n)
}

const planLabel = (v: unknown) => String(v || "free").toUpperCase()

/**
 * Ubah satu baris notifikasi menjadi teks siap tampil.
 *
 * `kind` yang tidak dikenali tidak dibuang — ia tetap ditampilkan apa
 * adanya. Notifikasi yang hilang diam-diam lebih buruk daripada
 * notifikasi yang tampil kurang rapi.
 */
export function renderNotification(
    row: NotificationRow,
    locale: NotificationLocale
): RenderedNotification {
    const p = (row.payload || {}) as Record<string, unknown>
    const id = locale === "id"

    switch (row.kind) {
        case "payment.approved":
            return {
                tone: "success",
                title: id ? "Pembayaran disetujui" : "Payment approved",
                body: id
                    ? `Paket ${planLabel(p.plan)} sudah aktif. Kuota ${fmtQuota(p.quota_limit)} per bulan, berlaku sampai ${fmtDate(p.expires_at, locale)}.`
                    : `Your ${planLabel(p.plan)} plan is now active. Quota ${fmtQuota(p.quota_limit)} per month, valid until ${fmtDate(p.expires_at, locale)}.`,
            }

        case "payment.rejected":
            return {
                tone: "danger",
                title: id ? "Pembayaran ditolak" : "Payment rejected",
                body: id
                    ? `Konfirmasi pembayaran paket ${planLabel(p.plan)} tidak dapat kami verifikasi. Alasan: ${p.alasan || "-"}`
                    : `We could not verify your ${planLabel(p.plan)} payment. Reason: ${p.alasan || "-"}`,
            }

        case "plan.changed":
            return {
                tone: "info",
                title: id ? "Paket akun berubah" : "Plan changed",
                body: id
                    ? `Akun Anda kini berpaket ${planLabel(p.plan)} dengan kuota ${fmtQuota(p.quota_limit)}${p.expires_at ? `, berlaku sampai ${fmtDate(p.expires_at, locale)}` : ""}.`
                    : `Your account is now on the ${planLabel(p.plan)} plan with a quota of ${fmtQuota(p.quota_limit)}${p.expires_at ? `, valid until ${fmtDate(p.expires_at, locale)}` : ""}.`,
            }

        case "subscription.extended": {
            const hari = Number(p.days || 0)
            const diperpanjang = hari >= 0
            return {
                tone: diperpanjang ? "success" : "warning",
                title: id
                    ? diperpanjang
                        ? "Langganan diperpanjang"
                        : "Masa langganan dipotong"
                    : diperpanjang
                      ? "Subscription extended"
                      : "Subscription shortened",
                body: id
                    ? `Masa aktif paket ${planLabel(p.plan)} ${diperpanjang ? "bertambah" : "berkurang"} ${Math.abs(hari)} hari, kini berakhir ${fmtDate(p.expires_at, locale)}.`
                    : `Your ${planLabel(p.plan)} plan ${diperpanjang ? "gained" : "lost"} ${Math.abs(hari)} days and now ends on ${fmtDate(p.expires_at, locale)}.`,
            }
        }

        case "subscription.revoked":
            return {
                tone: "warning",
                title: id ? "Langganan dihentikan" : "Subscription revoked",
                body: id
                    ? `Paket ${planLabel(p.plan_lama)} dihentikan dan akun Anda kembali ke Free. Hubungi kami kalau ini di luar dugaan.`
                    : `Your ${planLabel(p.plan_lama)} plan was stopped and your account is back on Free. Contact us if this was unexpected.`,
            }

        case "account.suspended":
            return {
                tone: "danger",
                title: id ? "Akun ditangguhkan" : "Account suspended",
                body: id
                    ? "Akses ke seluruh tool dihentikan sementara. Hubungi dukungan untuk penjelasan."
                    : "Access to all tools is temporarily disabled. Contact support for details.",
            }

        case "account.reactivated":
            return {
                tone: "success",
                title: id ? "Akun aktif kembali" : "Account reactivated",
                body: id
                    ? "Penangguhan sudah dicabut. Anda bisa memakai seluruh tool seperti biasa."
                    : "The suspension has been lifted. You can use all tools as usual.",
            }

        case "quota.reset":
            return {
                tone: "success",
                title: id ? "Kuota direset" : "Quota reset",
                body: id
                    ? `Pemakaian kuota Anda dikembalikan ke nol dari batas ${fmtQuota(p.quota_limit)}.`
                    : `Your quota usage was reset to zero out of ${fmtQuota(p.quota_limit)}.`,
            }

        default:
            return {
                tone: "info",
                title: row.kind,
                body: id ? "Pemberitahuan sistem." : "System notification.",
            }
    }
}

/** "5 menit lalu" / "5m ago" — tanpa dependensi tambahan. */
export function formatRelativeTime(iso: string, locale: NotificationLocale): string {
    const id = locale === "id"
    const detik = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))

    if (detik < 60) return id ? "baru saja" : "just now"

    const menit = Math.floor(detik / 60)
    if (menit < 60) return id ? `${menit} menit lalu` : `${menit}m ago`

    const jam = Math.floor(menit / 60)
    if (jam < 24) return id ? `${jam} jam lalu` : `${jam}h ago`

    const hari = Math.floor(jam / 24)
    if (hari < 30) return id ? `${hari} hari lalu` : `${hari}d ago`

    return new Date(iso).toLocaleDateString(id ? "id-ID" : "en-US", {
        day: "numeric",
        month: "short",
    })
}

export { fmtRp }
