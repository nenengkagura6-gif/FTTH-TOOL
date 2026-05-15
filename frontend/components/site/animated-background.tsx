import { cn } from "@/lib/utils"

interface AnimatedBackgroundProps {
  variant?: "grid" | "dot"
  className?: string
}

/**
 * Decorative animated background with subtle grid/dot pattern,
 * radial fade and floating glow blobs. Pure CSS — keeps perf high.
 */
export function AnimatedBackground({
  variant = "grid",
  className,
}: AnimatedBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      {/* Pattern */}
      <div
        className={cn(
          "absolute inset-0 radial-fade opacity-70",
          variant === "grid" ? "grid-bg" : "dot-bg",
        )}
      />

      {/* Floating glows */}
      <div className="absolute top-[-10%] left-[10%] w-[500px] h-[500px] rounded-full bg-primary/10 blur-[120px] animate-float-slow" />
      <div
        className="absolute bottom-[-15%] right-[5%] w-[400px] h-[400px] rounded-full bg-primary/[0.06] blur-[100px] animate-float-slow"
        style={{ animationDelay: "-6s" }}
      />

      {/* Top fade */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-background to-transparent" />
      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent" />
    </div>
  )
}
