import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"

import SignalBadge from "@/components/SignalBadge"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type StockRow } from "@/lib/api"
import {
  filterAndSortStocks,
  type ScreenerFilter,
  type SortKey,
} from "@/lib/screener"

const PAGE_SIZE = 50

const columns: { key: SortKey; label: string; align: string }[] = [
  { key: "symbol", label: "Stock", align: "text-left" },
  { key: "close", label: "Close", align: "text-right" },
  { key: "rs", label: "RS", align: "text-right" },
  { key: "vol", label: "Volume", align: "text-right" },
  { key: "from_ath", label: "From high", align: "text-right" },
  { key: "trend", label: "Trend", align: "text-center" },
  { key: "leader", label: "Leader", align: "text-center" },
  { key: "breakout", label: "Setup", align: "text-center" },
]

const filters: { value: ScreenerFilter; label: string }[] = [
  { value: "all", label: "All liquid" },
  { value: "leaders", label: "RS leaders" },
  { value: "breakouts", label: "Breakouts" },
]

function formatNumber(value?: number | null, digits = 0) {
  if (value === undefined || value === null) return "—"
  return value.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function isFilter(value: string | null): value is ScreenerFilter {
  return value === "all" || value === "leaders" || value === "breakouts"
}

function StockStatus({ value, positive, label }: { value: boolean; positive: string; label: string }) {
  return <span aria-label={`${label}: ${value ? positive : "No"}`} className={value ? "font-medium text-primary" : "text-muted-foreground"}>{value ? positive : "—"}</span>
}

function StockCard({ stock }: { stock: StockRow }) {
  return (
    <article className="border border-border bg-card/70 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link to={`/stock/${stock.isin}`} className="font-semibold hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            {stock.symbol || stock.isin}
          </Link>
          <p className="mt-1 truncate text-xs text-muted-foreground">{stock.name || stock.exchange || "Name unavailable"}</p>
        </div>
        <SignalBadge tone={stock.breakout ? "signal" : "neutral"}>{stock.breakout ? "Breakout" : "Monitor"}</SignalBadge>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-y-3 text-sm">
        <div><dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Close</dt><dd className="mt-1 font-data font-semibold">{formatNumber(stock.close, 2)}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">RS</dt><dd className="mt-1 font-data font-semibold">{formatNumber(stock.rs)}</dd></div>
        <div><dt className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Volume</dt><dd className="mt-1 font-data font-semibold">{formatNumber(stock.vol_ratio, 2)}×</dd></div>
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">Trend {stock.in_uptrend ? "intact" : "not confirmed"} · {stock.leader ? "RS leader" : "below RS threshold"}</p>
    </article>
  )
}

export default function Screener() {
  const [searchParams] = useSearchParams()
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<ScreenerFilter>(() => {
    const value = searchParams.get("filter")
    return isFilter(value) ? value : "all"
  })
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "rs", dir: "desc" })
  const [visibleRows, setVisibleRows] = useState(PAGE_SIZE)

  useEffect(() => {
    api.universe()
      .then((data) => setStocks(data.stocks))
      .catch(() => setError("Could not load the liquid universe. Run make snapshot, then refresh this page."))
      .finally(() => setLoading(false))
  }, [])

  const liquidTotal = useMemo(() => stocks.filter((stock) => stock.liquid).length, [stocks])
  const rows = useMemo(() => filterAndSortStocks(stocks, { filter, query, sort }), [filter, query, sort, stocks])
  const displayedRows = rows.slice(0, visibleRows)

  const updateFilter = (value: ScreenerFilter) => {
    setFilter(value)
    setVisibleRows(PAGE_SIZE)
  }

  const updateSort = (key: SortKey) => {
    setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }))
    setVisibleRows(PAGE_SIZE)
  }

  const reset = () => {
    setFilter("all")
    setQuery("")
    setSort({ key: "rs", dir: "desc" })
    setVisibleRows(PAGE_SIZE)
  }

  if (loading) {
    return <div className="space-y-5" aria-label="Loading screener"><Skeleton className="h-10 w-44" /><Skeleton className="h-12 w-full" /><Skeleton className="h-96 w-full" /></div>
  }

  if (error) {
    return <p className="border-l-2 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 border-b border-border pb-6 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Comparison workspace</p>
          <h1 className="mt-2 text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">Screener</h1>
          <p className="mt-3 text-sm text-muted-foreground">Find liquid stocks, compare the signals, then open a name for context.</p>
        </div>
        <p className="font-data text-sm text-muted-foreground">{rows.length.toLocaleString("en-IN")} of {liquidTotal.toLocaleString("en-IN")} liquid stocks</p>
      </header>

      <section className="border border-border bg-card/70 p-4 sm:p-5" aria-label="Screener controls">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <label htmlFor="stock-search" className="text-sm font-medium">Search stocks</label>
            <input
              id="stock-search"
              name="stock-search"
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setVisibleRows(PAGE_SIZE) }}
              placeholder="Symbol, company, or ISIN…"
              className="mt-2 h-10 w-full max-w-xl border border-input bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Quick filters">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={filter === item.value}
                onClick={() => updateFilter(item.value)}
                className={`border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${filter === item.value ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                {item.label}
              </button>
            ))}
            {(filter !== "all" || query || sort.key !== "rs" || sort.dir !== "desc") && (
              <button type="button" onClick={reset} className="px-2 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Reset</button>
            )}
          </div>
        </div>
      </section>

      {rows.length === 0 ? (
        <section className="border border-dashed border-border bg-card/60 px-5 py-12 text-center" aria-live="polite">
          <h2 className="font-semibold">No stocks match these filters.</h2>
          <p className="mt-2 text-sm text-muted-foreground">Clear the search or switch to a broader filter.</p>
          <button type="button" onClick={reset} className="mt-4 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Reset screener</button>
        </section>
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {displayedRows.map((stock) => <StockCard key={stock.isin} stock={stock} />)}
          </div>
          <div className="hidden overflow-x-auto border border-border bg-card/70 md:block">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <caption className="sr-only">Liquid equities matching the active screener filters</caption>
              <thead className="sticky top-16 z-10 bg-muted text-muted-foreground">
                <tr>
                  {columns.map((column) => {
                    const sorted = sort.key === column.key
                    return (
                      <th key={column.key} scope="col" aria-sort={sorted ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`${column.align} border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-[0.1em]`}>
                        <button type="button" onClick={() => updateSort(column.key)} className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                          {column.label}<span aria-hidden="true">{sorted ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}</span>
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((stock) => (
                  <tr key={stock.isin} className="[content-visibility:auto] border-b border-border/70 transition-colors hover:bg-muted/50">
                    <th scope="row" className="sticky left-0 bg-card/95 px-4 py-3 text-left font-normal backdrop-blur">
                      <Link to={`/stock/${stock.isin}`} className="font-semibold hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">{stock.symbol || stock.isin}</Link>
                      <span className="ml-2 font-data text-[11px] text-muted-foreground">{stock.exchange}</span>
                      {stock.name && <span className="mt-1 block max-w-48 truncate text-xs text-muted-foreground">{stock.name}</span>}
                    </th>
                    <td className="px-4 py-3 text-right font-data">{formatNumber(stock.close, 2)}</td>
                    <td className="px-4 py-3 text-right font-data">{formatNumber(stock.rs)}</td>
                    <td className="px-4 py-3 text-right font-data">{formatNumber(stock.vol_ratio, 2)}×</td>
                    <td className="px-4 py-3 text-right font-data">{formatNumber(stock.from_ath_pct, 1)}%</td>
                    <td className="px-4 py-3 text-center"><StockStatus value={stock.in_uptrend} positive="Yes" label="Trend" /></td>
                    <td className="px-4 py-3 text-center"><StockStatus value={stock.leader} positive="Yes" label="RS leader" /></td>
                    <td className="px-4 py-3 text-center"><StockStatus value={stock.breakout} positive="Now" label="Breakout" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {displayedRows.length < rows.length && (
            <div className="flex justify-center pt-2"><button type="button" onClick={() => setVisibleRows((current) => current + PAGE_SIZE)} className="border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Show 50 more</button></div>
          )}
        </>
      )}
    </div>
  )
}
