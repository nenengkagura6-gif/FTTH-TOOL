"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  Shield, Users, Briefcase, DollarSign, Activity,
  Search, Crown, ChevronLeft, ChevronRight, CalendarClock,
  AlertTriangle, Settings2, RefreshCw, ScrollText, Smartphone, KeyRound, ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/auth/auth-provider"
import { useRouter } from "next/navigation"

type PlanKey = "free" | "basic" | "pro" | "enterprise"

type AdminUser = {
  id: string
  email: string
  full_name: string | null
  plan: PlanKey
  role: "user" | "admin"
  quota_used: number
  quota_limit: number
  is_active: boolean
  created_at: string
  last_login_at: string | null
  sub_status: string | null
  sub_billing_cycle: string | null
  sub_started_at: string | null
  sub_expires_at: string | null
  days_remaining: number | null
  device_count: number
  total_count: number
}

type AuditLog = {
  id: string
  event_type: string
  description: string | null
  severity: "info" | "warning" | "error" | "critical"
  metadata: Record<string, unknown> | null
  created_at: string
  actor_id: string | null
  actor_email: string | null
  target_id: string | null
  target_email: string | null
  total_count: number
}

type UserJob = {
  id: string
  tool_name: string
  status: string
  original_filename: string | null
  error_message: string | null
  error_code: string | null
  processing_time_ms: number | null
  created_at: string
}

type UserPayment = {
  id: string
  plan: string
  amount_paid: number
  status: string
  sender_name: string | null
  admin_notes: string | null
  created_at: string
}

type UserDetail = {
  jobs: UserJob[]
  payments: UserPayment[]
  jobStats: Record<string, number>
}

/**
 * Aksi yang ditahan karena database meminta verifikasi ulang identitas.
 * Disimpan utuh supaya bisa diulang persis setelah verifikasi berhasil —
 * admin tidak perlu mengklik ulang dari awal.
 */
type PendingAction = {
  label: string
  fn: (supabase: any) => Promise<any>
  /** password = sesi terlalu lama; totp = akun ini punya faktor kedua. */
  mode: "password" | "totp"
}

type SecurityStatus = {
  /** null = status MFA tidak bisa dibaca dari skema auth (bukan "belum aktif"). */
  mfa_enrolled: boolean | null
  aal: string
  auth_age_seconds: number | null
  amr_tersedia: boolean
}

type AdminStats = {
  overview: {
    totalUsers: number
    activeUsers: number
    suspendedUsers: number
    totalJobs: number
    todayJobs: number
    failedJobs24h: number
    activeSubscriptions: number
    expiringSoon: number
    overdueSubscriptions: number
    pendingPayments: number
    monthlyRevenueIdr: number
  }
  usersByPlan: Record<string, number>
  jobsByStatus: Record<string, number>
}

const planBadge: Record<string, string> = {
  free: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  basic: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  pro: "bg-warning/10 text-warning border-warning/20",
  enterprise: "bg-violet-500/10 text-violet-400 border-violet-500/20",
}

const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "free", label: "Free" },
  { key: "basic", label: "Basic" },
  { key: "pro", label: "Pro" },
  { key: "enterprise", label: "Enterprise" },
  { key: "expiring", label: "Segera habis" },
  { key: "expired", label: "Kedaluwarsa" },
  { key: "suspended", label: "Ditangguhkan" },
  { key: "admin", label: "Admin" },
] as const

const PAGE_SIZE = 15
const AUDIT_PAGE_SIZE = 25

/** Label + warna untuk tiap jenis tindakan admin di tab Riwayat Aksi. */
const AUDIT_META: Record<string, { label: string; cls: string }> = {
  "admin.plan_changed": { label: "Paket diubah", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  "admin.subscription_extended": { label: "Langganan diperpanjang", cls: "bg-success/10 text-success border-success/20" },
  "admin.subscription_revoked": { label: "Langganan dicabut", cls: "bg-warning/10 text-warning border-warning/20" },
  "admin.role_changed": { label: "Role diubah", cls: "bg-danger/10 text-danger border-danger/20" },
  "admin.account_suspended": { label: "Akun ditangguhkan", cls: "bg-danger/10 text-danger border-danger/20" },
  "admin.account_reactivated": { label: "Akun diaktifkan", cls: "bg-success/10 text-success border-success/20" },
  "admin.quota_reset": { label: "Kuota direset", cls: "bg-surface-2 text-muted-foreground border-border" },
  "admin.payment_approved": { label: "Pembayaran disetujui", cls: "bg-success/10 text-success border-success/20" },
  "admin.payment_rejected": { label: "Pembayaran ditolak", cls: "bg-danger/10 text-danger border-danger/20" },
  "admin.devices_reset": { label: "Perangkat direset", cls: "bg-warning/10 text-warning border-warning/20" },
  "admin.step_up_failed": { label: "Verifikasi gagal", cls: "bg-danger/10 text-danger border-danger/20" },
  "admin.mfa_enrolled": { label: "2FA diaktifkan", cls: "bg-success/10 text-success border-success/20" },
  "admin.mfa_unenrolled": { label: "2FA dicabut", cls: "bg-danger/10 text-danger border-danger/20" },
}

const fmtRp = (n: number) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "—"

/**
 * Ubah nilai `totp.qr_code` dari Supabase menjadi src <img> yang sah.
 *
 * Nilainya adalah SVG MENTAH ("<svg ...>"), bukan data URI — dokumentasi
 * tipenya menyebut sendiri bahwa pemakainya harus menambahkan prefiks
 * "data:image/svg+xml;utf-8,". Memasukkannya langsung ke src menghasilkan
 * gambar rusak, dan itulah penyebab QR tidak bisa dipindai.
 *
 * Prefiks polos pun tidak cukup: SVG-nya memuat warna seperti "#000000",
 * dan '#' di dalam data URI dibaca sebagai penanda fragment sehingga
 * sisanya terpotong. Karena itu isinya di-encode, bukan sekadar ditempel.
 */
function qrSrc(raw: string): string {
  if (!raw) return ""

  let svg = raw.trim()

  // Kalau GoTrue suatu saat berubah dan sudah mengirim data URI, ambil
  // kembali isinya supaya bisa di-encode ulang dengan benar.
  if (svg.startsWith("data:")) {
    const koma = svg.indexOf(",")
    if (koma === -1) return raw
    const isi = svg.slice(koma + 1)
    try {
      svg = decodeURIComponent(isi)
    } catch {
      svg = isi
    }
  }

  if (!svg.startsWith("<svg")) return raw
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"

/** Ringkasan masa berlaku langganan untuk satu baris tabel. */
function expiryInfo(u: AdminUser): { text: string; sub: string; cls: string } {
  if (u.plan === "free") return { text: "—", sub: "Paket Free", cls: "text-muted-foreground/60" }
  if (!u.sub_expires_at) {
    // Paket berbayar tanpa baris langganan: tidak ada tanggal berakhir sama
    // sekali, jadi akun ini praktis berlaku selamanya. Perlu ditandai.
    return { text: "Tanpa batas", sub: "Tidak ada langganan", cls: "text-danger" }
  }
  const d = u.days_remaining ?? 0
  if (d <= 0) return { text: "Kedaluwarsa", sub: fmtDate(u.sub_expires_at), cls: "text-danger" }
  if (d <= 7) return { text: `${d} hari lagi`, sub: fmtDate(u.sub_expires_at), cls: "text-warning" }
  return { text: `${d} hari lagi`, sub: fmtDate(u.sub_expires_at), cls: "text-muted-foreground" }
}

export default function AdminPage() {
  const { profile, isLoading } = useAuth()
  const router = useRouter()

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filter, setFilter] = useState<string>("all")
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [triggerRefresh, setTriggerRefresh] = useState(0)

  // Payments
  const [activeTab, setActiveTab] = useState<"users" | "payments" | "audit">("users")

  // Jejak audit
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditPage, setAuditPage] = useState(1)
  const [auditSearch, setAuditSearch] = useState("")
  const [auditSearchDebounced, setAuditSearchDebounced] = useState("")
  const [loadingAudit, setLoadingAudit] = useState(false)

  // Detail user di modal Kelola
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Verifikasi ulang identitas (step-up) untuk aksi istimewa
  const [stepUp, setStepUp] = useState<PendingAction | null>(null)
  const [stepUpPassword, setStepUpPassword] = useState("")
  const [stepUpBusy, setStepUpBusy] = useState(false)
  const [stepUpError, setStepUpError] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState("")
  const [security, setSecurity] = useState<SecurityStatus | null>(null)

  // Pendaftaran TOTP
  const [enroll, setEnroll] = useState<{
    factorId: string
    qr: string
    secret: string
    /** otpauth://… — bisa diketuk langsung kalau panel dibuka dari HP. */
    uri: string
  } | null>(null)
  const [enrollCode, setEnrollCode] = useState("")
  const [enrollBusy, setEnrollBusy] = useState(false)
  const [enrollError, setEnrollError] = useState<string | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null)
  const [loadingReceipt, setLoadingReceipt] = useState(false)
  const [rejectingPayment, setRejectingPayment] = useState<any | null>(null)
  const [rejectNotes, setRejectNotes] = useState("")

  // Panel kelola user
  const [managing, setManaging] = useState<AdminUser | null>(null)
  const [extendDays, setExtendDays] = useState(30)

  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE))

  // Pencarian ditunda 300 ms. Tanpa ini setiap ketikan memicu satu RPC.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Redirect non-admin
  useEffect(() => {
    if (!isLoading && profile?.role !== "admin") router.push("/dashboard")
  }, [isLoading, profile, router])

  /**
   * Pembungkus aksi admin: satu tempat untuk status sibuk, notifikasi,
   * dan muat ulang. Setiap aksi di panel ini adalah RPC SECURITY DEFINER
   * yang melempar exception saat ditolak — pesannya ditampilkan apa adanya
   * karena sudah ditulis dalam bahasa manusia di sisi database.
   */
  const runAction = useCallback(
    async (label: string, fn: (supabase: any) => Promise<any>) => {
      setBusy(true)
      try {
        const { getSupabaseClient } = await import("@/lib/supabase/client")
        const { data, error } = await fn(getSupabaseClient())
        if (error) throw error
        toast.success(label)
        setTriggerRefresh((t) => t + 1)
        return data
      } catch (err: any) {
        const pesan: string = err?.message || "unknown error"

        // Database menuntut identitas yang baru diverifikasi. Aksinya
        // ditahan, bukan dibuang — setelah verifikasi ia diulang persis.
        // Dua bentuk tuntutan: sesi kedaluwarsa (password) dan faktor
        // kedua belum dipenuhi (TOTP).
        if (pesan.includes("STEP_UP_MFA_REQUIRED")) {
          setStepUp({ label, fn, mode: "totp" })
          setTotpCode("")
          setStepUpError(null)
          return null
        }

        if (pesan.includes("STEP_UP_REQUIRED")) {
          setStepUp({ label, fn, mode: "password" })
          setStepUpPassword("")
          setStepUpError(null)
          return null
        }

        console.error(`${label} gagal:`, err)
        toast.error(`${label} gagal`, { description: pesan })
        return null
      } finally {
        setBusy(false)
      }
    },
    []
  )

  /**
   * Verifikasi ulang lewat password, lalu ulangi aksi yang tertahan.
   *
   * signInWithPassword menerbitkan JWT baru dengan klaim `amr` yang segar.
   * Itulah yang dibaca require_fresh_auth() di database — bukan sesuatu
   * yang dikirim panel ini, sehingga tidak bisa dipalsukan dari browser.
   */
  /** Catat kegagalan verifikasi. Sengaja tidak pernah melempar. */
  const logStepUpFailure = useCallback(async (alasan: string) => {
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client")
      await getSupabaseClient().rpc("admin_log_step_up_failure", { p_alasan: alasan })
    } catch (err) {
      console.error("Gagal mencatat percobaan verifikasi:", err)
    }
  }, [])

  const handleStepUpSubmit = async () => {
    if (!stepUp || !profile?.email) return
    setStepUpBusy(true)
    setStepUpError(null)

    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client")
      const supabase = getSupabaseClient()

      const { error } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: stepUpPassword,
      })

      if (error) {
        await logStepUpFailure("password_salah")
        // Akun yang mendaftar lewat Google tidak punya password sama
        // sekali — pesannya sama persis dengan password salah, jadi
        // keduanya perlu disebut.
        setStepUpError(
          error.message?.toLowerCase().includes("invalid login credentials")
            ? "Password salah. Kalau akun ini masuk lewat Google, pakai tombol verifikasi Google di bawah."
            : error.message || "Verifikasi gagal"
        )
        return
      }

      // Kalau akun ini punya TOTP, sesinya masih aal1 di titik ini —
      // runAction akan ditolak lagi dan dialognya berpindah sendiri ke
      // mode kode. Berantai, bukan buntu.
      const tertahan = stepUp
      setStepUp(null)
      setStepUpPassword("")
      await runAction(tertahan.label, tertahan.fn)
    } catch (err: any) {
      setStepUpError(err?.message || "Verifikasi gagal")
    } finally {
      setStepUpBusy(false)
    }
  }

  /** Penuhi faktor kedua: kode TOTP menaikkan sesi ke aal2. */
  const handleTotpSubmit = async () => {
    if (!stepUp) return
    setStepUpBusy(true)
    setStepUpError(null)

    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client")
      const supabase = getSupabaseClient()

      const { data: faktor, error: errDaftar } = await supabase.auth.mfa.listFactors()
      if (errDaftar) throw errDaftar

      const totp = faktor?.totp?.[0]
      if (!totp) throw new Error("Tidak ada faktor TOTP terdaftar pada akun ini.")

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: totp.id,
        code: totpCode.trim(),
      })

      if (error) {
        await logStepUpFailure("totp_salah")
        setStepUpError("Kode tidak cocok. Pastikan jam di HP Anda tepat.")
        return
      }

      const tertahan = stepUp
      setStepUp(null)
      setTotpCode("")
      await runAction(tertahan.label, tertahan.fn)
    } catch (err: any) {
      setStepUpError(err?.message || "Verifikasi gagal")
    } finally {
      setStepUpBusy(false)
    }
  }

  /**
   * Jalur untuk akun Google. OAuth memindahkan halaman, jadi aksi yang
   * tertahan TIDAK bisa diulang otomatis — admin kembali ke /admin dengan
   * sesi segar lalu mengklik ulang. Itu diberitahukan di dialognya.
   */
  const handleStepUpGoogle = async () => {
    setStepUpBusy(true)
    setStepUpError(null)
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client")
      const { error } = await getSupabaseClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/admin`,
          queryParams: { prompt: "consent" },
        },
      })
      if (error) throw error
    } catch (err: any) {
      setStepUpError(err?.message || "Verifikasi Google gagal")
      setStepUpBusy(false)
    }
  }

  const fetchPayments = useCallback(async () => {
    setLoadingPayments(true)
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client")
      const { data, error } = await getSupabaseClient().rpc("get_admin_payments")
      if (error) throw error
      setPayments(
        (data || []).map((item: any) => ({
          ...item,
          profiles: { email: item.email, full_name: item.full_name },
        }))
      )
    } catch (err: any) {
      console.error("Error fetching payments:", err)
      toast.error("Gagal memuat pembayaran", { description: err?.message })
    } finally {
      setLoadingPayments(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      setAuditSearchDebounced(auditSearch)
      setAuditPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [auditSearch])

  const fetchAuditLogs = useCallback(async () => {
    setLoadingAudit(true)
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client")
      const { data, error } = await getSupabaseClient().rpc("get_admin_audit_logs", {
        p_search: auditSearchDebounced || null,
        p_limit: AUDIT_PAGE_SIZE,
        p_offset: (auditPage - 1) * AUDIT_PAGE_SIZE,
      })
      if (error) throw error
      const rows = (data || []) as unknown as AuditLog[]
      setAuditLogs(rows)
      setAuditTotal(rows.length > 0 ? Number(rows[0].total_count) : 0)
    } catch (err: any) {
      console.error("Gagal memuat jejak audit:", err)
      toast.error("Gagal memuat jejak audit", { description: err?.message })
    } finally {
      setLoadingAudit(false)
    }
  }, [auditSearchDebounced, auditPage])

  useEffect(() => {
    if (profile?.role !== "admin" || activeTab !== "audit") return
    fetchAuditLogs()
  }, [profile, activeTab, fetchAuditLogs, triggerRefresh])

  /**
   * Saat dialog verifikasi terbuka, tanyakan ke database apakah klaim
   * `amr` memang ada di JWT sesi ini.
   *
   * Tanpa ini, JWT yang (karena versi GoTrue atau konfigurasi tertentu)
   * tidak membawa `amr` akan membuat kedua aksi istimewa tertolak
   * selamanya — dan penyebabnya tidak kelihatan dari mana pun.
   */
  const fetchSecurity = useCallback(async () => {
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client")
      const { data, error } = await getSupabaseClient().rpc("my_security_status")
      if (error) throw error
      setSecurity(data as unknown as SecurityStatus)
    } catch (err) {
      console.error("Gagal membaca status keamanan:", err)
      setSecurity(null)
    }
  }, [])

  useEffect(() => {
    if (profile?.role !== "admin") return
    fetchSecurity()
  }, [profile, fetchSecurity, stepUp, triggerRefresh])

  // ── Pendaftaran TOTP ───────────────────────────────────────────────
  const startEnroll = async () => {
    setEnrollBusy(true)
    setEnrollError(null)
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client")
      const supabase = getSupabaseClient()

      // Percobaan pendaftaran yang tidak pernah diselesaikan meninggalkan
      // faktor berstatus 'unverified'. Dibersihkan dulu supaya tidak
      // menumpuk dan tidak membingungkan saat verifikasi.
      const { data: lama } = await supabase.auth.mfa.listFactors()
      for (const f of lama?.all || []) {
        if (f.status !== "verified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id })
        }
      }

      // issuer mengisi label yang tampil di aplikasi autentikator.
      // Tanpa itu, otpauth:// yang dihasilkan berlabel kosong dan sebagian
      // aplikasi menolaknya sebagai entri tidak sah.
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "FTTH Tools",
        friendlyName: `Admin ${new Date().toISOString().slice(0, 10)}`,
      })
      if (error) throw error

      setEnroll({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      })
      setEnrollCode("")
    } catch (err: any) {
      setEnrollError(err?.message || "Gagal memulai pendaftaran")
    } finally {
      setEnrollBusy(false)
    }
  }

  const confirmEnroll = async () => {
    if (!enroll) return
    setEnrollBusy(true)
    setEnrollError(null)
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client")
      const supabase = getSupabaseClient()

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enroll.factorId,
        code: enrollCode.trim(),
      })
      if (error) {
        setEnrollError("Kode tidak cocok. Pastikan jam di HP Anda tepat.")
        return
      }

      await supabase.rpc("admin_log_mfa_change", { p_terdaftar: true })
      setEnroll(null)
      setEnrollCode("")
      toast.success("Autentikasi dua faktor aktif")
      fetchSecurity()
    } catch (err: any) {
      setEnrollError(err?.message || "Gagal menyelesaikan pendaftaran")
    } finally {
      setEnrollBusy(false)
    }
  }

  const unenrollMfa = async () => {
    if (
      !confirm(
        "Cabut autentikasi dua faktor?\n\n" +
          "Setelah dicabut, akun ini kembali hanya dilindungi password — " +
          "siapa pun yang mengetahui password Anda bisa mengangkat admin baru."
      )
    )
      return

    setEnrollBusy(true)
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client")
      const supabase = getSupabaseClient()

      const { data: faktor } = await supabase.auth.mfa.listFactors()
      for (const f of faktor?.all || []) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }

      await supabase.rpc("admin_log_mfa_change", { p_terdaftar: false })
      toast.success("Autentikasi dua faktor dicabut")
      fetchSecurity()
    } catch (err: any) {
      toast.error("Gagal mencabut", { description: err?.message })
    } finally {
      setEnrollBusy(false)
    }
  }

  // Riwayat job + pembayaran user yang sedang dibuka di modal Kelola.
  useEffect(() => {
    if (!managing) {
      setDetail(null)
      return
    }
    let dibatalkan = false

    const muat = async () => {
      setLoadingDetail(true)
      try {
        const { getSupabaseClient } = await import("@/lib/supabase/client")
        const { data, error } = await getSupabaseClient().rpc("get_admin_user_detail", {
          p_user_id: managing.id,
          p_limit: 10,
        })
        if (error) throw error
        if (!dibatalkan) setDetail(data as unknown as UserDetail)
      } catch (err: any) {
        console.error("Gagal memuat detail user:", err)
        if (!dibatalkan) toast.error("Gagal memuat detail user", { description: err?.message })
      } finally {
        if (!dibatalkan) setLoadingDetail(false)
      }
    }

    muat()
    return () => {
      dibatalkan = true
    }
  }, [managing?.id, triggerRefresh]) // eslint-disable-line react-hooks/exhaustive-deps

  // Statistik + daftar user, keduanya lewat RPC agregat.
  useEffect(() => {
    if (profile?.role !== "admin") return

    const fetchAdminData = async () => {
      setLoading(true)
      try {
        const { getSupabaseClient } = await import("@/lib/supabase/client")
        const supabase = getSupabaseClient()

        const [statsRes, usersRes] = await Promise.all([
          supabase.rpc("get_admin_stats"),
          supabase.rpc("get_admin_users", {
            p_search: debouncedSearch || null,
            p_limit: PAGE_SIZE,
            p_offset: (page - 1) * PAGE_SIZE,
            p_filter: filter,
          }),
        ])

        if (statsRes.error) throw statsRes.error
        if (usersRes.error) throw usersRes.error

        // RPC-nya mengembalikan JSONB, jadi tipenya Json di types/supabase.ts.
        setStats(statsRes.data as unknown as AdminStats)

        const rows = (usersRes.data || []) as AdminUser[]
        setUsers(rows)
        setTotalUsers(rows.length > 0 ? Number(rows[0].total_count) : 0)
      } catch (err: any) {
        console.error("Admin fetch error:", err)
        toast.error("Gagal memuat data admin", {
          description:
            (err?.message || "unknown error") +
            " — kalau fungsinya belum ada, jalankan supabase/2026-09-14-admin-panel-upgrade.sql",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchAdminData()
    fetchPayments()
  }, [profile, page, debouncedSearch, filter, triggerRefresh, fetchPayments])

  // Jaga panel tetap sinkron saat baris berkurang di halaman terakhir.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  // Modal kelola memegang salinan baris; segarkan saat data baru datang.
  useEffect(() => {
    if (!managing) return
    const fresh = users.find((u) => u.id === managing.id)
    if (fresh) setManaging(fresh)
  }, [users]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Bucket 'receipts' privat. receipt_url menyimpan path storage
   * (mis. "<user-id>/<uuid>.jpg"), jadi butuh signed URL berumur pendek.
   * Baris lama masih menyimpan public URL penuh — path-nya diekstrak
   * supaya tetap bisa dibuka.
   */
  const handleViewReceipt = async (receiptUrl: string) => {
    setLoadingReceipt(true)
    try {
      const { getSupabaseClient } = await import("@/lib/supabase/client")
      const supabase = getSupabaseClient()

      let path = receiptUrl
      const marker = "/receipts/"
      if (receiptUrl.startsWith("http")) {
        const idx = receiptUrl.indexOf(marker)
        if (idx === -1) throw new Error("Format URL struk tidak dikenali")
        path = decodeURIComponent(receiptUrl.slice(idx + marker.length))
      }

      // 5 menit — cukup untuk verifikasi, tidak cukup untuk disebarkan
      const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, 300)
      if (error || !data?.signedUrl) throw error || new Error("Gagal membuat signed URL")
      setSelectedReceipt(data.signedUrl)
    } catch (err: any) {
      console.error("Failed to open receipt:", err)
      toast.error("Gagal membuka bukti transfer", { description: err?.message })
    } finally {
      setLoadingReceipt(false)
    }
  }

  const handleApprovePayment = async (payment: any) => {
    const nominal = Number(payment.amount_paid || 0).toLocaleString("id-ID")
    if (!confirm(`Setujui pembayaran Rp ${nominal} dari ${payment.sender_name}?`)) return

    const hasil = await runAction("Pembayaran disetujui", (s) =>
      s.rpc("approve_payment", { p_payment_id: payment.id })
    )
    if (hasil) {
      toast.info(
        `Paket ${String(hasil?.plan ?? payment.plan).toUpperCase()} aktif, ` +
          `kuota ${hasil?.quota_limit ?? "-"}, berakhir ${fmtDate(hasil?.expires_at ?? null)}.`
      )
    }
  }

  /**
   * Penolakan lewat RPC, bukan UPDATE langsung dari browser.
   *
   * UPDATE langsung punya dua kelemahan: tidak meninggalkan jejak audit,
   * dan RLS yang menolaknya tidak melempar error — ia hanya mengenai nol
   * baris, sehingga penolakan terlihat berhasil padahal tidak tersimpan.
   * admin_reject_payment() sekaligus mengirim alasannya ke penggunanya.
   */
  const handleRejectPaymentSubmit = async () => {
    if (!rejectingPayment) return
    const hasil = await runAction("Pembayaran ditolak", (s) =>
      s.rpc("admin_reject_payment", {
        p_payment_id: rejectingPayment.id,
        p_notes: rejectNotes || null,
      })
    )
    if (hasil) setRejectingPayment(null)
  }

  // ── Aksi per user ───────────────────────────────────────────────────
  const changePlan = (u: AdminUser, plan: PlanKey) =>
    runAction(`Paket ${u.email} diubah ke ${plan.toUpperCase()}`, (s) =>
      s.rpc("admin_set_user_plan", { p_user_id: u.id, p_plan: plan, p_days: 30 })
    )

  const extendSub = (u: AdminUser, days: number) =>
    runAction(`Langganan ${u.email} diperpanjang ${days} hari`, (s) =>
      s.rpc("admin_extend_subscription", { p_user_id: u.id, p_days: days })
    )

  const revokeSub = (u: AdminUser) => {
    if (!confirm(`Cabut langganan ${u.email} dan turunkan ke Free sekarang?`)) return
    return runAction(`Langganan ${u.email} dicabut`, (s) =>
      s.rpc("admin_revoke_subscription", { p_user_id: u.id })
    )
  }

  const setRole = (u: AdminUser, role: "user" | "admin") => {
    const aksi = role === "admin" ? "dijadikan admin" : "diturunkan jadi user biasa"
    if (!confirm(`Yakin ${u.email} ${aksi}?`)) return
    return runAction(`${u.email} ${aksi}`, (s) =>
      s.rpc("admin_set_user_role", { p_user_id: u.id, p_role: role })
    )
  }

  const setActive = (u: AdminUser, active: boolean) => {
    if (!active && !confirm(`Tangguhkan akun ${u.email}? Ia tidak bisa memakai tool apa pun.`)) return
    return runAction(`Akun ${u.email} ${active ? "diaktifkan" : "ditangguhkan"}`, (s) =>
      s.rpc("admin_set_user_active", { p_user_id: u.id, p_active: active })
    )
  }

  const resetQuota = (u: AdminUser) =>
    runAction(`Kuota ${u.email} direset`, (s) =>
      s.rpc("admin_reset_quota", { p_user_id: u.id })
    )

  const resetDevices = (u: AdminUser) => {
    if (!confirm(`Hapus ${u.device_count} perangkat terdaftar milik ${u.email}?`)) return
    return runAction(`Perangkat ${u.email} direset`, (s) =>
      s.rpc("admin_reset_devices", { p_user_id: u.id })
    )
  }

  if (isLoading || profile?.role !== "admin") {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const ov = stats?.overview
  const pendingCount = payments.filter((p) => p.status === "pending").length

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 ring-1 ring-danger/20">
              <Shield className="h-5 w-5 text-danger" />
            </div>
            Admin Dashboard
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ringkasan sistem, monitoring langganan, dan kendali akun
          </p>
        </div>
        <button
          onClick={() => setTriggerRefresh((t) => t + 1)}
          disabled={loading || busy}
          className="self-start flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-xl border border-border bg-surface-1 cursor-pointer disabled:opacity-40"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", (loading || busy) && "animate-spin")} />
          Muat ulang
        </button>
      </div>

      {/* Peringatan langganan lewat tanggal tapi masih aktif */}
      {ov && ov.overdueSubscriptions > 0 && (
        <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-medium text-warning">
              {ov.overdueSubscriptions} langganan sudah lewat tanggal tapi masih berstatus aktif
            </p>
            <p className="text-muted-foreground mt-1">
              Sapuan otomatis (<code className="font-mono">expire_due_subscriptions</code>) kemungkinan
              belum terjadwal. Saring dengan tab “Kedaluwarsa” untuk menindaklanjuti satu per satu.
            </p>
          </div>
        </div>
      )}

      {/* Keamanan akun admin */}
      {security && (
        <div
          className={cn(
            "rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center gap-3",
            security.mfa_enrolled === true
              ? "border-success/20 bg-success/5"
              : "border-warning/20 bg-warning/5"
          )}
        >
          <ShieldCheck
            className={cn(
              "h-4 w-4 mt-0.5 shrink-0",
              security.mfa_enrolled === true ? "text-success" : "text-warning"
            )}
          />
          <div className="flex-1 text-xs">
            {security.mfa_enrolled === null ? (
              <>
                <p className="font-medium text-warning">
                  Status dua faktor tidak bisa dibaca
                </p>
                <p className="text-muted-foreground mt-1">
                  Fungsi <code className="font-mono">has_mfa_enrolled()</code> tidak punya hak
                  baca ke <code className="font-mono">auth.mfa_factors</code>. Penegakan faktor
                  kedua sengaja dilewati supaya panel tidak terkunci — tapi artinya perlindungan
                  itu sedang <span className="text-foreground">tidak aktif</span>.
                </p>
              </>
            ) : security.mfa_enrolled ? (
              <>
                <p className="font-medium text-success">Autentikasi dua faktor aktif</p>
                <p className="text-muted-foreground mt-1">
                  Mengangkat admin dan menyetujui pembayaran menuntut kode dari aplikasi
                  autentikator Anda — password saja tidak cukup.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-warning">
                  Akun admin ini belum punya faktor kedua
                </p>
                <p className="text-muted-foreground mt-1">
                  Verifikasi ulang saat ini hanya meminta password. Itu melindungi dari sesi
                  yang dibajak, tapi <span className="text-foreground">tidak</span> dari password
                  yang bocor — penyerang yang mengetahuinya tinggal mengetik ulang.
                </p>
              </>
            )}
          </div>
          {security.mfa_enrolled === true ? (
            <button
              onClick={unenrollMfa}
              disabled={enrollBusy}
              className="self-start text-2xs text-muted-foreground hover:text-danger px-3 py-1.5 rounded-xl border border-border hover:border-danger/30 cursor-pointer disabled:opacity-40 shrink-0"
            >
              Cabut
            </button>
          ) : (
            <button
              onClick={startEnroll}
              disabled={enrollBusy}
              className="self-start text-2xs bg-warning text-black px-3 py-1.5 rounded-xl font-semibold hover:bg-warning/90 cursor-pointer disabled:opacity-40 shrink-0"
            >
              {enrollBusy ? "Menyiapkan…" : "Aktifkan sekarang"}
            </button>
          )}
        </div>
      )}

      {/* Overview Cards */}
      {ov && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[
            { label: "Users", value: ov.totalUsers, icon: Users, color: "text-primary" },
            { label: "Langganan Aktif", value: ov.activeSubscriptions, icon: Crown, color: "text-warning" },
            { label: "Segera Habis", value: ov.expiringSoon, icon: CalendarClock, color: "text-warning" },
            { label: "Job Hari Ini", value: ov.todayJobs, icon: Activity, color: "text-blue-400" },
            {
              label: "Job Gagal 24j",
              value: ov.failedJobs24h,
              icon: Briefcase,
              color: ov.failedJobs24h > 0 ? "text-danger" : "text-success",
            },
            { label: "MRR", value: fmtRp(ov.monthlyRevenueIdr), icon: DollarSign, color: "text-success" },
          ].map((s, i) => (
            <motion.div
              key={s.label}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm p-4"
            >
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <s.icon className={cn("h-4 w-4", s.color)} />
                <span className="text-2xs font-medium">{s.label}</span>
              </div>
              <p className="text-xl font-semibold truncate" title={String(s.value)}>
                {s.value}
              </p>
            </motion.div>
          ))}
        </div>
      )}

      {/* Plan Distribution + Job Status */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border bg-card/40 p-5">
            <h2 className="text-sm font-medium mb-3">Users by Plan</h2>
            <div className="space-y-2">
              {Object.entries(stats.usersByPlan).map(([plan, count]) => (
                <button
                  key={plan}
                  onClick={() => {
                    setFilter(plan)
                    setPage(1)
                    setActiveTab("users")
                  }}
                  className="w-full flex items-center justify-between hover:bg-surface-1 rounded-lg px-1 py-0.5 cursor-pointer"
                >
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium border capitalize",
                      planBadge[plan] || planBadge.free
                    )}
                  >
                    {plan}
                  </span>
                  <span className="text-sm font-mono">{count}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card/40 p-5">
            <h2 className="text-sm font-medium mb-3">Jobs by Status</h2>
            <div className="space-y-2">
              {Object.entries(stats.jobsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground capitalize">{status}</span>
                  <span className="text-sm font-mono">{count}</span>
                </div>
              ))}
              {Object.keys(stats.jobsByStatus).length === 0 && (
                <p className="text-xs text-muted-foreground/50">No jobs yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigations */}
      <div className="flex border-b border-border gap-6">
        <button
          onClick={() => setActiveTab("users")}
          className={cn(
            "pb-3 text-sm font-medium border-b-2 -mb-[2px] transition-colors cursor-pointer",
            activeTab === "users"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          User Management
        </button>
        <button
          onClick={() => {
            setActiveTab("payments")
            fetchPayments()
          }}
          className={cn(
            "pb-3 text-sm font-medium border-b-2 -mb-[2px] transition-colors flex items-center gap-2 cursor-pointer",
            activeTab === "payments"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          Payment Verifications
          {pendingCount > 0 && (
            <span className="bg-primary text-primary-foreground text-2xs font-bold px-2 py-0.5 rounded-full">
              {pendingCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={cn(
            "pb-3 text-sm font-medium border-b-2 -mb-[2px] transition-colors flex items-center gap-2 cursor-pointer",
            activeTab === "audit"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <ScrollText className="h-3.5 w-3.5" />
          Riwayat Aksi
        </button>
      </div>

      {activeTab === "users" ? (
        <div className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm overflow-hidden">
          <div className="p-5 border-b border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-base font-medium">
                User Management
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  {totalUsers} akun
                </span>
              </h2>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-1 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Cari email atau nama..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-sm outline-none w-48 placeholder:text-muted-foreground/50"
                />
              </div>
            </div>

            {/* Filter cepat */}
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    setFilter(f.key)
                    setPage(1)
                  }}
                  className={cn(
                    "text-2xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer",
                    filter === f.key
                      ? "bg-primary/10 text-primary border-primary/30"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-surface-2"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">User</th>
                  <th className="px-3 py-3 text-left">Paket</th>
                  <th className="px-3 py-3 text-left">Masa Berlaku</th>
                  <th className="px-3 py-3 text-left">Kuota</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => {
                  const exp = expiryInfo(u)
                  return (
                    <tr key={u.id} className="hover:bg-surface-1">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate max-w-[180px]">{u.full_name || "—"}</p>
                          {u.role === "admin" && (
                            <span className="text-2xs px-1.5 py-0.5 rounded border bg-danger/10 text-danger border-danger/20">
                              admin
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate max-w-[180px]">{u.email}</p>
                      </td>

                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-xs font-medium border capitalize",
                            planBadge[u.plan] || planBadge.free
                          )}
                        >
                          {u.plan}
                        </span>
                      </td>

                      <td className="px-3 py-3">
                        <p className={cn("text-xs font-medium", exp.cls)}>{exp.text}</p>
                        <p className="text-2xs text-muted-foreground/70">{exp.sub}</p>
                      </td>

                      <td className="px-3 py-3 text-xs text-muted-foreground font-mono">
                        {u.quota_used}/{u.quota_limit >= 99999 ? "∞" : u.quota_limit}
                      </td>

                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "text-2xs px-2 py-0.5 rounded border font-medium",
                            u.is_active
                              ? "bg-success/10 text-success border-success/20"
                              : "bg-danger/10 text-danger border-danger/20"
                          )}
                        >
                          {u.is_active ? "Aktif" : "Ditangguhkan"}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => {
                            setManaging(u)
                            setExtendDays(30)
                          }}
                          className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-lg border border-border hover:bg-surface-2 cursor-pointer"
                        >
                          <Settings2 className="h-3 w-3" />
                          Kelola
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {users.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground/50 text-sm">
                      Tidak ada user yang cocok
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground/50 text-sm">
                      Memuat...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Halaman {page} dari {totalPages} ({totalUsers} user)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2 py-1 rounded border border-border hover:bg-surface-2 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                  className="px-2 py-1 rounded border border-border hover:bg-surface-2 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === "payments" ? (
        /* Payment Verifications Table */
        <div className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-medium">Payment Verifications</h2>
            <button
              onClick={() => setTriggerRefresh((t) => t + 1)}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl border border-border bg-surface-1 cursor-pointer"
            >
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">User</th>
                  <th className="px-3 py-3 text-left">Plan</th>
                  <th className="px-3 py-3 text-left">Sender Info</th>
                  <th className="px-3 py-3 text-left">Amount</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Receipt</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-1">
                    <td className="px-5 py-3">
                      <p className="font-medium truncate max-w-[200px]">{p.profiles?.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {p.profiles?.email}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded border capitalize",
                          planBadge[p.plan] || planBadge.free
                        )}
                      >
                        {p.plan}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p className="font-medium text-foreground">{p.sender_name}</p>
                      <p className="text-muted-foreground text-2xs uppercase">{p.sender_bank}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{fmtRp(p.amount_paid)}</td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          "text-2xs px-2 py-0.5 rounded border font-medium uppercase",
                          p.status === "approved"
                            ? "bg-success/10 text-success border-success/20"
                            : p.status === "rejected"
                              ? "bg-danger/10 text-danger border-danger/20"
                              : "bg-warning/10 text-warning border-warning/20"
                        )}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {p.receipt_url ? (
                        <button
                          onClick={() => handleViewReceipt(p.receipt_url)}
                          disabled={loadingReceipt}
                          className="text-xs text-primary hover:underline cursor-pointer disabled:opacity-50"
                        >
                          {loadingReceipt ? "Opening…" : "View Receipt"}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {p.status === "pending" ? (
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleApprovePayment(p)}
                            disabled={busy}
                            className="text-xs bg-success text-white px-2.5 py-1.5 rounded-lg font-medium hover:bg-success/90 cursor-pointer disabled:opacity-40"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setRejectingPayment(p)
                              setRejectNotes("")
                            }}
                            disabled={busy}
                            className="text-xs bg-danger/10 text-danger border border-danger/20 px-2.5 py-1.5 rounded-lg font-medium hover:bg-danger hover:text-white cursor-pointer disabled:opacity-40"
                          >
                            Reject
                          </button>
                        </div>
                      ) : p.status === "rejected" ? (
                        <p
                          className="text-2xs text-muted-foreground text-right italic max-w-[120px] truncate"
                          title={p.admin_notes}
                        >
                          Note: {p.admin_notes}
                        </p>
                      ) : (
                        <span className="text-xs text-muted-foreground">Processed</span>
                      )}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && !loadingPayments && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground/50 text-sm">
                      No payment verifications found
                    </td>
                  </tr>
                )}
                {loadingPayments && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-muted-foreground/50 text-sm">
                      Loading...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── Riwayat Aksi (jejak audit) ───────────────────────────── */
        <div className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm overflow-hidden">
          <div className="p-5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-medium">
                Riwayat Aksi
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  {auditTotal} catatan
                </span>
              </h2>
              <p className="mt-1 text-2xs text-muted-foreground/70">
                Dicatat di dalam transaksi database, jadi tidak bisa dilewati dari sisi browser.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-1 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Cari email atau keterangan..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="bg-transparent text-sm outline-none w-48 placeholder:text-muted-foreground/50"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-5 py-3 text-left">Waktu</th>
                  <th className="px-3 py-3 text-left">Tindakan</th>
                  <th className="px-3 py-3 text-left">Oleh</th>
                  <th className="px-3 py-3 text-left">Terhadap</th>
                  <th className="px-3 py-3 text-left">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {auditLogs.map((l) => {
                  const meta = AUDIT_META[l.event_type] || {
                    label: l.event_type,
                    cls: "bg-surface-2 text-muted-foreground border-border",
                  }
                  return (
                    <tr key={l.id} className="hover:bg-surface-1 align-top">
                      <td className="px-5 py-3 text-2xs text-muted-foreground whitespace-nowrap">
                        {fmtDateTime(l.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "text-2xs px-2 py-0.5 rounded border font-medium whitespace-nowrap",
                            meta.cls
                          )}
                        >
                          {meta.label}
                        </span>
                        {l.severity === "critical" && (
                          <span className="ml-1.5 text-2xs text-danger font-semibold">!</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs truncate max-w-[160px]">
                        {l.actor_email || <span className="text-muted-foreground/50">sistem</span>}
                      </td>
                      <td className="px-3 py-3 text-xs truncate max-w-[160px]">
                        {l.target_email || <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{l.description}</td>
                    </tr>
                  )
                })}
                {auditLogs.length === 0 && !loadingAudit && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground/50 text-sm">
                      Belum ada tindakan admin yang tercatat
                    </td>
                  </tr>
                )}
                {loadingAudit && (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-muted-foreground/50 text-sm">
                      Memuat...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {auditTotal > AUDIT_PAGE_SIZE && (
            <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Halaman {auditPage} dari {Math.ceil(auditTotal / AUDIT_PAGE_SIZE)}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  disabled={auditPage <= 1}
                  className="px-2 py-1 rounded border border-border hover:bg-surface-2 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setAuditPage((p) => p + 1)}
                  disabled={auditPage >= Math.ceil(auditTotal / AUDIT_PAGE_SIZE)}
                  className="px-2 py-1 rounded border border-border hover:bg-surface-2 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal Kelola User ───────────────────────────────────────── */}
      {managing && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => !busy && setManaging(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-md w-full max-h-[90vh] overflow-y-auto bg-card border border-border rounded-2xl p-6 animate-in fade-in zoom-in-95 duration-200"
          >
            <button
              onClick={() => setManaging(null)}
              disabled={busy}
              className="absolute top-4 right-4 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-3 text-xl font-bold cursor-pointer disabled:opacity-40"
            >
              &times;
            </button>

            <h3 className="text-sm font-semibold pr-8">{managing.full_name || "Tanpa nama"}</h3>
            <p className="text-xs text-muted-foreground truncate">{managing.email}</p>

            <div className="mt-4 grid grid-cols-2 gap-3 text-2xs">
              <div className="rounded-xl border border-border bg-surface-1 p-3">
                <p className="text-muted-foreground">Bergabung</p>
                <p className="mt-1 font-medium">{fmtDate(managing.created_at)}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface-1 p-3">
                <p className="text-muted-foreground">Login terakhir</p>
                <p className="mt-1 font-medium">{fmtDate(managing.last_login_at)}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface-1 p-3">
                <p className="text-muted-foreground">Langganan mulai</p>
                <p className="mt-1 font-medium">{fmtDate(managing.sub_started_at)}</p>
              </div>
              <div className="rounded-xl border border-border bg-surface-1 p-3">
                <p className="text-muted-foreground">Berakhir</p>
                <p className={cn("mt-1 font-medium", expiryInfo(managing).cls)}>
                  {fmtDate(managing.sub_expires_at)}
                </p>
              </div>
            </div>

            {/* Paket */}
            <div className="mt-5">
              <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
                Paket
              </label>
              <select
                value={managing.plan}
                disabled={busy}
                onChange={(e) => changePlan(managing, e.target.value as PlanKey)}
                className="mt-2 w-full bg-surface-1 text-sm border border-border rounded-xl px-3 py-2 cursor-pointer disabled:opacity-40"
              >
                <option value="free" className="bg-card">Free — kuota 50</option>
                <option value="basic" className="bg-card">Basic — kuota 500</option>
                <option value="pro" className="bg-card">Pro — tanpa batas</option>
                <option value="enterprise" className="bg-card">Enterprise — tanpa batas</option>
              </select>
              <p className="mt-1.5 text-2xs text-muted-foreground/70">
                Mengubah paket memulai ulang masa berlaku 30 hari dari sekarang.
              </p>
            </div>

            {/* Perpanjang */}
            <div className="mt-5">
              <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
                Perpanjang langganan
              </label>
              <div className="mt-2 flex gap-2">
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => extendSub(managing, d)}
                    disabled={busy || managing.plan === "free"}
                    className="flex-1 text-xs px-2 py-2 rounded-xl border border-border bg-surface-1 hover:bg-surface-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    +{d} hari
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  type="number"
                  value={extendDays}
                  min={-3650}
                  max={3650}
                  onChange={(e) => setExtendDays(Number(e.target.value))}
                  className="w-24 rounded-xl border border-border bg-surface-1 px-3 py-2 text-xs outline-none focus:border-primary/50"
                />
                <button
                  onClick={() => extendSub(managing, extendDays)}
                  disabled={busy || managing.plan === "free" || !extendDays}
                  className="flex-1 text-xs px-3 py-2 rounded-xl border border-border bg-surface-1 hover:bg-surface-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Terapkan (negatif = potong)
                </button>
              </div>
              {managing.plan === "free" && (
                <p className="mt-1.5 text-2xs text-muted-foreground/70">
                  Akun Free tidak punya langganan untuk diperpanjang — naikkan paketnya dulu.
                </p>
              )}
            </div>

            {/* Aksi lain */}
            <div className="mt-5 space-y-2">
              <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
                Aksi lain
              </label>

              <button
                onClick={() => resetQuota(managing)}
                disabled={busy}
                className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-surface-1 hover:bg-surface-2 cursor-pointer disabled:opacity-40 text-left"
              >
                Reset kuota — sekarang {managing.quota_used}/
                {managing.quota_limit >= 99999 ? "∞" : managing.quota_limit}
              </button>

              <button
                onClick={() => resetDevices(managing)}
                disabled={busy || managing.device_count === 0}
                className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-surface-1 hover:bg-surface-2 cursor-pointer disabled:opacity-40 text-left flex items-center gap-2"
              >
                <Smartphone className="h-3 w-3 shrink-0" />
                Reset perangkat terdaftar — {managing.device_count} terdaftar
              </button>

              <button
                onClick={() => setActive(managing, !managing.is_active)}
                disabled={busy || managing.id === profile?.id}
                className={cn(
                  "w-full text-xs px-3 py-2 rounded-xl border cursor-pointer disabled:opacity-40 text-left",
                  managing.is_active
                    ? "border-warning/20 bg-warning/5 text-warning hover:bg-warning/10"
                    : "border-success/20 bg-success/5 text-success hover:bg-success/10"
                )}
              >
                {managing.is_active ? "Tangguhkan akun" : "Aktifkan kembali akun"}
              </button>

              <button
                onClick={() => setRole(managing, managing.role === "admin" ? "user" : "admin")}
                disabled={busy || managing.id === profile?.id}
                className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-surface-1 hover:bg-surface-2 cursor-pointer disabled:opacity-40 text-left"
              >
                {managing.role === "admin" ? "Turunkan jadi user biasa" : "Jadikan admin"}
              </button>

              <button
                onClick={() => revokeSub(managing)}
                disabled={busy || managing.plan === "free"}
                className="w-full text-xs px-3 py-2 rounded-xl border border-danger/20 bg-danger/5 text-danger hover:bg-danger/10 cursor-pointer disabled:opacity-40 text-left"
              >
                Cabut langganan &amp; turunkan ke Free
              </button>

              {managing.id === profile?.id && (
                <p className="text-2xs text-muted-foreground/70">
                  Menangguhkan atau menurunkan role akun sendiri dinonaktifkan agar tidak terkunci
                  dari panel ini.
                </p>
              )}
            </div>

            {/* ── Riwayat: kenapa admin butuh ini ──────────────────────
                Saat user melapor "konversi saya gagal", tanpa daftar di
                bawah admin tidak punya cara melihat job mana yang gagal
                dan apa pesan errornya. */}
            <div className="mt-6 border-t border-border pt-4">
              <label className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
                Riwayat job terakhir
              </label>

              {loadingDetail && (
                <p className="mt-2 text-2xs text-muted-foreground/60">Memuat riwayat...</p>
              )}

              {!loadingDetail && detail && detail.jobs.length === 0 && (
                <p className="mt-2 text-2xs text-muted-foreground/60">Belum pernah memproses apa pun.</p>
              )}

              {!loadingDetail && detail && detail.jobs.length > 0 && (
                <div className="mt-2 space-y-1.5 max-h-52 overflow-y-auto">
                  {detail.jobs.map((j) => (
                    <div key={j.id} className="rounded-xl border border-border bg-surface-1 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-2xs font-medium font-mono truncate">{j.tool_name}</span>
                        <span
                          className={cn(
                            "text-2xs px-1.5 py-0.5 rounded border shrink-0",
                            j.status === "completed"
                              ? "bg-success/10 text-success border-success/20"
                              : j.status === "failed"
                                ? "bg-danger/10 text-danger border-danger/20"
                                : "bg-surface-2 text-muted-foreground border-border"
                          )}
                        >
                          {j.status}
                        </span>
                      </div>
                      <p className="mt-1 text-2xs text-muted-foreground truncate">
                        {j.original_filename || "—"} · {fmtDateTime(j.created_at)}
                      </p>
                      {j.error_message && (
                        <p className="mt-1 text-2xs text-danger break-words">
                          {j.error_code ? `[${j.error_code}] ` : ""}
                          {j.error_message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <label className="mt-4 block text-2xs font-medium text-muted-foreground uppercase tracking-wider">
                Riwayat pembayaran
              </label>

              {!loadingDetail && detail && detail.payments.length === 0 && (
                <p className="mt-2 text-2xs text-muted-foreground/60">Belum ada konfirmasi pembayaran.</p>
              )}

              {!loadingDetail && detail && detail.payments.length > 0 && (
                <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                  {detail.payments.map((p) => (
                    <div key={p.id} className="rounded-xl border border-border bg-surface-1 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-2xs font-medium">
                          {String(p.plan).toUpperCase()} · {fmtRp(p.amount_paid)}
                        </span>
                        <span
                          className={cn(
                            "text-2xs px-1.5 py-0.5 rounded border shrink-0 uppercase",
                            p.status === "approved"
                              ? "bg-success/10 text-success border-success/20"
                              : p.status === "rejected"
                                ? "bg-danger/10 text-danger border-danger/20"
                                : "bg-warning/10 text-warning border-warning/20"
                          )}
                        >
                          {p.status}
                        </span>
                      </div>
                      <p className="mt-1 text-2xs text-muted-foreground truncate">
                        {p.sender_name || "—"} · {fmtDateTime(p.created_at)}
                      </p>
                      {p.admin_notes && (
                        <p className="mt-1 text-2xs text-muted-foreground/80 break-words italic">
                          {p.admin_notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative max-w-lg w-full bg-card border border-border rounded-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedReceipt(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-3 text-xl font-bold cursor-pointer"
            >
              &times;
            </button>
            <h3 className="text-sm font-semibold mb-4">Receipt Proof</h3>
            <div className="relative aspect-[3/4] sm:aspect-square w-full rounded-lg bg-black/40 overflow-hidden flex items-center justify-center border border-border/60">
              {/* Signed URL punya query string (?token=…), jadi cek pathname-nya */}
              {new URL(selectedReceipt, window.location.origin).pathname
                .toLowerCase()
                .endsWith(".pdf") ? (
                <iframe src={selectedReceipt} className="w-full h-full" />
              ) : (
                <img
                  src={selectedReceipt}
                  alt="Transfer Receipt"
                  className="max-w-full max-h-full object-contain"
                />
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <a
                href={selectedReceipt}
                target="_blank"
                rel="noreferrer"
                className="text-xs bg-primary text-primary-foreground px-4 py-2 rounded-xl font-semibold hover:bg-primary/90"
              >
                Open Original
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingPayment && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="relative max-w-md w-full bg-card border border-border rounded-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-semibold mb-3">Reject Payment</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Menolak pembayaran dari {rejectingPayment.sender_name} (
              {fmtRp(rejectingPayment.amount_paid)}). Tuliskan alasannya di bawah.
            </p>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              placeholder="mis. Dana tidak masuk, atau bukti transfer palsu."
              className="w-full h-24 rounded-xl border border-border bg-surface-1 p-3 text-xs focus:outline-none focus:border-danger/50 transition-colors placeholder:text-muted-foreground/40"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRejectingPayment(null)}
                disabled={busy}
                className="text-xs text-muted-foreground px-4 py-2 rounded-xl border border-border hover:bg-surface-2 cursor-pointer disabled:opacity-40"
              >
                Batal
              </button>
              <button
                onClick={handleRejectPaymentSubmit}
                disabled={busy}
                className="text-xs bg-danger text-white px-4 py-2 rounded-xl font-semibold hover:bg-danger/90 cursor-pointer disabled:opacity-40"
              >
                Tolak Pembayaran
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Verifikasi Ulang Identitas (step-up) ────────────────────── */}
      {stepUp && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative max-w-sm w-full bg-card border border-border rounded-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 ring-1 ring-warning/20">
              <KeyRound className="h-5 w-5 text-warning" />
            </div>

            <h3 className="mt-4 text-sm font-semibold">
              {stepUp.mode === "totp" ? "Masukkan kode autentikator" : "Verifikasi identitas Anda"}
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">
              {stepUp.mode === "totp" ? (
                <>
                  Tindakan ini menuntut faktor kedua. Buka aplikasi autentikator Anda dan
                  masukkan kode 6 digit yang sedang berlaku.
                </>
              ) : (
                <>
                  Tindakan ini istimewa, jadi sesi yang sedang terbuka saja tidak cukup. Masukkan
                  password akun <span className="text-foreground">{profile?.email}</span> untuk
                  melanjutkan.
                </>
              )}
            </p>
            <p className="mt-2 text-2xs text-muted-foreground/70">
              Tertahan: <span className="text-muted-foreground">{stepUp.label}</span>
            </p>

            {security && security.amr_tersedia === false && (
              <div className="mt-3 rounded-xl border border-danger/20 bg-danger/5 p-3">
                <p className="text-2xs text-danger font-medium">
                  JWT sesi ini tidak membawa klaim <code className="font-mono">amr</code>.
                </p>
                <p className="mt-1 text-2xs text-muted-foreground">
                  Verifikasi ulang tidak akan pernah lolos selama itu terjadi. Lepas
                  sementara <code className="font-mono">PERFORM require_fresh_auth()</code> dari
                  admin_set_user_role dan approve_payment, lalu telusuri versi GoTrue-nya.
                </p>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (stepUp.mode === "totp") handleTotpSubmit()
                else handleStepUpSubmit()
              }}
            >
              {stepUp.mode === "totp" ? (
                <input
                  type="text"
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="mt-4 w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-center text-lg font-mono tracking-[0.4em] outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/30"
                />
              ) : (
                <input
                  type="password"
                  autoFocus
                  autoComplete="current-password"
                  value={stepUpPassword}
                  onChange={(e) => setStepUpPassword(e.target.value)}
                  placeholder="Password"
                  className="mt-4 w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/40"
                />
              )}

              {stepUpError && (
                <p className="mt-2 text-2xs text-danger">{stepUpError}</p>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStepUp(null)
                    setStepUpPassword("")
                    setTotpCode("")
                    setStepUpError(null)
                  }}
                  disabled={stepUpBusy}
                  className="text-xs text-muted-foreground px-4 py-2 rounded-xl border border-border hover:bg-surface-2 cursor-pointer disabled:opacity-40"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    stepUpBusy ||
                    (stepUp.mode === "totp" ? totpCode.length < 6 : !stepUpPassword)
                  }
                  className="text-xs bg-primary text-primary-foreground px-4 py-2 rounded-xl font-semibold hover:bg-primary/90 cursor-pointer disabled:opacity-40"
                >
                  {stepUpBusy ? "Memverifikasi…" : "Verifikasi & lanjutkan"}
                </button>
              </div>
            </form>

            {stepUp.mode === "password" && (
              <div className="mt-4 border-t border-border pt-3">
                <button
                  type="button"
                  onClick={handleStepUpGoogle}
                  disabled={stepUpBusy}
                  className="w-full text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-xl border border-border hover:bg-surface-2 cursor-pointer disabled:opacity-40"
                >
                  Verifikasi lewat Google
                </button>
                <p className="mt-2 text-2xs text-muted-foreground/70">
                  Jalur Google memuat ulang halaman, jadi setelah kembali Anda perlu mengklik
                  tindakannya sekali lagi.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pendaftaran TOTP ────────────────────────────────────────── */}
      {enroll && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative max-w-sm w-full max-h-[90vh] overflow-y-auto bg-card border border-border rounded-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-sm font-semibold">Aktifkan autentikasi dua faktor</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              Pindai kode ini dengan Google Authenticator, Authy, atau aplikasi sejenis, lalu
              masukkan 6 digit yang muncul.
            </p>

            <div className="mt-4 flex justify-center rounded-xl bg-white p-3">
              <img src={qrSrc(enroll.qr)} alt="QR code TOTP" className="h-40 w-40" />
            </div>

            {/* Kalau panel ini dibuka DARI HP, memindai QR di layar yang
                sama mustahil. Mengetuk otpauth:// membuka aplikasi
                autentikator langsung dengan akun sudah terisi. */}
            <a
              href={enroll.uri}
              className="mt-3 block w-full text-center text-xs px-3 py-2 rounded-xl border border-border bg-surface-1 hover:bg-surface-2 cursor-pointer"
            >
              Buka langsung di aplikasi autentikator
            </a>

            <div className="mt-3 rounded-xl border border-border bg-surface-1 p-3">
              <p className="text-2xs text-muted-foreground">
                Tidak bisa memindai? Masukkan kunci ini manual:
              </p>
              <p className="mt-1 text-2xs font-mono break-all text-foreground">{enroll.secret}</p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(enroll.secret)
                  toast.success("Kunci disalin")
                }}
                className="mt-2 text-2xs text-primary hover:underline cursor-pointer"
              >
                Salin kunci
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                confirmEnroll()
              }}
            >
              <input
                type="text"
                autoFocus
                inputMode="numeric"
                maxLength={6}
                value={enrollCode}
                onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="mt-4 w-full rounded-xl border border-border bg-surface-1 px-3 py-2 text-center text-lg font-mono tracking-[0.4em] outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground/30"
              />

              {enrollError && <p className="mt-2 text-2xs text-danger">{enrollError}</p>}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEnroll(null)
                    setEnrollCode("")
                    setEnrollError(null)
                  }}
                  disabled={enrollBusy}
                  className="text-xs text-muted-foreground px-4 py-2 rounded-xl border border-border hover:bg-surface-2 cursor-pointer disabled:opacity-40"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={enrollBusy || enrollCode.length < 6}
                  className="text-xs bg-primary text-primary-foreground px-4 py-2 rounded-xl font-semibold hover:bg-primary/90 cursor-pointer disabled:opacity-40"
                >
                  {enrollBusy ? "Memverifikasi…" : "Aktifkan"}
                </button>
              </div>
            </form>

            <p className="mt-3 text-2xs text-muted-foreground/70">
              Simpan kunci di atas di tempat aman. Kalau HP Anda hilang dan kuncinya tidak
              tersimpan, faktor ini hanya bisa dicabut lewat dashboard Supabase.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
