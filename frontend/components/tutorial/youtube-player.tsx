"use client"

import { useState } from "react"
import { Play, VolumeX, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface YouTubePlayerProps {
  videoId: string
  title?: string
  /** Start video immediately when loaded (muted per browser policy) */
  autoplay?: boolean
  className?: string
}

export function YouTubePlayer({
  videoId,
  title = "Tutorial video",
  autoplay = true,
  className,
}: YouTubePlayerProps) {
  const [loaded, setLoaded] = useState(false)
  const [started, setStarted] = useState(autoplay)

  if (!videoId) return null

  // ID video dibersihkan: hanya karakter yang dipakai YouTube. Tanpa ini,
  // nilai yang mengandung ? atau & akan merusak query string embed.
  const safeId = videoId.replace(/[^A-Za-z0-9_-]/g, "")

  const embedUrl = `https://www.youtube.com/embed/${safeId}?${new URLSearchParams({
    autoplay: started ? "1" : "0",
    // Autoplay hanya boleh tanpa suara. Kalau pemutaran dimulai oleh klik
    // pengguna, kebijakan browser tidak lagi mewajibkan mute — sebelumnya
    // nilai ini selalu "1" sehingga video hasil klik pun tetap bisu.
    mute: autoplay ? "1" : "0",
    rel: "0",            // don't show related videos from other channels
    modestbranding: "1", // minimal YouTube branding
    playsinline: "1",    // plays inline on iOS
  }).toString()}`

  return (
    <div className={cn("relative w-full overflow-hidden rounded-xl bg-black/40 border border-white/10", className)}>
      {/* Skeleton loader — hanya saat iframe benar-benar sedang dimuat.
          Tanpa syarat `started`, spinner ini tampil selamanya di balik
          tombol play ketika autoplay dimatikan. */}
      {started && !loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <span className="text-xs text-muted-foreground">Loading video...</span>
          </div>
        </div>
      )}

      {/* Click-to-play overlay (before user starts the video) */}
      {!started && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50 z-20 cursor-pointer group"
          onClick={() => setStarted(true)}
          role="button"
          aria-label="Play tutorial video"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/90 shadow-lg shadow-primary/30 transition-transform group-hover:scale-110">
            <Play className="h-6 w-6 text-white translate-x-0.5" />
          </div>
        </div>
      )}

      {/* 16:9 aspect ratio wrapper */}
      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
        {started && (
          <iframe
            src={embedUrl}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            onLoad={() => setLoaded(true)}
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
      </div>

      {/* Bottom info bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/20">
        <div className="flex items-center gap-2">
          <VolumeX className="h-3 w-3 text-muted-foreground/60" />
          <span className="text-[10px] text-muted-foreground/60">
            Klik ikon 🔊 di video untuk suara
          </span>
        </div>
        <a
          href={`https://www.youtube.com/watch?v=${safeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-primary transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          YouTube
        </a>
      </div>
    </div>
  )
}
