import type { Metadata } from "next"
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import Script from "next/script"
import { AppProviders } from "@/components/app-providers"
import "./globals.css"

// Display. Grotesque variabel dengan sumbu optical-size & width — dirancang
// untuk editorial, jadi di ukuran besar terbaca mahal dan berkarakter tanpa
// jadi gimmick. Masih jarang dipakai di produksi (rilis 2023).
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
  // Hanya sumbu opsz. Menambah "wdth" membengkakkan berkas variabel
  // sekitar 60 KB untuk perbedaan lebar yang nyaris tidak terlihat.
  axes: ["opsz"],
})

// Body. Tenang dan sedikit ramping — kuat di ukuran kecil untuk tabel padat,
// dan tidak berebut perhatian dengan display face.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

export const metadata: Metadata = {
  title: "FTTH Tool — Modern Telecom Engineering Automation",
  description:
    "Automate KML, Database, and document workflows for FTTH and telecom engineering. Built for fiber engineers who ship faster.",
  metadataBase: new URL("https://ftthtools.my.id"),
  openGraph: {
    title: "FTTH Tool — Modern Telecom Engineering Automation",
    description:
      "Automate KML, Database, and document workflows for FTTH and telecom engineering.",
    type: "website",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
}

export const viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <body 
        className={`${instrumentSans.variable} ${bricolage.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen bg-background text-foreground`}
        suppressHydrationWarning
      >
        <AppProviders>{children}</AppProviders>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
