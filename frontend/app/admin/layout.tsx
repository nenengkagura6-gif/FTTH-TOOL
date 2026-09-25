import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { Toaster } from "@/components/ui/sonner"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardShell>
      {children}
      {/* Panel admin punya banyak aksi yang bisa gagal di sisi database
          (RLS, penjagaan admin terakhir, langganan kedaluwarsa). alert()
          memblokir seluruh halaman untuk tiap satu pesan; toast tidak. */}
      <Toaster position="top-right" richColors closeButton />
    </DashboardShell>
  )
}
