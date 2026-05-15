import type { Metadata } from "next"
import Link from "next/link"
import { Check, Minus } from "lucide-react"
import { SiteNavbar } from "@/components/site/navbar"
import { SiteFooter } from "@/components/site/footer"
import { PageHeader } from "@/components/site/page-header"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Pricing — FTTH Tool",
  description:
    "Simple, transparent pricing. Start free. Upgrade when your team is ready.",
}

const plans = [
  {
    name: "Free",
    price: "$0",
    cadence: "/forever",
    description: "Perfect for individual engineers and small projects.",
    features: [
      { label: "Up to 5 files / month", included: true },
      { label: "Max 10,000 HP per file", included: true },
      { label: "Standard processing queue", included: true },
      { label: "Community support", included: true },
      { label: "Premium tools", included: false },
      { label: "Priority queue", included: false },
      { label: "API access", included: false },
    ],
    cta: { label: "Start Free", href: "/signup" },
    highlight: false,
  },
  {
    name: "Pro",
    price: "$20",
    cadence: "/month",
    description: "For professional fiber engineers and growing teams.",
    features: [
      { label: "Unlimited files", included: true },
      { label: "Up to 200,000 HP per file", included: true },
      { label: "Priority processing queue", included: true },
      { label: "Email support · 24h SLA", included: true },
      { label: "All premium tools", included: true },
      { label: "Faster processing engine", included: true },
      { label: "API access", included: true },
    ],
    cta: { label: "Upgrade to Pro", href: "/signup" },
    highlight: true,
  },
]

const compare = [
  { label: "Files per month", free: "5", pro: "Unlimited" },
  { label: "HP per file", free: "10,000", pro: "200,000" },
  { label: "Queue priority", free: "Standard", pro: "Priority" },
  { label: "Premium tools", free: false, pro: true },
  { label: "API access", free: false, pro: true },
  { label: "Support", free: "Community", pro: "Email · 24h SLA" },
]

export default function PricingPage() {
  return (
    <>
      <SiteNavbar />
      <main className="relative">
        <PageHeader
          eyebrow="Pricing"
          title="Simple, transparent pricing"
          description="Start free. Upgrade when your team is ready. Cancel anytime."
        />

        <section className="relative mx-auto max-w-5xl px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative flex flex-col rounded-3xl border p-8 backdrop-blur-sm transition-all",
                  plan.highlight
                    ? "border-primary/40 bg-card/60 glow-cyan"
                    : "border-white/10 bg-card/40 hover:border-white/20",
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-primary-foreground">
                    Most popular
                  </span>
                )}
                <div>
                  <h2 className="text-base font-medium">{plan.name}</h2>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight">
                      {plan.price}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {plan.cadence}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
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

                <Link
                  href={plan.cta.href}
                  className={cn(
                    "mt-8 inline-flex items-center justify-center rounded-full py-2.5 text-sm font-medium transition-colors",
                    plan.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-white/10 bg-white/[0.03] text-foreground hover:border-white/30",
                  )}
                >
                  {plan.cta.label}
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Comparison */}
        <section className="relative mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">
            Compare plans
          </h2>

          <div className="mt-10 rounded-3xl border border-white/10 bg-card/40 backdrop-blur-sm overflow-hidden">
            <div className="grid grid-cols-[1.5fr_1fr_1fr] divide-x divide-white/10">
              <div className="p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Feature
              </div>
              <div className="p-4 text-xs uppercase tracking-wider text-muted-foreground font-medium text-center">
                Free
              </div>
              <div className="p-4 text-xs uppercase tracking-wider text-primary font-medium text-center">
                Pro
              </div>
            </div>
            <ul className="divide-y divide-white/10">
              {compare.map((row) => (
                <li
                  key={row.label}
                  className="grid grid-cols-[1.5fr_1fr_1fr] divide-x divide-white/10"
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
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center">
            Frequently asked questions
          </h2>
          <div className="mt-10 space-y-3">
            {[
              {
                q: "Can I switch plans anytime?",
                a: "Yes. You can upgrade or downgrade at any time. Changes prorate automatically.",
              },
              {
                q: "Do you offer team pricing?",
                a: "Yes — contact us for team and enterprise pricing tailored to your headcount.",
              },
              {
                q: "Is my data safe?",
                a: "Files are processed in isolated workers and removed after delivery. We never train on your data.",
              },
              {
                q: "Do you support API access?",
                a: "Yes, on the Pro plan. See our documentation for endpoints and rate limits.",
              },
            ].map((f) => (
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
      <SiteFooter />
    </>
  )
}
