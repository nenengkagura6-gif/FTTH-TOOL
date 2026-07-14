"use client"

import React, { useState, useEffect, use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Check, Minus, Loader2, CreditCard, QrCode, Clipboard, CheckCircle2, ShieldAlert } from "lucide-react"
import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { PageHeader } from "@/components/site/page-header"
import { cn } from "@/lib/utils"
import { translations } from "@/lib/translations"
import { useAuth } from "@/components/auth/auth-provider"
import { getSupabaseClient } from "@/lib/supabase/client"

interface PageProps {
  params: Promise<{
    locale: string
  }>
}

export default function PricingPage({ params }: PageProps) {
  const { locale } = use(params)
  const t = translations[locale as "en" | "id"] || translations.en

  const { user, profile } = useAuth()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number>(2) // Default to Pro plan (index 2)

  // Bank Details configuration
  const BANK_NAME = process.env.NEXT_PUBLIC_BANK_NAME || "BRI"
  const BANK_ACCOUNT = process.env.NEXT_PUBLIC_BANK_ACCOUNT || "416201028329533"
  const BANK_HOLDER = process.env.NEXT_PUBLIC_BANK_HOLDER || "GINA SHAILA"

  // Checkout Modal State
  const [showCheckout, setShowCheckout] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; price: string; target: string } | null>(null)
  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "processing" | "success" | "error">("idle")
  const [copied, setCopied] = useState(false)

  // Payment Confirmation Form State
  const [senderName, setSenderName] = useState("")
  const [senderBank, setSenderBank] = useState("")
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [validationError, setValidationError] = useState("")

  // Loaded Payment Request States
  const [pendingPayment, setPendingPayment] = useState<any>(null)
  const [lastRejectedPayment, setLastRejectedPayment] = useState<any>(null)
  const [loadingPaymentCheck, setLoadingPaymentCheck] = useState(true)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!user) {
      setLoadingPaymentCheck(false)
      return
    }
    const checkPaymentStatus = async () => {
      try {
        const supabase = getSupabaseClient()
        
        // Check for pending payment confirmation
        const { data: pendingData, error: pendingErr } = await supabase
          .from('payment_confirmations')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)

        if (!pendingErr && pendingData && pendingData.length > 0) {
          setPendingPayment(pendingData[0])
        } else {
          setPendingPayment(null)
          
          // Check for latest rejected one to show warning/note
          const { data: rejectedData, error: rejectedErr } = await supabase
            .from('payment_confirmations')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'rejected')
            .order('created_at', { ascending: false })
            .limit(1)

          if (!rejectedErr && rejectedData && rejectedData.length > 0) {
            setLastRejectedPayment(rejectedData[0])
          } else {
            setLastRejectedPayment(null)
          }
        }
      } catch (err) {
        console.error("Error checking payment status:", err)
      } finally {
        setLoadingPaymentCheck(false)
      }
    }
    checkPaymentStatus()
  }, [user, showCheckout])

  const handleOpenCheckout = (planName: string, price: string, targetPlan: string) => {
    if (!user) {
      router.push(`/signup?plan=${targetPlan}`)
      return
    }
    setSelectedPlan({ name: planName, price, target: targetPlan })
    setCheckoutStatus("idle")
    setSenderName("")
    setSenderBank("")
    setReceiptFile(null)
    setValidationError("")
    setShowCheckout(true)
  }

  const handleDowngradeToFree = async () => {
    if (!user) return
    setCheckoutStatus("processing")
    try {
      const supabase = getSupabaseClient()
      const { error } = await supabase
        .from('profiles')
        .update({ 
          plan: 'free',
          quota_limit: 50
        })
        .eq('id', user.id)

      if (error) throw error

      // Cancel any active subscriptions
      await supabase
        .from('subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('status', 'active')

      setCheckoutStatus("success")
      setTimeout(() => {
        setShowCheckout(false)
        window.location.reload()
      }, 2000)
    } catch (err: any) {
      console.error(err)
      setCheckoutStatus("error")
    }
  }

  const handleSubmitPaymentConfirmation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPlan || !user) return

    if (!senderName.trim() || !senderBank.trim() || !receiptFile) {
      setValidationError(locale === "en" ? "Please fill in all fields and upload the receipt." : "Mohon isi semua bidang dan unggah bukti transfer.")
      return
    }

    setCheckoutStatus("processing")
    setValidationError("")

    try {
      const supabase = getSupabaseClient()

      // 1. Upload receipt to Supabase Storage receipts bucket
      const fileExt = receiptFile.name.split('.').pop()
      const fileName = `${crypto.randomUUID()}.${fileExt}`
      const filePath = `${user.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, receiptFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) throw uploadError

      // 2. Get public URL
      const { data: urlData } = supabase.storage
        .from('receipts')
        .getPublicUrl(filePath)

      if (!urlData?.publicUrl) {
        throw new Error("Failed to retrieve public URL for uploaded receipt")
      }

      // 3. Insert payment confirmation request in DB
      const priceCents = selectedPlan.target === 'pro' ? 1667 : 300 // USD cents representation ($16.67 is about Rp 250k)
      const amountPaid = selectedPlan.target === 'pro' ? 250000 : 45000 // Converted IDR amount

      const { error: insertError } = await supabase
        .from('payment_confirmations')
        .insert({
          user_id: user.id,
          plan: selectedPlan.target,
          billing_cycle: 'monthly',
          price_cents: priceCents,
          sender_name: senderName,
          sender_bank: senderBank,
          amount_paid: amountPaid,
          receipt_url: urlData.publicUrl,
          status: 'pending'
        })

      if (insertError) throw insertError

      setCheckoutStatus("success")
      setTimeout(() => {
        setShowCheckout(false)
        window.location.reload()
      }, 3000)
    } catch (err: any) {
      console.error(err)
      setValidationError(err.message || "Failed to submit confirmation request")
      setCheckoutStatus("error")
    }
  }

  const getPlanPriceIDR = (target: string) => {
    if (target === 'basic') return "45.000"
    if (target === 'pro') return "250.000"
    return "0"
  }

  const plans = [
    {
      name: locale === "en" ? "Free" : "Gratis",
      price: "Rp 0",
      originalPrice: null,
      promoLabel: null,
      target: "free",
      cadence: locale === "en" ? "/forever" : "/selamanya",
      description: locale === "en" ? "Perfect for individual engineers and small projects." : "Sangat cocok untuk insinyur individu dan proyek kecil.",
      features: [
        { label: locale === "en" ? "50 files per month limit" : "Batas 50 file per bulan", included: true },
        { label: locale === "en" ? "KML Duplicate Checker" : "Pendeteksi Duplikat KML", included: true },
        { label: locale === "en" ? "KML Format Converters (CSV, DXF, SHP)" : "Konverter Format KML (CSV, DXF, SHP)", included: true },
        { label: locale === "en" ? "OTDR Trace Analyzer & Fault Locator" : "Penganalisis Trace OTDR & Fault Locator", included: true },
        { label: locale === "en" ? "Splice Manager & Color Code" : "Splice Manager & Kode Warna", included: true },
        { label: locale === "en" ? "GPON Splitter & OPM Utilities" : "Utilitas GPON Splitter & OPM", included: true },
        { label: locale === "en" ? "Drafter & Design Tools (BOQ, Database)" : "Alat Desain & Drafter (BOQ, Database)", included: false },
      ],
      cta: { label: locale === "en" ? "Start Free" : "Mulai Gratis", href: "/signup" },
      highlight: false,
    },
    {
      name: "Basic",
      price: "Rp 45.000",
      originalPrice: null,
      promoLabel: null,
      target: "basic",
      cadence: locale === "en" ? "/month" : "/bulan",
      description: locale === "en" ? "For individuals who need standard processing and higher limits." : "Untuk individu yang memerlukan pemrosesan standar dengan batas kuota lebih tinggi.",
      features: [
        { label: locale === "en" ? "500 files per month limit" : "Batas 500 file per bulan", included: true },
        { label: locale === "en" ? "All Free tools included" : "Semua alat Gratis disertakan", included: true },
        { label: locale === "en" ? "Bebas batasan ukuran berkas" : "Bebas batasan ukuran berkas", included: true },
        { label: locale === "en" ? "Standard processing queue" : "Antrean pemrosesan standar", included: true },
        { label: locale === "en" ? "Drafter & Design Tools (BOQ, Database)" : "Alat Desain & Drafter (BOQ, Database)", included: false },
      ],
      cta: { label: locale === "en" ? "Choose Basic" : "Pilih Basic", href: "/signup" },
      highlight: false,
    },
    {
      name: "Pro",
      price: "Rp 250.000",
      originalPrice: "Rp 500.000",
      promoLabel: locale === "en" ? "Promo: 50% Off First 3 Months" : "Promo: Diskon 50% 3 Bulan Pertama",
      target: "pro",
      cadence: locale === "en" ? "/month" : "/bulan",
      description: locale === "en" ? "For professional fiber engineers and growing teams." : "Untuk insinyur fiber profesional dan tim yang berkembang.",
      features: [
        { label: locale === "en" ? "Unlimited files & processing" : "Pemrosesan & file tanpa batas", included: true },
        { label: locale === "en" ? "All Basic tools included" : "Semua alat Basic disertakan", included: true },
        { label: locale === "en" ? "KML to BOQ & KML to Database HP" : "KML ke BOQ & KML ke Database HP", included: true },
        { label: locale === "en" ? "KML Folder Extractor & Pole Sorter" : "KML Folder Extractor & Pole Sorter", included: true },
        { label: locale === "en" ? "Insert Coding KML" : "Insert Coding KML", included: true },
        { label: locale === "en" ? "Super fast priority queue" : "Antrean prioritas super cepat", included: true },
        { label: locale === "en" ? "Developer API Keys" : "Akses Kunci Developer API", included: true },
      ],
      cta: { label: locale === "en" ? "Upgrade to Pro" : "Tingkatkan ke Pro", href: "/signup" },
      highlight: true,
    },
  ]

  const compare = [
    { label: locale === "en" ? "Files per month" : "File per bulan", free: "50", basic: "500", pro: locale === "en" ? "Unlimited" : "Tanpa Batas" },
    { label: locale === "en" ? "KML Duplicate Checker" : "Pendeteksi Duplikat KML", free: true, basic: true, pro: true },
    { label: locale === "en" ? "KML Format Converters (CSV, DXF, SHP)" : "Konverter Format KML (CSV, DXF, SHP)", free: true, basic: true, pro: true },
    { label: locale === "en" ? "OTDR Trace & Distance-to-Fault" : "OTDR Trace & Distance-to-Fault", free: true, basic: true, pro: true },
    { label: locale === "en" ? "Fiber Color Code & OPM Loss" : "Fiber Color Code & OPM Loss", free: true, basic: true, pro: true },
    { label: locale === "en" ? "Splice Manager & GPON Estimator" : "Splice Manager & GPON Estimator", free: true, basic: true, pro: true },
    { label: locale === "en" ? "DMS ↔ DD Coordinate Converter" : "Konverter Koordinat DMS ↔ DD", free: true, basic: true, pro: true },
    { label: locale === "en" ? "KML to BOQ Generator" : "Pembuat KML ke BOQ Excel", free: false, basic: false, pro: true },
    { label: locale === "en" ? "KML to Database HP Converter" : "Konverter KML ke Database HP", free: false, basic: false, pro: true },
    { label: locale === "en" ? "KML Folder Extractor" : "Pengekstrak Folder KML (Extractor)", free: false, basic: false, pro: true },
    { label: locale === "en" ? "Pole Auto-Sorter" : "Pengurut Tiang Otomatis (Pole Sorter)", free: false, basic: false, pro: true },
    { label: locale === "en" ? "Insert Coding KML" : "Pemberi Kode KML (Insert Coding)", free: false, basic: false, pro: true },
    { label: locale === "en" ? "Processing queue" : "Prioritas antrean", free: locale === "en" ? "Standard" : "Standar", basic: locale === "en" ? "Standard" : "Standar", pro: locale === "en" ? "Super Fast Priority" : "Prioritas Super Cepat" },
    { label: locale === "en" ? "Developer API Access" : "Akses API Developer", free: false, basic: false, pro: true },
    { label: locale === "en" ? "Support" : "Dukungan", free: locale === "en" ? "Community" : "Komunitas", basic: locale === "en" ? "Community" : "Komunitas", pro: locale === "en" ? "Email · 24h SLA" : "Email · SLA 24j" },
  ]

  const faqs = [
    {
      q: locale === "en" ? "Can I switch plans anytime?" : "Apakah saya bisa mengubah paket kapan saja?",
      a: locale === "en" 
        ? "Yes. You can upgrade or downgrade at any time. Changes prorate automatically."
        : "Ya. Anda dapat melakukan upgrade atau downgrade kapan saja. Perubahan biaya akan disesuaikan secara otomatis.",
    },
    {
      q: locale === "en" ? "Do you offer team pricing?" : "Apakah Anda menawarkan harga khusus tim?",
      a: locale === "en"
        ? "Yes — contact us for team and enterprise pricing tailored to your headcount."
        : "Ya — silakan hubungi kami untuk mendapatkan penawaran khusus tim dan enterprise yang disesuaikan dengan jumlah anggota tim Anda.",
    },
    {
      q: locale === "en" ? "Is my data safe?" : "Apakah data saya aman?",
      a: locale === "en"
        ? "Files are processed in isolated workers and removed after delivery. We never train on your data."
        : "File Anda diproses di worker yang terisolasi dan dihapus setelah pengiriman. Kami tidak pernah menggunakan data Anda untuk melatih model kami.",
    },
    {
      q: locale === "en" ? "Do you support API access?" : "Apakah Anda mendukung akses API?",
      a: locale === "en"
        ? "Yes, on the Pro plan. See our documentation for endpoints and rate limits."
        : "Ya, tersedia pada paket Pro. Silakan lihat dokumentasi kami untuk endpoint dan batas penggunaan.",
    },
  ]

  const copyVA = () => {
    navigator.clipboard.writeText("801234567890")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <SiteNavbar locale={locale} />
      <main className="relative">
        <PageHeader
          eyebrow={t.nav.pricing}
          title={t.pricing.title}
          description={t.pricing.subtitle}
        />

        {lastRejectedPayment && (
          <section className="mx-auto max-w-4xl px-6 mt-4">
            <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400 flex items-start gap-3 backdrop-blur-sm">
              <ShieldAlert className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">
                  {locale === "en" ? "Previous payment request rejected" : "Permintaan pembayaran sebelumnya ditolak"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {locale === "en" 
                    ? `Reason: ${lastRejectedPayment.admin_notes || "No reason provided."}` 
                    : `Alasan: ${lastRejectedPayment.admin_notes || "Tidak ada alasan yang diberikan."}`}
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="relative mx-auto max-w-6xl px-6 py-12">
          <div 
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
            onMouseLeave={() => setHoveredIndex(2)}
          >
            {plans.map((plan, i) => {
              const isCurrentPlan = mounted && user && profile?.plan === plan.target
              const isHighlighted = hoveredIndex === i

              return (
                <motion.div
                  key={plan.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  whileTap={{ scale: 0.98 }}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onTouchStart={() => setHoveredIndex(i)}
                  className={cn(
                    "group relative flex flex-col rounded-3xl border p-8 backdrop-blur-sm shadow-md transition-all duration-300 cursor-pointer",
                    isHighlighted
                      ? "border-primary bg-card/95 shadow-xl shadow-primary/10 scale-[1.02] z-10"
                      : "border-border bg-card/60 shadow-black/5 dark:shadow-black/20 scale-[0.98] opacity-80",
                  )}
                >
                  <div className={cn("tech-bracket-tl transition-opacity", isHighlighted ? "opacity-100" : "opacity-30")} />
                  <div className={cn("tech-bracket-tr transition-opacity", isHighlighted ? "opacity-100" : "opacity-30")} />
                  <div className={cn("tech-bracket-bl transition-opacity", isHighlighted ? "opacity-100" : "opacity-30")} />
                  <div className={cn("tech-bracket-br transition-opacity", isHighlighted ? "opacity-100" : "opacity-30")} />

                  {plan.target === "pro" && (
                    <span className={cn(
                      "absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[10px] font-medium uppercase tracking-wider transition-all duration-300",
                      isHighlighted
                        ? "bg-primary text-primary-foreground scale-105"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {locale === "en" ? "Most popular" : "Paling populer"}
                    </span>
                  )}
                  <div>
                    <h2 className="text-base font-medium font-display">{plan.name}</h2>
                    <div className="mt-3 flex flex-col gap-1">
                      {plan.originalPrice && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm line-through text-muted-foreground/60 font-mono">
                            {plan.originalPrice}
                          </span>
                          {plan.promoLabel && (
                            <span className="text-[10px] bg-red-500/10 border border-red-500/20 text-red-400 font-medium px-2 py-0.5 rounded">
                              {plan.promoLabel}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-semibold tracking-tight font-display">
                          {plan.price}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {plan.cadence}
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                      {plan.description}
                    </p>
                  </div>

                  <ul className="mt-8 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li
                        key={f.label}
                        className="flex items-start gap-3 text-sm"
                      >
                        {f.included ? (
                          <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                        ) : (
                          <Minus className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                        )}
                        <span
                          className={cn(
                            f.included
                              ? "text-foreground"
                              : "text-muted-foreground/60",
                          )}
                        >
                          {f.label}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {mounted && user ? (
                    isCurrentPlan ? (
                      <button
                        disabled
                        className="mt-8 inline-flex items-center justify-center rounded-full py-2.5 text-sm font-medium border border-white/5 bg-white/[0.02] text-muted-foreground cursor-not-allowed w-full"
                      >
                        {locale === "en" ? "Current Plan" : "Paket Aktif"}
                      </button>
                    ) : pendingPayment ? (
                      pendingPayment.plan === plan.target ? (
                        <button
                          disabled
                          className="mt-8 inline-flex items-center justify-center rounded-full py-2.5 text-sm font-medium border border-yellow-500/20 bg-yellow-500/5 text-yellow-400 cursor-not-allowed w-full animate-pulse"
                        >
                          {locale === "en" ? "Pending Verification" : "Menunggu Verifikasi"}
                        </button>
                      ) : (
                        <button
                          disabled
                          className="mt-8 inline-flex items-center justify-center rounded-full py-2.5 text-sm font-medium border border-white/5 bg-white/[0.02] text-muted-foreground/40 cursor-not-allowed w-full"
                        >
                          {plan.cta.label}
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => handleOpenCheckout(plan.name, plan.price, plan.target)}
                        className={cn(
                          "mt-8 inline-flex items-center justify-center rounded-full py-2.5 text-sm font-medium transition-all duration-300 cursor-pointer w-full",
                          isHighlighted
                            ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                            : "border border-white/10 bg-white/[0.03] text-foreground hover:border-white/30",
                        )}
                      >
                        {plan.cta.label}
                      </button>
                    )
                  ) : (
                    <Link
                      href={`${plan.cta.href}?plan=${plan.target}`}
                      className={cn(
                        "mt-8 inline-flex items-center justify-center rounded-full py-2.5 text-sm font-medium transition-all duration-300 w-full",
                        isHighlighted
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                          : "border border-white/10 bg-white/[0.03] text-foreground hover:border-white/30",
                      )}
                    >
                      {plan.cta.label}
                    </Link>
                  )}
                </motion.div>
              )
            })}
          </div>
        </section>
        {/* Comparison */}
        <section className="relative mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center font-display">
            {locale === "en" ? "Compare plans" : "Perbandingan paket"}
          </h2>

          <div className="mt-10 rounded-3xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] divide-x divide-white/10">
              <div className="p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {locale === "en" ? "Feature" : "Fitur"}
              </div>
              <div className="p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium text-center">
                {locale === "en" ? "Free" : "Gratis"}
              </div>
              <div className="p-4 text-xs uppercase tracking-wider text-blue-400 font-medium text-center">
                Basic
              </div>
              <div className="p-4 text-xs uppercase tracking-wider text-primary font-medium text-center">
                Pro
              </div>
            </div>
            <ul className="divide-y divide-white/10">
              {compare.map((row) => (
                <li
                  key={row.label}
                  className="grid grid-cols-[1.5fr_1fr_1fr_1fr] divide-x divide-white/10"
                >
                  <span className="p-4 text-sm">{row.label}</span>
                  <span className="p-4 text-sm text-center text-muted-foreground">
                    {typeof row.free === "boolean" ? (
                      row.free ? (
                        <Check className="inline h-4 w-4 text-primary" />
                      ) : (
                        <Minus className="inline h-4 w-4 text-muted-foreground/40" />
                      )
                    ) : (
                      row.free
                    )}
                  </span>
                  <span className="p-4 text-sm text-center text-muted-foreground">
                    {typeof row.basic === "boolean" ? (
                      row.basic ? (
                        <Check className="inline h-4 w-4 text-blue-400" />
                      ) : (
                        <Minus className="inline h-4 w-4 text-muted-foreground/40" />
                      )
                    ) : (
                      row.basic
                    )}
                  </span>
                  <span className="p-4 text-sm text-center text-foreground">
                    {typeof row.pro === "boolean" ? (
                      row.pro ? (
                        <Check className="inline h-4 w-4 text-primary" />
                      ) : (
                        <Minus className="inline h-4 w-4 text-muted-foreground/40" />
                      )
                    ) : (
                      row.pro
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section className="relative mx-auto max-w-3xl px-6 pb-24">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center font-display">
            {locale === "en" ? "Frequently asked questions" : "Pertanyaan yang sering diajukan"}
          </h2>
          <div className="mt-10 space-y-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border border-white/10 bg-card/40 p-5 backdrop-blur-sm"
              >
                <summary className="flex items-center justify-between cursor-pointer text-sm font-medium">
                  {f.q}
                  <span className="text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* Checkout Modal */}
      <AnimatePresence>
        {showCheckout && selectedPlan && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (checkoutStatus !== "processing") setShowCheckout(false)
              }}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed inset-0 z-[101] flex items-center justify-center p-4"
            >
              <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-gradient-to-b from-card to-background shadow-2xl overflow-hidden p-6 max-h-[90vh] overflow-y-auto">
                
                {/* Close */}
                {checkoutStatus !== "processing" && (
                  <button
                    onClick={() => setShowCheckout(false)}
                    className="absolute top-4 right-4 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    &times;
                  </button>
                )}

                {checkoutStatus === "processing" ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm font-medium text-muted-foreground animate-pulse">
                      {locale === "en" ? "Submitting confirmation..." : "Mengirimkan konfirmasi..."}
                    </p>
                    <p className="text-xs text-muted-foreground/50 max-w-[280px] text-center leading-relaxed">
                      {locale === "en" 
                        ? "Please wait a moment while we upload your receipt and save the request." 
                        : "Mohon tunggu sebentar selagi kami mengunggah bukti dan menyimpan permintaan."}
                    </p>
                  </div>
                ) : checkoutStatus === "success" ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 15 }}
                    >
                      <CheckCircle2 className="h-16 w-16 text-primary" />
                    </motion.div>
                    <h3 className="text-xl font-bold text-foreground">
                      {selectedPlan.target === "free"
                        ? (locale === "en" ? "Downgrade Completed" : "Paket Berhasil Dialihkan")
                        : (locale === "en" ? "Submission Successful!" : "Konfirmasi Dikirim!")}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedPlan.target === "free"
                        ? (locale === "en" ? "Your account has been set back to the Free plan." : "Akun Anda telah diatur kembali ke paket Gratis.")
                        : (locale === "en" 
                            ? "Your payment confirmation has been submitted and is pending admin approval." 
                            : "Konfirmasi pembayaran Anda telah terkirim dan sedang menunggu persetujuan admin.")}
                    </p>
                  </div>
                ) : checkoutStatus === "error" ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                    <ShieldAlert className="h-16 w-16 text-red-500" />
                    <h3 className="text-xl font-bold text-red-400">
                      {locale === "en" ? "Submission Failed" : "Pengiriman Gagal"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {validationError || (locale === "en" 
                        ? "An error occurred during submission. Please try again."
                        : "Terjadi kesalahan saat memproses pengiriman. Silakan coba lagi.")}
                    </p>
                    <button
                      onClick={() => setCheckoutStatus("idle")}
                      className="mt-4 px-6 py-2 bg-red-500 text-white rounded-full text-sm font-medium hover:bg-red-600 transition-colors cursor-pointer"
                    >
                      {locale === "en" ? "Retry" : "Coba Lagi"}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Header */}
                    <div className="text-center mb-6">
                      <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                        {selectedPlan.target === "free"
                          ? (locale === "en" ? "Plan Downgrade" : "Beralih Paket")
                          : (locale === "en" ? "Bank Transfer Confirmation" : "Konfirmasi Transfer Bank")}
                      </span>
                      <h3 className="text-lg font-bold mt-1">
                        {selectedPlan.target === "free"
                          ? (locale === "en" ? "Switch to Free plan" : "Kembali ke Paket Gratis")
                          : (locale === "en" ? "Upgrade Plan" : "Upgrade Paket")}
                      </h3>
                      <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/10 rounded-xl">
                        <span className="text-sm text-muted-foreground">{selectedPlan.name}:</span>
                        <span className="text-sm font-bold text-foreground">
                          {selectedPlan.target === 'free' ? '$0' : `Rp ${getPlanPriceIDR(selectedPlan.target)}`}
                        </span>
                      </div>
                    </div>

                    {selectedPlan.target === "free" ? (
                      /* Free Confirmation */
                      <div className="space-y-6">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.01] p-4 text-center leading-relaxed">
                          <p className="text-sm text-muted-foreground">
                            {locale === "en"
                              ? "Are you sure you want to downgrade to the Free plan? Access to premium conversion tools, unlimited duplicate checks, and priority queue will be disabled."
                              : "Apakah Anda yakin ingin beralih kembali ke paket Gratis? Akses ke konverter premium, pendeteksi duplikat tanpa batas, dan antrean prioritas akan dinonaktifkan."}
                          </p>
                        </div>
                        
                        <div className="space-y-2">
                          <button
                            onClick={handleDowngradeToFree}
                            className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-2xl hover:bg-primary/90 transition-colors cursor-pointer text-sm shadow-md"
                          >
                            {locale === "en" ? "Confirm Downgrade" : "Konfirmasi Beralih"}
                          </button>
                          <button
                            onClick={() => setShowCheckout(false)}
                            className="w-full py-2.5 border border-white/10 bg-white/[0.03] text-muted-foreground text-sm rounded-2xl hover:bg-white/[0.06] hover:text-foreground transition-colors cursor-pointer"
                          >
                            {locale === "en" ? "Cancel" : "Batal"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Paid Invoice Flow - Bank Transfer */
                      <form onSubmit={handleSubmitPaymentConfirmation} className="space-y-4">
                        {/* Bank Details Area */}
                        <div className="rounded-2xl border border-white/10 bg-white/[0.01] p-4 space-y-3">
                          <p className="text-xs font-semibold text-primary">
                            {locale === "en" ? "1. Transfer to our bank account:" : "1. Silakan transfer ke rekening berikut:"}
                          </p>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">{locale === "en" ? "Bank Name" : "Nama Bank"}</span>
                              <span className="font-bold text-foreground">{BANK_NAME}</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground">{locale === "en" ? "Account Name" : "Nama Pemilik"}</span>
                              <span className="font-medium text-foreground">{BANK_HOLDER}</span>
                            </div>
                            <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
                              <div className="flex flex-col">
                                <span className="text-[10px] text-muted-foreground">{locale === "en" ? "Account Number" : "Nomor Rekening"}</span>
                                <span className="text-sm font-bold font-mono tracking-wider text-foreground">{BANK_ACCOUNT}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(BANK_ACCOUNT)
                                  setCopied(true)
                                  setTimeout(() => setCopied(false), 2000)
                                }}
                                className="p-2 border border-white/10 rounded-lg bg-white/[0.02] text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                              >
                                <Clipboard className="h-4 w-4" />
                              </button>
                            </div>
                            {copied && (
                              <p className="text-[10px] text-center text-primary font-medium animate-pulse">
                                {locale === "en" ? "Copied to clipboard!" : "Nomor rekening berhasil disalin!"}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Confirmation Inputs */}
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-primary">
                            {locale === "en" ? "2. Input transfer details:" : "2. Lengkapi detail transfer Anda:"}
                          </p>
                          <div>
                            <label className="text-[11px] text-muted-foreground block mb-1">
                              {locale === "en" ? "Sender Bank Name" : "Nama Bank Pengirim"}
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. BCA, Mandiri, BNI"
                              value={senderBank}
                              onChange={(e) => setSenderBank(e.target.value)}
                              className="w-full h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-muted-foreground block mb-1">
                              {locale === "en" ? "Sender Account Name" : "Nama Pemilik Rekening Pengirim"}
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Budi Santoso"
                              value={senderName}
                              onChange={(e) => setSenderName(e.target.value)}
                              className="w-full h-10 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-muted-foreground block mb-1">
                              {locale === "en" ? "Upload Transfer Receipt (Image/PDF)" : "Unggah Bukti Transfer (Gambar/PDF)"}
                            </label>
                            <input
                              type="file"
                              required
                              accept="image/*,application/pdf"
                              onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  setReceiptFile(e.target.files[0])
                                }
                              }}
                              className="w-full text-xs text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
                            />
                          </div>
                        </div>

                        {validationError && (
                          <p className="text-xs text-red-400 text-center font-medium">
                            {validationError}
                          </p>
                        )}

                        {/* Submit Button */}
                        <div className="space-y-2 pt-2">
                          <button
                            type="submit"
                            className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-2xl hover:bg-primary/90 transition-colors cursor-pointer text-sm shadow-md"
                          >
                            {locale === "en" ? "Submit Payment Confirmation" : "Kirim Konfirmasi Pembayaran"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowCheckout(false)}
                            className="w-full py-2.5 border border-white/10 bg-white/[0.03] text-muted-foreground text-sm rounded-2xl hover:bg-white/[0.06] hover:text-foreground transition-colors cursor-pointer"
                          >
                            {locale === "en" ? "Cancel" : "Batal"}
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                )}

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <SiteFooter locale={locale} />
    </>
  )
}
