import type { ReactNode } from "react"

type SignalBadgeProps = {
  children: ReactNode
  tone?: "signal" | "neutral"
}

export default function SignalBadge({ children, tone = "neutral" }: SignalBadgeProps) {
  return (
    <span
      className={
        tone === "signal"
          ? "inline-flex items-center border border-primary/30 bg-primary/[0.08] px-2 py-1 text-[11px] font-medium text-primary"
          : "inline-flex items-center border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground"
      }
    >
      {children}
    </span>
  )
}
