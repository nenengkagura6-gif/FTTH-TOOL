import Link from "next/link"
import { ShieldAlert } from "lucide-react"

export const metadata = {
  title: "Akun Ditangguhkan",
  robots: { index: false, follow: false },
}

/**
 * Tujuan redirect middleware untuk profil dengan is_active = false.
 * Sebelumnya rute ini tidak pernah dibuat, jadi penangguhan akun mendarat
 * di 404 — user tidak pernah tahu apa yang terjadi pada akunnya.
 */
export default function AccountSuspendedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card/40 backdrop-blur-sm p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-danger/10 ring-1 ring-danger/20">
          <ShieldAlert className="h-6 w-6 text-danger" />
        </div>

        <h1 className="mt-5 text-xl font-semibold tracking-tight">Akun Anda ditangguhkan</h1>

        <p className="mt-3 text-sm text-muted-foreground">
          Akses ke seluruh tool dihentikan sementara. Penangguhan biasanya terjadi karena
          pelanggaran ketentuan layanan atau aktivitas yang tidak wajar pada akun.
        </p>

        <p className="mt-3 text-sm text-muted-foreground">
          Kalau menurut Anda ini keliru, hubungi kami dan sebutkan alamat email akun Anda.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            href="/contact"
            className="text-xs bg-primary text-primary-foreground px-4 py-2.5 rounded-xl font-semibold hover:bg-primary/90"
          >
            Hubungi dukungan
          </Link>
          <Link
            href="/"
            className="text-xs text-muted-foreground px-4 py-2.5 rounded-xl border border-border hover:bg-surface-2"
          >
            Kembali ke beranda
          </Link>
        </div>
      </div>
    </main>
  )
}
