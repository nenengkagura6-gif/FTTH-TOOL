import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { Hero } from "@/components/landing/hero"
import { Features } from "@/components/landing/features"
import { Workflow } from "@/components/landing/workflow"
import { WhyUs } from "@/components/landing/why-us"
import { CtaBanner } from "@/components/landing/cta-banner"

interface PageProps {
  params: Promise<{
    locale: string
  }>
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params

  return (
    <>
      <SiteNavbar locale={locale} />
      <main className="relative">
        <Hero locale={locale} />
        <Features locale={locale} />
        <Workflow locale={locale} />
        <WhyUs locale={locale} />
        <CtaBanner locale={locale} />
      </main>
      <SiteFooter locale={locale} />
    </>
  )
}
