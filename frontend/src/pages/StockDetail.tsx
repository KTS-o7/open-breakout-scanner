import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"

import MetricCard from "@/components/MetricCard"
import PriceChart from "@/components/PriceChart"
import SignalBadge from "@/components/SignalBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type OhlcBar, type StockRow } from "@/lib/api"

function formatNumber(value?: number | null, digits = 0) {
  if (value === undefined || value === null) return "—"
  return value.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

export default function StockDetail() {
  const { isin } = useParams<{ isin: string }>()
  const [data, setData] = useState<(StockRow & { bars: OhlcBar[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isin) return
    api.stock(isin)
      .then(setData)
      .catch(() => setError("Could not load this stock from the latest snapshot. Return to the screener and choose another name."))
      .finally(() => setLoading(false))
  }, [isin])

  const recentBars = useMemo(() => [...(data?.bars || [])].reverse().slice(0, 15), [data])

  if (loading) {
    return <div className="space-y-6" aria-label="Loading stock detail"><Skeleton className="h-5 w-40" /><Skeleton className="h-12 w-72" /><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>
  }

  if (error) {
    return <p className="border-l-2 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>
  }

  if (!data) return null

  return (
    <div className="space-y-8">
      <header className="border-b border-border pb-6">
        <Link to="/screener" className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Back to screener</Link>
        <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div className="min-w-0">
            <p className="font-data text-xs uppercase tracking-[0.14em] text-muted-foreground">{data.exchange} · {data.isin}</p>
            <h1 className="mt-2 text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">{data.symbol || data.isin}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{data.name || "Company name unavailable in this snapshot"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SignalBadge tone={data.breakout ? "signal" : "neutral"}>{data.breakout ? "Breakout active" : "No active breakout"}</SignalBadge>
            <SignalBadge>{data.liquid ? "Liquid" : "Below liquidity threshold"}</SignalBadge>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-border lg:grid-cols-4" aria-label="Stock measures">
        <MetricCard label="Close" value={formatNumber(data.close, 2)} detail="latest session" />
        <MetricCard label="Relative strength" value={formatNumber(data.rs)} detail="percentile rank" />
        <MetricCard label="Volume ratio" value={`${formatNumber(data.vol_ratio, 2)}×`} detail="versus average" />
        <MetricCard label="From 250-day high" value={`${formatNumber(data.from_ath_pct, 1)}%`} detail="latest close" />
      </section>

      <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0"><PriceChart bars={data.bars} symbol={data.symbol || data.isin} /></div>
        <aside className="border-t border-border pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0" aria-label="Qualification status">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Rule status</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Current context</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">Liquidity</dt><dd className="font-medium">{data.liquid ? "Pass" : "Review"}</dd></div>
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">Trend</dt><dd className="font-medium">{data.in_uptrend ? "Intact" : "Not confirmed"}</dd></div>
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">Relative strength</dt><dd className="font-medium">{data.leader ? "Leader" : "Below threshold"}</dd></div>
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">Breakout</dt><dd className="font-medium">{data.breakout ? "On volume" : "No signal"}</dd></div>
          </dl>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">Read the price context and rules together. This page does not recommend a trade.</p>
        </aside>
      </section>

      <section aria-labelledby="sessions-heading">
        <div className="border-b border-border pb-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Raw data</p><h2 id="sessions-heading" className="mt-1 text-2xl font-semibold tracking-[-0.04em]">Recent sessions</h2></div>
        <div className="mt-4 overflow-x-auto border border-border bg-card/70">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Most recent fifteen trading sessions for {data.symbol || data.isin}</caption>
            <thead className="bg-muted text-xs uppercase tracking-[0.1em] text-muted-foreground"><tr><th scope="col" className="px-4 py-3 text-left">Date</th><th scope="col" className="px-4 py-3 text-right">Open</th><th scope="col" className="px-4 py-3 text-right">High</th><th scope="col" className="px-4 py-3 text-right">Low</th><th scope="col" className="px-4 py-3 text-right">Close</th><th scope="col" className="px-4 py-3 text-right">Volume</th><th scope="col" className="px-4 py-3 text-right">50-day</th><th scope="col" className="px-4 py-3 text-right">200-day</th></tr></thead>
            <tbody>{recentBars.map((bar) => <tr key={bar.dt} className="border-t border-border/70"><th scope="row" className="px-4 py-2 text-left font-data font-normal">{bar.dt}</th><td className="px-4 py-2 text-right font-data">{formatNumber(bar.open, 2)}</td><td className="px-4 py-2 text-right font-data">{formatNumber(bar.high, 2)}</td><td className="px-4 py-2 text-right font-data">{formatNumber(bar.low, 2)}</td><td className="px-4 py-2 text-right font-data font-semibold">{formatNumber(bar.close, 2)}</td><td className="px-4 py-2 text-right font-data">{formatNumber(bar.volume)}</td><td className="px-4 py-2 text-right font-data">{formatNumber(bar.ma50, 1)}</td><td className="px-4 py-2 text-right font-data">{formatNumber(bar.ma200, 1)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
