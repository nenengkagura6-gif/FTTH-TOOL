/**
 * Device fingerprint untuk pembatasan jumlah perangkat.
 *
 * Versi sebelumnya (prefix "dr_") hanya memakai satu sinyal — hasil render
 * canvas — lalu memampatkannya jadi hash 32-bit. Masalahnya bukan lebar
 * hash-nya, melainkan INPUT-nya: dua laptop berbeda dengan kombinasi
 * OS + browser + GPU yang sama menghasilkan canvas dataURL yang persis
 * identik, sehingga hash-nya juga identik. Akibatnya pengguna yang tidak
 * saling kenal bisa terbaca sebagai satu perangkat yang sama, lalu terkena
 * aturan anti-abuse paket gratis dan terkunci tanpa sebab.
 *
 * Versi ini (prefix "dv2_") menggabungkan beberapa sinyal independen —
 * canvas, GPU lewat WebGL, dimensi layar, zona waktu, jumlah core, dan
 * platform — sehingga dua mesin dengan spesifikasi mirip masih bisa
 * dibedakan oleh zona waktu, resolusi, atau jumlah core-nya.
 *
 * Batas yang jujur: fingerprint browser TIDAK BISA membedakan dua mesin
 * yang benar-benar identik dalam segala hal. Karena itu sinyal yang gagal
 * dikumpulkan ditandai, dan fungsi RPC di server melewati aturan
 * anti-abuse ketika keyakinannya rendah — lebih baik meloloskan penyalahguna
 * sesekali daripada mengunci pengguna yang sah.
 */

/** Naikkan kalau susunan sinyal berubah, supaya hash lama bisa dibedakan. */
const FP_VERSION = "dv2"

/** Ambil satu sinyal dengan aman; kegagalan tidak boleh menjatuhkan yang lain. */
function safe(fn: () => string | number | undefined | null): string {
  try {
    const v = fn()
    return v === undefined || v === null ? "" : String(v)
  } catch {
    return ""
  }
}

/** Hasil render canvas — dipengaruhi GPU, driver, dan font rendering OS. */
function canvasSignal(): string {
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

  ctx.textBaseline = "top"
  ctx.font = "14px 'Arial', 'Times New Roman', sans-serif"
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = "#f60"
  ctx.fillRect(125, 1, 62, 20)
  ctx.fillStyle = "#069"
  ctx.fillText("FTTH-Tool, Fingerprint!", 2, 15)
  ctx.fillStyle = "rgba(102, 204, 0, 0.7)"
  ctx.fillText("Device_Lock_Security", 4, 17)
  ctx.shadowBlur = 10
  ctx.shadowColor = "blue"
  ctx.fillStyle = "red"
  ctx.fillRect(20, 20, 10, 10)

  return canvas.toDataURL()
}

/** Vendor & model GPU. Pembeda kuat antar mesin dengan OS/browser sama. */
function webglSignal(): string {
  const canvas = document.createElement("canvas")
  const gl =
    (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null
  if (!gl) return ""

  const parts: string[] = []
  const dbg = gl.getExtension("WEBGL_debug_renderer_info")
  if (dbg) {
    parts.push(String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) ?? ""))
    parts.push(String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? ""))
  }
  parts.push(String(gl.getParameter(gl.VERSION) ?? ""))
  parts.push(String(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? ""))
  return parts.join("|")
}

/**
 * Hash FNV-1a 128-bit, dirakit dari empat jalur 32-bit dengan offset basis
 * berbeda. Cukup lebar sehingga tabrakan hash sendiri bisa diabaikan —
 * yang tersisa hanya tabrakan karena input yang memang sama.
 */
function hash128(input: string): string {
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]
  const out: string[] = []

  for (const seed of seeds) {
    let h = seed >>> 0
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i)
      // FNV prime 16777619, dikalikan tanpa overflow 53-bit
      h = Math.imul(h, 0x01000193) >>> 0
    }
    out.push(h.toString(16).padStart(8, "0"))
  }
  return out.join("")
}

export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server"

  const signals: string[] = [
    safe(canvasSignal),
    safe(webglSignal),
    safe(() => `${screen.width}x${screen.height}x${screen.colorDepth}`),
    safe(() => screen.availWidth + "x" + screen.availHeight),
    safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    safe(() => new Date().getTimezoneOffset()),
    safe(() => navigator.language),
    safe(() => (navigator.languages || []).join(",")),
    safe(() => navigator.hardwareConcurrency),
    safe(() => (navigator as any).deviceMemory),
    safe(() => (navigator as any).userAgentData?.platform || navigator.platform),
    safe(() => navigator.maxTouchPoints),
    safe(() => devicePixelRatio),
  ]

  // Canvas dan WebGL adalah satu-satunya sinyal berentropi tinggi di sini.
  // Sisanya — layar, zona waktu, bahasa, jumlah core — berentropi rendah:
  // ribuan pengguna di wilayah yang sama mudah memiliki kombinasi identik.
  // Jadi menghitung jumlah sinyal saja tidak cukup; kalau kedua sinyal kuat
  // gagal (browser privasi yang memblokir canvas & WebGL), identitasnya
  // ditandai lemah supaya server melewati pembatasan alih-alih mengunci
  // orang berdasarkan tebakan.
  const hasStrongSignal = signals[0].length > 0 || signals[1].length > 0
  const collected = signals.filter((s) => s.length > 0).length

  if (!hasStrongSignal || collected < 6) return "lowconfidence"

  return `${FP_VERSION}_${hash128(signals.join("~"))}`
}

export function getDeviceTypeInfo(): { type: "mobile" | "desktop"; name: string } {
  if (typeof window === "undefined") return { type: "desktop", name: "Server" }
  const ua = navigator.userAgent
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
  if (isMobile) {
    if (/iPhone|iPad|iPod/i.test(ua)) return { type: "mobile", name: "iOS Device (iPhone/iPad)" }
    if (/Android/i.test(ua)) return { type: "mobile", name: "Android Smartphone" }
    return { type: "mobile", name: "Mobile Device" }
  }
  if (/Macintosh/i.test(ua)) return { type: "desktop", name: "Mac (Laptop/PC)" }
  if (/Windows/i.test(ua)) return { type: "desktop", name: "Windows (Laptop/PC)" }
  if (/Linux/i.test(ua)) return { type: "desktop", name: "Linux (Laptop/PC)" }
  return { type: "desktop", name: "Desktop Computer" }
}
