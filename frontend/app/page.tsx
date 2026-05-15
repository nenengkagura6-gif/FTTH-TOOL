import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { Hero } from "@/components/landing/hero"
import { Features } from "@/components/landing/features"
import { Workflow } from "@/components/landing/workflow"
import { WhyUs } from "@/components/landing/why-us"
import { CtaBanner } from "@/components/landing/cta-banner"

export default function HomePage() {
  return (
    <>
      <SiteNavbar />
      <main className="relative">
        <Hero />
        <Features />
        <Workflow />
        <WhyUs />
        <CtaBanner />
      </main>
      <SiteFooter />
    </>
  )
}
