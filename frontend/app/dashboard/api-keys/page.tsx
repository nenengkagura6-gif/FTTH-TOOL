"use client"

/**
 * Halaman API Keys dinonaktifkan.
 *
 * Backend TIDAK memvalidasi API key sama sekali — tidak ada satu pun
 * pemakaian validate_api_key() di app/. Satu-satunya pemanggilnya adalah
 * lib/api-auth.ts, kode mati yang tidak pernah dieksekusi karena
 * next.config.mjs memakai output: 'export' (tidak ada server).
 *
 * Versi sebelumnya membiarkan pengguna membuat kunci, menampilkannya sekali,
 * lalu menyimpan hash-nya — padahal kunci itu tidak bisa dipakai untuk apa
 * pun, dan halamannya tidak memberi tahu hal tersebut.
 *
 * Implementasi asli masih tersimpan di riwayat git. Untuk menghidupkannya
 * kembali, backend perlu:
 *   1. Membaca header X-API-Key pada setiap endpoint
 *   2. Meng-hash-nya (SHA-256) dan memanggil validate_api_key()
 *   3. Memakai user_id hasilnya sebagai identitas, seperti require_user_id()
 * Setelah itu, kembalikan entri navigasi di lib/site-config.ts.
 */

import Link from "next/link"
import { KeyRound, ArrowLeft } from "lucide-react"

export default function ApiKeysPage() {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-secondary">
          <KeyRound className="h-6 w-6 text-muted-foreground" />
        </div>

        <h1 className="text-xl font-semibold">Akses API belum tersedia</h1>

        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Fitur API key sedang dalam pengembangan dan belum aktif di server.
          Halaman ini kami nonaktifkan agar tidak ada kunci yang dibuat lalu
          ternyata tidak bisa dipakai.
        </p>

        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Untuk saat ini, semua tool dapat digunakan langsung lewat dashboard.
        </p>

        <Link
          href="/dashboard"
          className="mt-7 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  )
}
