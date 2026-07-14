import type { Metadata } from "next"
import { Outfit, Syne, JetBrains_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import Script from "next/script"
import { AppProviders } from "@/components/app-providers"
import "./globals.css"

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
})

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

export const metadata: Metadata = {
  title: "FTTH Tool — Modern Telecom Engineering Automation",
  description:
    "Automate KML, Database, and document workflows for FTTH and telecom engineering. Built for fiber engineers who ship faster.",
  generator: "v0.app",
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
        className={`${outfit.variable} ${syne.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen bg-background text-foreground`}
        suppressHydrationWarning
      >
        <AppProviders>{children}</AppProviders>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
