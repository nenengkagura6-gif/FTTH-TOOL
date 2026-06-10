"use client"

import * as React from "react"
import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { PageHeader } from "@/components/site/page-header"
import { siteConfig } from "@/lib/site-config"
import { translations } from "@/lib/translations"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { 
  Mail, 
  Copy, 
  Check, 
  Loader2, 
  MessageSquare, 
  Send, 
  HelpCircle,
  Building,
  Clock
} from "lucide-react"

const contactTranslations = {
  en: {
    eyebrow: "Contact Us",
    title: "Get in Touch",
    description: "Have questions about FTTH network mapping or need custom formatting for your BOQ sheets?",
    emailUs: "Email Support",
    org: "Organization",
    responseTime: "Response SLA",
    responseTimeText: "Typically under 24 hours.",
    copyEmail: "Copy email",
    copied: "Copied!",
    validationName: "Name must be at least 2 characters.",
    validationEmail: "Please enter a valid email address.",
    validationMsg: "Message must be at least 10 characters.",
    successTitle: "Message Sent!",
    successText: "Thank you for reaching out. Our team will review your message and get back to you shortly.",
    sendAnother: "Send another message",
    faqTitle: "Frequently Asked Questions",
    faqs: [
      { q: "How fast do you reply?", a: "We typically respond to support tickets within 12-24 hours." },
      { q: "Do you offer customized integration?", a: "Yes. Contact us with your specific BOQ or AutoCAD layout formatting requirements." },
      { q: "Is my uploaded data secure?", a: "100%. Data processing is done client-side or on temporary servers and instantly wiped." }
    ]
  },
  id: {
    eyebrow: "Hubungi Kami",
    title: "Hubungi Kami",
    description: "Punya pertanyaan seputar pemetaan jaringan FTTH atau butuh kustomisasi format BOQ Excel Anda?",
    emailUs: "Dukungan Email",
    org: "Organisasi",
    responseTime: "Waktu Respon",
    responseTimeText: "Biasanya kurang dari 24 jam.",
    copyEmail: "Salin email",
    copied: "Disalin!",
    validationName: "Nama minimal harus 2 karakter.",
    validationEmail: "Silakan masukkan alamat email yang valid.",
    validationMsg: "Pesan minimal harus 10 karakter.",
    successTitle: "Pesan Terkirim!",
    successText: "Terima kasih telah menghubungi kami. Tim kami akan meninjau pesan Anda dan segera membalas.",
    sendAnother: "Kirim pesan lain",
    faqTitle: "Pertanyaan yang Sering Diajukan",
    faqs: [
      { q: "Berapa lama waktu balasan?", a: "Kami biasanya merespons tiket dukungan dalam 12-24 jam." },
      { q: "Apakah Anda menawarkan integrasi kustom?", a: "Ya. Hubungi kami untuk kebutuhan format ekspor BOQ atau AutoCAD DXF tertentu." },
      { q: "Apakah data yang diunggah aman?", a: "100% aman. Pemrosesan data dilakukan di sisi klien atau server sementara dan langsung dihapus." }
    ]
  }
} as const

interface PageProps {
  params: Promise<{
    locale: string
  }>
}

export default function ContactPage({ params }: PageProps) {
  const { locale } = React.use(params)
  const resolvedLocale = (locale === "id" ? "id" : "en") as "en" | "id"

  const t = translations[resolvedLocale]
  const ct = contactTranslations[resolvedLocale]

  const [formData, setFormData] = React.useState({ name: "", email: "", message: "" })
  const [errors, setErrors] = React.useState({ name: "", email: "", message: "" })
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isSuccess, setIsSuccess] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const handleCopyEmail = () => {
    navigator.clipboard.writeText("support@ftthtools.my.id")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const validateForm = () => {
    let isValid = true
    const newErrors = { name: "", email: "", message: "" }

    if (formData.name.trim().length < 2) {
      newErrors.name = ct.validationName
      isValid = false
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email.trim())) {
      newErrors.email = ct.validationEmail
      isValid = false
    }

    if (formData.message.trim().length < 10) {
      newErrors.message = ct.validationMsg
      isValid = false
    }

    setErrors(newErrors)
    return isValid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    // Simulate API delay for premium feel
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setIsSubmitting(false)
    setIsSuccess(true)
    setFormData({ name: "", email: "", message: "" })
  }

  return (
    <>
      <SiteNavbar locale={resolvedLocale} />
      <main className="relative">
        <PageHeader
          eyebrow={ct.eyebrow}
          title={ct.title}
          description={ct.description}
        />

        <section className="relative mx-auto max-w-6xl px-6 py-12 md:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            {/* Info Panel & FAQs */}
            <div className="lg:col-span-5 space-y-8">
              <div className="space-y-4">
                {/* Email Info Card */}
                <div className="relative group overflow-hidden rounded-2xl border border-white/10 bg-card/30 p-6 backdrop-blur-sm transition-all duration-300 hover:border-white/20">
                  <div className="tech-bracket-tl opacity-30 group-hover:opacity-100 transition-opacity" />
                  <div className="tech-bracket-tr opacity-30 group-hover:opacity-100 transition-opacity" />
                  <div className="tech-bracket-bl opacity-30 group-hover:opacity-100 transition-opacity" />
                  <div className="tech-bracket-br opacity-30 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20 shrink-0">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-foreground">{ct.emailUs}</h3>
                      <p className="mt-1 text-base font-semibold text-foreground truncate selection:bg-primary/30">
                        support@ftthtools.my.id
                      </p>
                      <button
                        type="button"
                        onClick={handleCopyEmail}
                        className="mt-3 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-medium cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            <span>{ct.copied}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>{ct.copyEmail}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Organization & SLA info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-white/10 bg-card/30 p-5 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">{ct.org}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">{siteConfig.org}</p>
                  </div>
                  
                  <div className="rounded-xl border border-white/10 bg-card/30 p-5 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">{ct.responseTime}</span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">{ct.responseTimeText}</p>
                  </div>
                </div>
              </div>

              {/* Accordion FAQs */}
              <div className="space-y-4 pt-4 border-t border-white/10">
                <h3 className="text-base font-medium flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  <span>{ct.faqTitle}</span>
                </h3>
                <div className="space-y-3">
                  {ct.faqs.map((faq, idx) => (
                    <details
                      key={idx}
                      className="group rounded-xl border border-white/10 bg-card/20 p-4 backdrop-blur-sm transition-all duration-300 hover:bg-card/40"
                    >
                      <summary className="flex items-center justify-between cursor-pointer text-sm font-medium">
                        {faq.q}
                        <span className="text-muted-foreground transition-transform duration-200 group-open:rotate-45">
                          +
                        </span>
                      </summary>
                      <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                        {faq.a}
                      </p>
                    </details>
                  ))}
                </div>
              </div>
            </div>

            {/* Interactive Contact Form Column */}
            <div className="lg:col-span-7">
              <div className="relative group rounded-3xl border border-white/10 bg-card/40 p-8 backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-card/50 shadow-lg">
                <div className="tech-bracket-tl opacity-30 group-hover:opacity-100 transition-opacity" />
                <div className="tech-bracket-tr opacity-30 group-hover:opacity-100 transition-opacity" />
                <div className="tech-bracket-bl opacity-30 group-hover:opacity-100 transition-opacity" />
                <div className="tech-bracket-br opacity-30 group-hover:opacity-100 transition-opacity" />

                {isSuccess ? (
                  <div className="flex flex-col items-center justify-center text-center py-10 space-y-4 animate-in fade-in zoom-in-95 duration-300">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
                      <Check className="h-8 w-8" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mt-2">
                      {ct.successTitle}
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      {ct.successText}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsSuccess(false)}
                      className="mt-6 rounded-full cursor-pointer hover:tech-border-glow transition-all"
                    >
                      {ct.sendAnother}
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="flex items-center gap-2 mb-6">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                        {t.about.contactTitle}
                      </span>
                    </div>

                    {/* Name field */}
                    <div className="space-y-2">
                      <label htmlFor="name" className="text-sm font-medium text-foreground">
                        {t.about.contactName}
                      </label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Alex Rivera"
                        disabled={isSubmitting}
                        className={errors.name ? "border-destructive focus-visible:ring-destructive/30" : ""}
                      />
                      {errors.name && (
                        <p className="text-xs text-destructive mt-1 font-medium">{errors.name}</p>
                      )}
                    </div>

                    {/* Email field */}
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium text-foreground">
                        {t.about.contactEmail}
                      </label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="alex@company.com"
                        disabled={isSubmitting}
                        className={errors.email ? "border-destructive focus-visible:ring-destructive/30" : ""}
                      />
                      {errors.email && (
                        <p className="text-xs text-destructive mt-1 font-medium">{errors.email}</p>
                      )}
                    </div>

                    {/* Message field */}
                    <div className="space-y-2">
                      <label htmlFor="message" className="text-sm font-medium text-foreground">
                        {t.about.contactMsg}
                      </label>
                      <Textarea
                        id="message"
                        value={formData.message}
                        onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        placeholder="Tell us about your project or support query..."
                        disabled={isSubmitting}
                        className={errors.message ? "border-destructive focus-visible:ring-destructive/30 min-h-[140px]" : "min-h-[140px]"}
                      />
                      {errors.message && (
                        <p className="text-xs text-destructive mt-1 font-medium">{errors.message}</p>
                      )}
                    </div>

                    {/* Submit Button */}
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full rounded-full cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-300 relative group flex items-center justify-center gap-2 py-6"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          <span>{t.about.contactBtn}</span>
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter locale={resolvedLocale} />
    </>
  )
}
