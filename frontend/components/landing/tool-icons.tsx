/**
 * Ikon kartu tool yang bisa bergerak.
 *
 * Bentuknya disalin persis dari lucide-react v0.564 (Map, ShieldCheck,
 * ChartLine, Scissors, Activity, Palette, DraftingCompass, Database),
 * jadi tampilan diamnya sama sekali tidak berubah dari sebelumnya.
 * Yang ditambahkan hanya SATU hal: tiap bagian yang perlu bergerak
 * diberi kelas sendiri (`ti-*`) supaya CSS bisa menggerakkannya
 * terpisah — hal yang tidak mungkin dilakukan pada komponen lucide
 * karena isi <svg>-nya tidak bisa disentuh dari luar.
 *
 * Geraknya sendiri didefinisikan di app/globals.css, dan HANYA aktif
 * saat kartu induknya (.tool-card) di-hover.
 *
 * Garis yang digambar memakai pathLength={1} — konvensi yang sama
 * dengan skema FTTH di ftth-route-map.tsx — sehingga stroke-dasharray
 * tidak perlu tahu panjang asli tiap path.
 */

import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement> & { className?: string }

/** Atribut dasar lucide. Dipisah supaya kedelapan ikon tidak bisa melenceng. */
function Svg({ className, children, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

/* KML to BOQ — lipatan peta digambar turun bergantian, seperti lembar
   yang dibentangkan sebelum dihitung isinya. */
export function MapIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
      <path className="ti-draw ti-d0" pathLength={1} d="M9 3.236v15" />
      <path className="ti-draw ti-d1" pathLength={1} d="M15 5.764v15" />
    </Svg>
  )
}

/* KML Duplicate Checker — centangnya digambar sendiri. Gerakan
   "lolos verifikasi", bukan hiasan. */
export function ShieldCheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path className="ti-draw ti-d1" pathLength={1} d="m9 12 2 2 4-4" />
    </Svg>
  )
}

/* OTDR Trace Analyzer — garis trace digambar kiri ke kanan, persis
   seperti trace yang sedang dibaca dari file SOR. Sumbunya diam. */
export function ChartLineIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path className="ti-draw ti-d0" pathLength={1} d="m19 9-5 5-4-4-3 3" />
    </Svg>
  )
}

/* Splice Manager — dua bilah menutup lalu membuka. Titik silangnya
   tepat di (12,12), jadi kedua grup berputar pada poros yang sama. */
export function ScissorsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <g className="ti-snip-a">
        <circle cx="6" cy="6" r="3" />
        <path d="M8.12 8.12 12 12" />
        <path d="M14.8 14.8 20 20" />
      </g>
      <g className="ti-snip-b">
        <circle cx="6" cy="18" r="3" />
        <path d="M20 4 8.12 15.88" />
      </g>
    </Svg>
  )
}

/* OPM Link Budget — sinyal berjalan menyusuri jalur. Garis dasarnya
   tetap utuh; yang bergerak adalah salinan tipis di atasnya, jadi
   ikonnya tidak pernah terlihat putus. */
export function ActivityIcon(props: IconProps) {
  const d =
    "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"
  return (
    <Svg {...props}>
      <path d={d} />
      <path className="ti-run" pathLength={1} d={d} />
    </Svg>
  )
}

/* Fiber Color Code — keempat titik warna menyala berurutan, seperti
   mengurut nomor core. */
export function PaletteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" />
      <circle className="ti-pop ti-d0" cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle className="ti-pop ti-d1" cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle className="ti-pop ti-d2" cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle className="ti-pop ti-d3" cx="6.5" cy="12.5" r=".5" fill="currentColor" />
    </Svg>
  )
}

/* CAD & GIS Converter — jangka mengayun pada kepalanya di (12,5)
   sambil busurnya digambar. Gerakan menggambar, bukan sekadar goyang. */
export function DraftingCompassIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <g className="ti-swing">
        <path d="m12.99 6.74 1.93 3.44" />
        <path d="m21 21-2.16-3.84" />
        <path d="m3 21 8.02-14.26" />
      </g>
      <path className="ti-draw ti-d1" pathLength={1} d="M19.136 12a10 10 0 0 1-14.271 0" />
      <circle cx="12" cy="5" r="2" />
    </Svg>
  )
}

/* KML to Database HP — lapisan database menumpuk naik satu per satu,
   dari dasar ke tutup. */
export function DatabaseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path className="ti-rise ti-d0" d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path className="ti-rise ti-d1" d="M3 12A9 3 0 0 0 21 12" />
      <ellipse className="ti-rise ti-d2" cx="12" cy="5" rx="9" ry="3" />
    </Svg>
  )
}
