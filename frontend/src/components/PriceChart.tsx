import type { OhlcBar } from "@/lib/api"

type PriceChartProps = {
  bars: OhlcBar[]
  symbol: string
}

const WIDTH = 720
const HEIGHT = 260
const PADDING = { top: 16, right: 16, bottom: 28, left: 48 }

function valuesFor(bars: OhlcBar[]) {
  return bars.flatMap((bar) => [bar.close, bar.ma50, bar.ma200].filter((value): value is number => typeof value === "number" && Number.isFinite(value)))
}

function pathFor(bars: OhlcBar[], field: "close" | "ma50" | "ma200", min: number, max: number) {
  const chartWidth = WIDTH - PADDING.left - PADDING.right
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom
  const range = max - min || 1
  return bars.flatMap((bar, index) => {
    const value = bar[field]
    if (typeof value !== "number" || !Number.isFinite(value)) return []
    const x = PADDING.left + (index / Math.max(bars.length - 1, 1)) * chartWidth
    const y = PADDING.top + ((max - value) / range) * chartHeight
    return [`${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`]
  }).join(" ")
}

export default function PriceChart({ bars, symbol }: PriceChartProps) {
  if (bars.length < 2) {
    return <p className="border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">Not enough price history to draw a chart.</p>
  }

  const values = valuesFor(bars)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const padding = (rawMax - rawMin || rawMax * 0.04 || 1) * 0.08
  const min = rawMin - padding
  const max = rawMax + padding
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom
  const labelDate = bars[bars.length - 1]?.dt

  return (
    <figure>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em]">Price context</h2>
          <p className="mt-1 text-sm text-muted-foreground">Latest 252 sessions · ending {labelDate}</p>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground" aria-label="Chart legend">
          <span><i className="mr-1 inline-block size-2 rounded-full bg-primary" aria-hidden="true" />Close</span>
          <span><i className="mr-1 inline-block size-2 rounded-full bg-foreground/60" aria-hidden="true" />50-day</span>
          <span><i className="mr-1 inline-block size-2 rounded-full bg-muted-foreground" aria-hidden="true" />200-day</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Price history chart" className="h-auto w-full border border-border bg-background/60" preserveAspectRatio="none">
        <title>{symbol} price history with 50-day and 200-day moving averages</title>
        {[0, 0.5, 1].map((position) => {
          const y = PADDING.top + position * chartHeight
          const value = max - position * (max - min)
          return <g key={position}><line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} className="stroke-border" strokeWidth="1" /><text x={PADDING.left - 8} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">{value.toFixed(0)}</text></g>
        })}
        <path d={pathFor(bars, "ma200", min, max)} className="fill-none stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="4 4" />
        <path d={pathFor(bars, "ma50", min, max)} className="fill-none stroke-foreground/60" strokeWidth="1.5" />
        <path d={pathFor(bars, "close", min, max)} className="fill-none stroke-primary" strokeWidth="2.25" />
        <text x={PADDING.left} y={HEIGHT - 8} className="fill-muted-foreground text-[10px]">{bars[0]?.dt}</text>
        <text x={WIDTH - PADDING.right} y={HEIGHT - 8} textAnchor="end" className="fill-muted-foreground text-[10px]">{labelDate}</text>
      </svg>
    </figure>
  )
}
