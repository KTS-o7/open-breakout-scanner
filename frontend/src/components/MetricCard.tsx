import type { ReactNode } from "react"

type MetricCardProps = {
  label: string
  value: ReactNode
  detail: string
  emphasis?: boolean
}

export default function MetricCard({ label, value, detail, emphasis = false }: MetricCardProps) {
  return (
    <section className={`border-l-2 px-4 py-3 ${emphasis ? "border-primary bg-primary/[0.06]" : "border-border bg-card/70"}`}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-data text-2xl font-semibold tracking-[-0.06em] text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </section>
  )
}
