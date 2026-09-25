"use client"

/**
 * Judul yang huruf-hurufnya masuk berurutan (primitif `char-in`).
 *
 * Dipecah per KATA dulu, baru per huruf. Tanpa pembungkus kata, tiap
 * huruf menjadi inline-block dan browser boleh memutus baris di antara
 * dua huruf — judul panjang bisa patah di tengah kata.
 *
 * Spasi tetap berupa text node biasa, bukan span, supaya pemenggalan
 * baris berjalan normal.
 *
 * Animasinya sendiri ada di kelas .anim-char-in (app/globals.css) dan
 * jalan sendiri begitu elemennya lahir. Kalau ada leluhur ber-data-play,
 * ia juga ikut mengulang tiap kali seksinya masuk layar lagi.
 */
export function CharIn({ text, step = 26 }: { text: string; step?: number }) {
  let i = 0
  return (
    <>
      {text.split(/(\s+)/).map((token, ti) => {
        if (/^\s+$/.test(token)) return token
        return (
          <span key={ti} className="anim-char-word">
            {token.split("").map((ch) => (
              <span
                key={i}
                className="anim-char-in"
                style={{ animationDelay: `${i++ * step}ms` }}
              >
                {ch}
              </span>
            ))}
          </span>
        )
      })}
    </>
  )
}
