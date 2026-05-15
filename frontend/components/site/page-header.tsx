import { AnimatedBackground } from "./animated-background"

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  children?: React.ReactNode
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: PageHeaderProps) {
  return (
    <section className="relative isolate overflow-hidden pt-32 sm:pt-40 pb-12 sm:pb-16">
      <AnimatedBackground variant="dot" />
      <div className="relative mx-auto max-w-4xl px-6 text-center">
        {eyebrow && (
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
        )}
        <h1 className="mt-2 text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-balance leading-[1.05]">
          {title}
        </h1>
        {description && (
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground leading-relaxed text-pretty">
            {description}
          </p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  )
}
