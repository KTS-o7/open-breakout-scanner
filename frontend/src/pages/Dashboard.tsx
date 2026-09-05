import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"

import MetricCard from "@/components/MetricCard"
import SignalBadge from "@/components/SignalBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type Health, type StockRow } from "@/lib/api"

function numberFmt(value?: number | null) {
  if (value === undefined || value === null) return "—"
  return value.toLocaleString("en-IN")
}

function candidateLabel(count: number) {
  return `${count} eligible ${count === 1 ? "candidate" : "candidates"} today`
}

export default function Dashboard() {
  const [snap, setSnap] = useState<{ as_of: string; health: Health; stocks: StockRow[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.universe()
      .then(setSnap)
      .catch(() => setError("Could not load the latest snapshot. Run make snapshot, then refresh this page."))
      .finally(() => setLoading(false))
  }, [])

  const candidates = useMemo(
    () => (snap?.stocks || []).filter((stock) => stock.liquid && stock.breakout).slice(0, 8),
    [snap]
  )

  if (loading) {
    return (
      <div className="space-y-8" aria-label="Loading daily briefing">
        <div className="space-y-3"><Skeleton className="h-3 w-28" /><Skeleton className="h-10 w-64" /><Skeleton className="h-4 w-48" /></div>
        <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4"><Skeleton className="h-28 bg-card" /><Skeleton className="h-28 bg-card" /><Skeleton className="h-28 bg-card" /><Skeleton className="h-28 bg-card" /></div>
        <Skeleton className="h-96 w-full bg-card" />
      </div>
    )
  }

  if (error) {
    return <p className="border-l-2 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>
  }

  if (!snap) return null

  const { health } = snap

  return (
    <div className="space-y-9">
      <header className="flex flex-col justify-between gap-4 border-b border-border pb-6 md:flex-row md:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Daily briefing</p>
          <h1 className="mt-2 text-balance text-4xl font-semibold tracking-[-0.055em] text-foreground sm:text-5xl">Today&apos;s setup</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Liquid Indian equities that meet the breakout rules. Use this as a research queue, not a trading instruction.</p>
        </div>
        <div className="border-l-2 border-primary pl-3 text-sm">
          <p className="font-medium text-foreground">Snapshot ready</p>
          <time className="font-data text-xs text-muted-foreground" dateTime={snap.as_of}>As of {snap.as_of}</time>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-border lg:grid-cols-4" aria-label="Market snapshot">
        <MetricCard label="Eligible" value={numberFmt(health.breaking_out)} detail="liquid breakouts" emphasis />
        <MetricCard label="Trend breadth" value={`${health.pct_uptrend}%`} detail={`${numberFmt(health.in_uptrend)} stocks in trend`} />
        <MetricCard label="RS leaders" value={numberFmt(health.leaders)} detail="RS 70 or higher" />
        <MetricCard label="Liquid universe" value={numberFmt(health.universe)} detail="stocks screened" />
      </section>

      <section aria-labelledby="candidate-heading">
        <div className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Research queue</p>
            <h2 id="candidate-heading" className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{candidateLabel(health.breaking_out)}</h2>
          </div>
          <Link to="/screener?filter=breakouts" className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            View all candidates
          </Link>
        </div>

        {candidates.length === 0 ? (
          <div className="mt-5 border border-dashed border-border bg-card/60 px-5 py-10 text-center">
            <p className="font-medium">No eligible breakouts in this snapshot.</p>
            <p className="mt-2 text-sm text-muted-foreground">The full liquid universe remains available in the screener.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {candidates.map((stock) => (
              <article key={stock.isin} className="grid gap-4 py-5 md:grid-cols-[minmax(13rem,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link to={`/stock/${stock.isin}`} className="text-lg font-semibold tracking-[-0.025em] hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                      {stock.symbol || stock.isin}
                    </Link>
                    <span className="font-data text-xs text-muted-foreground">{stock.exchange}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{stock.name || "Company name unavailable"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <SignalBadge tone="signal">Breakout on volume</SignalBadge>
                    <SignalBadge>RS leader</SignalBadge>
                    <SignalBadge>Trend intact</SignalBadge>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-x-6 text-right sm:min-w-[18rem]">
                  <div><dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Close</dt><dd className="mt-1 font-data text-sm font-semibold">{numberFmt(stock.close)}</dd></div>
                  <div><dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">RS</dt><dd className="mt-1 font-data text-sm font-semibold">{numberFmt(stock.rs)}</dd></div>
                  <div><dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Volume</dt><dd className="mt-1 font-data text-sm font-semibold">{stock.vol_ratio?.toFixed(2) ?? "—"}×</dd></div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
