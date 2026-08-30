"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Skema jaringan FTTH yang menggambar dirinya sendiri.
 *
 * Ini satu-satunya elemen "berani" di halaman depan; section lain dijaga
 * tenang. Keunikan sebuah landing page datang dari subjeknya — dan
 * topologi FTTH (feeder dari OLT, FDT, splitter ke FAT, sisir drop ke
 * homepass, di dalam batas cluster) adalah kosakata visual yang tidak akan
 * pernah muncul di landing SaaS mana pun.
 *
 * Catatan teknis
 * --------------
 * • Murni SVG + CSS. Tanpa gambar, tanpa request tambahan.
 * • Garis dipakai `pathLength={1}` sehingga dasharray tidak perlu tahu
 *   panjang asli tiap path.
 * • Animasi diulang setiap kali masuk layar, lewat atribut `data-play`.
 *   Nilai awalnya "true" di markup, jadi kalau JavaScript tidak berjalan
 *   sama sekali, animasinya tetap main sekali saat muat dan berakhir di
 *   keadaan lengkap (fill-mode forwards). Tidak ada jalur kegagalan yang
 *   menyembunyikan konten — berbeda dari pola whileInView + once:true yang
 *   dulu membuat section kosong permanen ketika observer luput memicu.
 * • Warna memakai token tema, jadi ikut benar di mode terang.
 * • prefers-reduced-motion dihormati lewat aturan global di globals.css.
 */

const FDT = { x: 112, y: 240 }
const BRANCH_X = 262
const FAT_X = 410
const FATS = [
  { y: 120, label: "FAT 01", ratio: "1:8", jarak: "±180 m" },
  { y: 240, label: "FAT 02", ratio: "1:8", jarak: "±240 m" },
  { y: 360, label: "FAT 03", ratio: "1:16", jarak: "±310 m" },
]
const COMB_X = 548
const DROP_X = 616
/** Simpangan vertikal tiap homepass dari FAT induknya. */
const HP_OFFSET = [-42, 0, 42]

export function FtthRouteMap({ className }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const [play, setPlay] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") return

    // Dimatikan saat keluar layar, dinyalakan lagi saat kembali — itulah
    // yang membuat animasinya hidup ulang tiap kali di-scroll.
    const io = new IntersectionObserver(
      ([entry]) => setPlay(entry.isIntersecting),
      { threshold: 0.25 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <svg
      ref={ref}
      data-play={play ? "true" : "false"}
      viewBox="0 0 780 480"
      role="img"
      aria-label="Skema jaringan FTTH: feeder dari OLT menuju FDT, bercabang ke tiga FAT dengan splitter, masing-masing melayani tiga homepass di dalam satu batas cluster"
      className={className}
      fill="none"
    >
      <defs>
        <pattern id="rm-grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M 26 0 L 0 0 0 26" stroke="var(--pattern-line)" strokeWidth="1" />
        </pattern>
        <linearGradient id="rm-edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--background)" stopOpacity="1" />
          <stop offset="14%" stopColor="var(--background)" stopOpacity="0" />
          <stop offset="86%" stopColor="var(--background)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--background)" stopOpacity="1" />
        </linearGradient>
        {/* Jalur yang dilalui pulsa cahaya — meniru sinyal di dalam serat */}
        <path id="rm-feeder" d={`M 8 ${FDT.y} H ${FDT.x - 17}`} />
      </defs>

      <rect width="780" height="480" fill="url(#rm-grid)" />

      {/* ---- Batas cluster: bentuk tak beraturan, seperti poligon boundary asli ---- */}
      <path
        className="rm-draw rm-d0"
        pathLength={1}
        d="M 60 62 L 690 44 L 726 250 L 664 438 L 214 452 L 46 336 Z"
        stroke="var(--muted-foreground)"
        strokeOpacity={0.35}
        strokeWidth="1.25"
        strokeDasharray="6 5"
      />
      <text
        className="rm-fade rm-d0"
        x="66" y="46" fontSize="10" fontFamily="var(--font-mono)"
        fill="var(--muted-foreground)" fillOpacity={0.65} letterSpacing="0.12em"
      >
        BOUNDARY CLUSTER
      </text>

      <g stroke="var(--primary)" strokeLinecap="round">
        {/* Feeder dari OLT */}
        <path className="rm-draw rm-d0" pathLength={1} strokeWidth="2.5" strokeOpacity={0.55}
              d={`M 8 ${FDT.y} H ${FDT.x - 17}`} />

        {/* Trunk FDT -> titik cabang */}
        <path className="rm-draw rm-d1" pathLength={1} strokeWidth="2.5"
              d={`M ${FDT.x + 17} ${FDT.y} H ${BRANCH_X}`} />

        {/* Cabang ke tiap FAT */}
        {FATS.map((f, i) => {
          const naik = f.y < FDT.y
          const d =
            f.y === FDT.y
              ? `M ${BRANCH_X} ${FDT.y} H ${FAT_X - 13}`
              : `M ${BRANCH_X} ${FDT.y} V ${naik ? f.y + 14 : f.y - 14} Q ${BRANCH_X} ${f.y} ${BRANCH_X + 14} ${f.y} H ${FAT_X - 13}`
          return (
            <path key={`br-${i}`} className="rm-draw rm-d2" pathLength={1}
                  strokeWidth="2" d={d} />
          )
        })}

        {/* Batang sisir drop */}
        {FATS.map((f, i) => (
          <path key={`comb-${i}`} className="rm-draw rm-d3" pathLength={1}
                strokeWidth="1.5" strokeOpacity={0.5}
                d={`M ${FAT_X + 13} ${f.y} H ${COMB_X}`} />
        ))}

        {/* Drop ke tiap homepass */}
        {FATS.map((f, fi) =>
          HP_OFFSET.map((dy, di) => (
            <path key={`hp-${fi}-${di}`} className="rm-draw rm-d4" pathLength={1}
                  strokeWidth="1.25" strokeOpacity={0.35}
                  d={`M ${COMB_X} ${f.y} Q ${COMB_X + 26} ${f.y} ${COMB_X + 26} ${f.y + dy} H ${DROP_X}`} />
          ))
        )}
      </g>

      {/* ---- Pulsa cahaya menyusuri feeder: sinyal masuk ke FDT ---- */}
      <circle className="rm-pulse" r="3.5" fill="var(--primary)" />

      {/* ---- Node ---- */}
      <g>
        {/* FDT — persegi, perangkat aktif */}
        <g className="rm-pop rm-d1">
          <rect x={FDT.x - 16} y={FDT.y - 16} width="32" height="32" rx="5"
                fill="var(--background)" stroke="var(--primary)" strokeWidth="2.5" />
          <rect x={FDT.x - 6} y={FDT.y - 6} width="12" height="12" rx="2"
                fill="var(--primary)" />
        </g>

        {/* FAT — lingkaran dengan inti */}
        {FATS.map((f, i) => (
          <g key={`fat-${i}`} className="rm-pop rm-d2">
            <circle cx={FAT_X} cy={f.y} r="12" fill="var(--background)"
                    stroke="var(--primary)" strokeWidth="2" />
            <circle cx={FAT_X} cy={f.y} r="4" fill="var(--primary)" />
          </g>
        ))}

        {/* Homepass — titik kecil berongga */}
        {FATS.map((f, fi) =>
          HP_OFFSET.map((dy, di) => (
            <circle key={`hpn-${fi}-${di}`} className="rm-pop rm-d4"
                    cx={DROP_X + 6} cy={f.y + dy} r="4.5"
                    fill="var(--background)" stroke="var(--primary)"
                    strokeWidth="1.5" strokeOpacity={0.7} />
          ))
        )}
      </g>

      {/* ---- Anotasi teknis ---- */}
      <g fontFamily="var(--font-mono)" fill="var(--muted-foreground)">
        <text className="rm-fade rm-d0" x="10" y={FDT.y - 12} fontSize="9"
              fillOpacity={0.6} letterSpacing="0.1em">OLT</text>

        <text className="rm-fade rm-d1" x={FDT.x} y={FDT.y + 40} fontSize="12"
              textAnchor="middle" letterSpacing="0.08em">FDT 01</text>
        <text className="rm-fade rm-d1" x={FDT.x} y={FDT.y + 54} fontSize="9"
              textAnchor="middle" fillOpacity={0.6} letterSpacing="0.1em">48 CORE</text>

        {FATS.map((f, i) => (
          <g key={`lbl-${i}`}>
            <text className="rm-fade rm-d2" x={FAT_X} y={f.y - 22} fontSize="10.5"
                  textAnchor="middle" letterSpacing="0.08em">{f.label}</text>
            <text className="rm-fade rm-d3" x={FAT_X + 70} y={f.y - 8} fontSize="9"
                  textAnchor="middle" fillOpacity={0.55} letterSpacing="0.08em">
              {f.ratio}
            </text>
            <text className="rm-fade rm-d3" x={(BRANCH_X + FAT_X) / 2} y={f.y - 8}
                  fontSize="8.5" textAnchor="middle" fillOpacity={0.45}
                  letterSpacing="0.06em">{f.jarak}</text>
          </g>
        ))}

        <text className="rm-fade rm-d4" x={DROP_X + 20} y={FATS[0].y + HP_OFFSET[0] + 4}
              fontSize="9.5" fillOpacity={0.7} letterSpacing="0.06em">HP-001</text>
        <text className="rm-fade rm-d4" x={DROP_X + 20} y={FATS[2].y + HP_OFFSET[2] + 4}
              fontSize="9.5" fillOpacity={0.7} letterSpacing="0.06em">HP-009</text>

        {/* Koordinat nyata — detail domain yang tidak ada di template mana pun */}
        <text className="rm-fade rm-d4" x="62" y="440" fontSize="9.5"
              fillOpacity={0.55} letterSpacing="0.04em">
          -6.702440&#176;, 108.455580&#176;
        </text>
      </g>

      <rect width="780" height="480" fill="url(#rm-edge)" pointerEvents="none" />
    </svg>
  )
}
