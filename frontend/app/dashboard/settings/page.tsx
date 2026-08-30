"use client"

import { useState, useEffect } from "react"
import { getSupabaseClient } from "@/lib/supabase/client"
import { getDeviceFingerprint, getDeviceTypeInfo } from "@/lib/fingerprint"
import { ShieldCheck, Smartphone, Laptop, RotateCcw, Loader2, CheckCircle2 } from "lucide-react"

export default function SettingsPage() {
  const [deviceCount, setDeviceCount] = useState<number | null>(null)
  const [userPlan, setUserPlan] = useState<string>("free")
  const [loading, setLoading] = useState(true)
  const [resetting, setResetting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [currentDevice, setCurrentDevice] = useState<{ type: string; name: string } | null>(null)

  useEffect(() => {
    async function loadDeviceInfo() {
      try {
        setCurrentDevice(getDeviceTypeInfo())
        const supabase = getSupabaseClient()
        const { data: userData } = await supabase.auth.getUser()
        if (!userData?.user) return

        // Fetch user plan
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan")
          .eq("id", userData.user.id)
          .single()
        
        if (profile?.plan) {
          setUserPlan(profile.plan)
        }

        // Count user registered devices
        const { count, error } = await supabase
          .from("device_registrations")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userData.user.id)

        if (!error && count !== null) {
          setDeviceCount(count)
        }
      } catch (err) {
        console.error("Error loading settings device info:", err)
      } finally {
        setLoading(false)
      }
    }

    loadDeviceInfo()
  }, [])

  const handleResetDevices = async () => {
    setResetting(true)
    setMessage(null)
    try {
      const supabase = getSupabaseClient()
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) return

      const { error } = await supabase.rpc("reset_user_devices", { p_user_id: userData.user.id })
      if (error) throw error

      setDeviceCount(0)
      setMessage("Semua perangkat berhasil di-reset. Perangkat ini akan didaftarkan ulang saat Anda mengakses tool.")
    } catch (err: any) {
      console.error("Reset devices error:", err)
      setMessage("Gagal mereset perangkat. Silakan coba lagi.")
    } finally {
      setResetting(false)
    }
  }

  const maxDevices = userPlan === "enterprise" ? "Unlimited" : (userPlan === "basic" || userPlan === "pro" ? 2 : 1)

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Kelola preferensi akun dan perangkat terdaftar Anda.
        </p>
      </div>

      {/* Security & Device Limits */}
      <section className="rounded-2xl border border-border bg-card/40 p-6 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-medium">Perangkat Terdaftar (Device Security)</h2>
              <p className="text-xs text-muted-foreground">
                Batas 1 akun: Maksimal {maxDevices} Perangkat aktif ({userPlan === "basic" || userPlan === "pro" ? "1 Laptop + 1 HP" : "1 Perangkat"}).
              </p>
            </div>
          </div>

          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase">
            Paket {userPlan}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="rounded-xl border border-border bg-surface-1 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentDevice?.type === "mobile" ? (
                <Smartphone className="h-5 w-5 text-primary" />
              ) : (
                <Laptop className="h-5 w-5 text-primary" />
              )}
              <div>
                <p className="text-xs text-muted-foreground">Perangkat Saat Ini</p>
                <p className="text-sm font-medium">{currentDevice?.name || "Desktop Browser"}</p>
              </div>
            </div>
            <span className="flex h-2 w-2 rounded-full bg-success animate-pulse" />
          </div>

          <div className="rounded-xl border border-border bg-surface-1 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Status Perangkat Terdaftar</p>
              <p className="text-sm font-medium">
                {loading ? "Memuat..." : `${deviceCount ?? 0} dari ${maxDevices} Perangkat`}
              </p>
            </div>
            <button
              onClick={handleResetDevices}
              disabled={resetting || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-2 hover:bg-surface-3 border border-border text-foreground transition-all cursor-pointer disabled:opacity-50"
            >
              {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 text-blue-400" />}
              Reset Perangkat
            </button>
          </div>
        </div>

        {message && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-success/20 bg-success/10 text-success text-xs">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>{message}</span>
          </div>
        )}
      </section>

      {/* Profile */}
      <section className="rounded-2xl border border-border bg-card/40 p-6 backdrop-blur-sm">
        <h2 className="text-base font-medium">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nama dan informasi identitas pengguna.
        </p>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">Full name</label>
            <input
              defaultValue="Nusa Hytoria"
              className="mt-1.5 w-full h-9 rounded-lg border border-border bg-surface-1 px-3 text-sm focus:outline-none focus:border-border-strong transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <input
              defaultValue="engineer@ftthtools.my.id"
              className="mt-1.5 w-full h-9 rounded-lg border border-border bg-surface-1 px-3 text-sm focus:outline-none focus:border-border-strong transition-colors"
            />
          </div>
        </div>
      </section>

      {/* Workspace */}
      <section className="rounded-2xl border border-border bg-card/40 p-6 backdrop-blur-sm">
        <h2 className="text-base font-medium">Workspace</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Defaults yang diterapkan pada setiap pemrosesan tool.
        </p>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground">
              Cluster prefix
            </label>
            <input
              defaultValue="JKT-FTTH"
              className="mt-1.5 w-full h-9 rounded-lg border border-border bg-surface-1 px-3 text-sm focus:outline-none focus:border-border-strong transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Distance unit
            </label>
            <select className="mt-1.5 w-full h-9 rounded-lg border border-border bg-surface-1 px-3 text-sm focus:outline-none focus:border-border-strong transition-colors">
              <option>Meters</option>
              <option>Kilometers</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  )
}
