"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"

export interface LegalSection {
  id: string
  title: string
  body: string[]
}

interface LegalLayoutProps {
  sections: LegalSection[]
}

export function LegalContent({ sections }: LegalLayoutProps) {
  const [activeId, setActiveId] = useState(sections[0]?.id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: "-30% 0px -60% 0px" },
    )

    sections.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [sections])

  return (
    <div className="relative mx-auto max-w-6xl px-6 pb-24">
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-10 lg:gap-16">
        <aside className="lg:sticky lg:top-24 lg:self-start hidden lg:block">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
            On this page
          </p>
          <nav aria-label="Section navigation">
            <ul className="space-y-1">
              {sections.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`#${s.id}`}
                    className={cn(
                      "block text-sm py-1.5 px-3 rounded-md transition-colors",
                      activeId === s.id
                        ? "text-foreground bg-white/5"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <article className="max-w-3xl">
          {sections.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className="scroll-mt-24 mb-12 last:mb-0"
            >
              <h2 className="text-2xl font-semibold tracking-tight">
                {s.title}
              </h2>
              <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
                {s.body.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </article>
      </div>
    </div>
  )
}
