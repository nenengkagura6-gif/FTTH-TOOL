/**
 * Peta rute FTTH yang menggambar dirinya sendiri.
 *
 * Ini satu-satunya elemen "berani" di halaman depan; semua section lain
 * dijaga tetap tenang. Alasannya sederhana: keunikan sebuah landing page
 * datang dari subjeknya, bukan dari efek. Geometri rute fiber — trunk dari
 * FDT, cabang ke FAT, sisir drop ke homepass — adalah kosakata visual yang
 * tidak akan pernah muncul di landing SaaS mana pun.
 *
 * Catatan teknis:
 *  - Murni SVG + CSS. Tidak ada JavaScript, tidak ada gambar, tidak ada
 *    request tambahan. Bobotnya hanya markup.
 *  - Garis digambar dengan pathLength="1", jadi dasharray tidak perlu tahu
 *    panjang asli tiap path.
 *  - Animasi berjalan SEKALI lalu berhenti (fill-mode forwards, tanpa
 *    iterate). Latar yang berdenyut terus adalah salah satu tanda paling
 *    khas halaman generik.
 *  - Semua warna memakai token tema, jadi ikut benar di mode terang.
 *  - Properti `opacity` dipakai oleh animasi, jadi peredupan visual
 *    memakai fill-opacity / stroke-opacity agar tidak saling menimpa.
 *  - Aturan prefers-reduced-motion global di globals.css memangkas durasi
 *    ke ~0, dan karena fill-mode forwards, hasilnya langsung tampil utuh.
 */

const NODE_FDT = { x: 88, y: 210 }
const FAT_1 = { x: 392, y: 118 }
const FAT_2 = { x: 392, y: 302 }

/** Sisir drop homepass di kanan tiap FAT. */
const HP_1 = [70, 118, 166]
const HP_2 = [254, 302, 350]

export function FtthRouteMap({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 720 420"
      role="img"
      aria-label="Skema jaringan FTTH: satu FDT bercabang ke dua FAT, masing-masing melayani tiga homepass"
      className={className}
      fill="none"
    >
      <defs>
        {/* Grid teknis — mengacu pada kertas kerja drafter, bukan hiasan */}
        <pattern id="rm-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path
            d="M 24 0 L 0 0 0 24"
            stroke="var(--pattern-line)"
            strokeWidth="1"
            fill="none"
          />
        </pattern>
        <linearGradient id="rm-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--background)" stopOpacity="1" />
          <stop offset="18%" stopColor="var(--background)" stopOpacity="0" />
          <stop offset="82%" stopColor="var(--background)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--background)" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="720" height="420" fill="url(#rm-grid)" />

      <g className="rm-lines" stroke="var(--primary)" strokeLinecap="round">
        {/* Trunk FDT -> titik cabang */}
        <path className="rm-draw rm-d0" pathLength={1} strokeWidth="2.5"
              d={`M ${NODE_FDT.x + 14} ${NODE_FDT.y} H 248`} />

        {/* Cabang ke FAT 01 (naik) dan FAT 02 (turun) */}
        <path className="rm-draw rm-d1" pathLength={1} strokeWidth="2"
              d={`M 248 ${NODE_FDT.y} V ${FAT_1.y + 10} Q 248 ${FAT_1.y} 258 ${FAT_1.y} H ${FAT_1.x - 11}`} />
        <path className="rm-draw rm-d1" pathLength={1} strokeWidth="2"
              d={`M 248 ${NODE_FDT.y} V ${FAT_2.y - 10} Q 248 ${FAT_2.y} 258 ${FAT_2.y} H ${FAT_2.x - 11}`} />

        {/* Batang sisir drop */}
        <path className="rm-draw rm-d2" pathLength={1} strokeWidth="1.5" opacity={0.55}
              d={`M ${FAT_1.x + 11} ${FAT_1.y} H 556`} />
        <path className="rm-draw rm-d2" pathLength={1} strokeWidth="1.5" opacity={0.55}
              d={`M ${FAT_2.x + 11} ${FAT_2.y} H 556`} />

        {/* Drop ke tiap homepass */}
        {HP_1.map((y) => (
          <path key={`h1-${y}`} className="rm-draw rm-d3" pathLength={1}
                strokeWidth="1.25" opacity={0.4}
                d={`M 556 ${FAT_1.y} Q 580 ${FAT_1.y} 580 ${y} H 606`} />
        ))}
        {HP_2.map((y) => (
          <path key={`h2-${y}`} className="rm-draw rm-d3" pathLength={1}
                strokeWidth="1.25" opacity={0.4}
                d={`M 556 ${FAT_2.y} Q 580 ${FAT_2.y} 580 ${y} H 606`} />
        ))}
      </g>

      {/* ---- Node ---- */}
      <g className="rm-nodes">
        {/* FDT: persegi — perangkat aktif, bukan titik pasif */}
        <g className="rm-pop rm-d0">
          <rect
            x={NODE_FDT.x - 13} y={NODE_FDT.y - 13} width="26" height="26" rx="4"
            fill="var(--background)" stroke="var(--primary)" strokeWidth="2.5"
          />
          <rect
            x={NODE_FDT.x - 5} y={NODE_FDT.y - 5} width="10" height="10" rx="1.5"
            fill="var(--primary)"
          />
        </g>

        {/* FAT: lingkaran */}
        {[FAT_1, FAT_2].map((n, i) => (
          <g key={`fat-${i}`} className={`rm-pop rm-d${i === 0 ? 1 : 1}`}>
            <circle cx={n.x} cy={n.y} r="10"
                    fill="var(--background)" stroke="var(--primary)" strokeWidth="2" />
            <circle cx={n.x} cy={n.y} r="3.5" fill="var(--primary)" />
          </g>
        ))}

        {/* Homepass: titik kecil berongga */}
        {[...HP_1, ...HP_2].map((y, i) => (
          <circle key={`hp-${i}`} className="rm-pop rm-d3"
                  cx="612" cy={y} r="4.5"
                  fill="var(--background)" stroke="var(--primary)"
                  strokeWidth="1.5" strokeOpacity={0.75} />
        ))}
      </g>

      {/* ---- Label: mono, kecil, tenang ---- */}
      <g className="rm-labels" fontFamily="var(--font-mono)" fill="var(--muted-foreground)">
        <text x={NODE_FDT.x} y={NODE_FDT.y + 40} fontSize="12" textAnchor="middle"
              className="rm-fade rm-d0" letterSpacing="0.08em">FDT 01</text>

        <text x={FAT_1.x} y={FAT_1.y - 22} fontSize="11" textAnchor="middle"
              className="rm-fade rm-d1" letterSpacing="0.08em">FAT 01</text>
        <text x={FAT_2.x} y={FAT_2.y + 30} fontSize="11" textAnchor="middle"
              className="rm-fade rm-d1" letterSpacing="0.08em">FAT 02</text>

        <text x="632" y={HP_1[0] + 4} fontSize="10" className="rm-fade rm-d3"
              fillOpacity={0.8} letterSpacing="0.06em">HP-001</text>
        <text x="632" y={HP_2[2] + 4} fontSize="10" className="rm-fade rm-d3"
              fillOpacity={0.8} letterSpacing="0.06em">HP-006</text>

        {/* Koordinat asli — detail domain yang tidak akan ada di template */}
        <text x={NODE_FDT.x - 14} y="386" fontSize="10" className="rm-fade rm-d3"
              fillOpacity={0.6} letterSpacing="0.04em">
          -6.702440&#176;, 108.455580&#176;
        </text>
      </g>

      {/* Tepi kiri-kanan dilembutkan agar menyatu dengan halaman */}
      <rect width="720" height="420" fill="url(#rm-fade)" pointerEvents="none" />
    </svg>
  )
}
