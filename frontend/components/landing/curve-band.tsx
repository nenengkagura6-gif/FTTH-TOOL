/**
 * Pita kurva — primitif `kurva` dibuat kelihatan.
 *
 * Sebelumnya kedua kurva easing cuma jadi token CSS: benar secara
 * teknis, tapi tidak ada apa pun yang bisa dilihat. Di sini kurvanya
 * digambar betulan sebagai jalur serat yang menggambar dirinya sendiri,
 * dengan pulsa cahaya berjalan menyusurinya.
 *
 * Ketiga jalur memakai easing yang BERBEDA supaya bedanya terbaca:
 * yang pertama dan ketiga memakai kurva "melesat lalu mendarat", yang
 * tengah memakai kurva "berat di kedua ujung". Perhatikan pulsanya —
 * yang tengah menahan sebentar, menyambar, lalu berhenti pelan.
 *
 * Pulsa memakai offset-path dengan d yang PERSIS sama seperti path-nya,
 * konvensi yang sama dengan .rm-pulse pada skema FTTH.
 *
 * viewBox sengaja dibiarkan meregang (preserveAspectRatio none) — ini
 * elemen hiasan selebar layar, bukan diagram yang proporsinya penting.
 */

const ROUTES = [
  {
    d: "M0,96 C160,96 220,26 420,26 S700,104 900,52 S1120,20 1200,34",
    delay: "0s",
    dur: "11s",
    ease: "var(--ease-entrance)",
    width: 1.6,
    opacity: 0.9,
  },
  {
    d: "M0,64 C220,64 300,120 520,120 S820,34 1040,78 S1160,104 1200,96",
    delay: "1.4s",
    dur: "13s",
    ease: "var(--ease-curtain)",
    width: 1.2,
    opacity: 0.6,
  },
  {
    d: "M0,130 C260,130 340,70 600,84 S960,132 1200,112",
    delay: "2.9s",
    dur: "15s",
    ease: "var(--ease-entrance)",
    width: 1,
    opacity: 0.4,
  },
]

export function CurveBand({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1200 160"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      {ROUTES.map((r, i) => (
        <g key={i}>
          <path
            className="curve-track"
            d={r.d}
            stroke="currentColor"
            strokeWidth={r.width}
            strokeLinecap="round"
            opacity={r.opacity * 0.18}
          />
          <path
            className="curve-draw"
            d={r.d}
            pathLength={1}
            stroke="currentColor"
            strokeWidth={r.width}
            strokeLinecap="round"
            opacity={r.opacity}
            style={{
              animationDuration: r.dur,
              animationDelay: r.delay,
              animationTimingFunction: r.ease,
            }}
          />
          <circle
            className="curve-pulse"
            r={r.width + 1.4}
            fill="currentColor"
            style={{
              offsetPath: `path("${r.d}")`,
              animationDuration: r.dur,
              animationDelay: r.delay,
              animationTimingFunction: r.ease,
            }}
          />
        </g>
      ))}
    </svg>
  )
}
