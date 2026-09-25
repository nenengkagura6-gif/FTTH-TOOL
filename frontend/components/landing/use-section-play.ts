"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

/**
 * useLayoutEffect memicu peringatan React saat render di server.
 * Di sana tidak ada layout untuk diukur, jadi jatuh ke useEffect.
 */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

/**
 * Menyalakan dan mematikan gerak satu seksi mengikuti posisinya di layar.
 *
 * Mengembalikan ref untuk elemen <section> dan nilai atribut data-play.
 * Pasang keduanya, lalu CSS yang mengurus sisanya:
 *
 *   <section ref={ref} data-play={dataPlay}>
 *
 * Tiga hal yang membuat pola ini aman, semuanya disengaja:
 *
 * 1. Observer TIDAK di-disconnect setelah terpicu — sama seperti skema
 *    FTTH. Dimatikan saat keluar layar, dinyalakan lagi saat kembali;
 *    itulah yang membuat animasinya hidup ulang tanpa perlu refresh.
 *
 * 2. Nilai awalnya null, dan saat null atribut data-play TIDAK dirender
 *    sama sekali. Semua aturan CSS yang menyembunyikan hidup di dalam
 *    [data-play="false"], jadi tanpa JavaScript tidak ada yang pernah
 *    tersembunyi.
 *
 * 3. threshold 0, bukan pecahan. Seksi landing bisa jauh lebih tinggi
 *    dari viewport; dengan threshold 0.15 pada seksi setinggi 2400px,
 *    browser menunggu 360px terlihat sekaligus — di layar pendek syarat
 *    itu bisa tidak pernah terpenuhi dan animasinya tidak pernah menyala.
 */
export function useSectionPlay<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null)
  const [play, setPlay] = useState<boolean | null>(null)

  useIsomorphicLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") return

    setPlay(false)

    const obs = new IntersectionObserver(
      ([entry]) => setPlay(entry.isIntersecting),
      { threshold: 0 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return {
    ref,
    dataPlay: play === null ? undefined : play ? "true" : "false",
  }
}
