import { useMemo, useState } from "react"

import MetricCard from "@/components/MetricCard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

type BacktestParams = {
  stop: number
  sell: "ma50" | "ma150" | "t25"
  risk: number
  maxpos: number
  market: "all" | "strong"
}

type Trade = {
  isin: string
  sym?: string
  bo?: string
  buy: number
  exit?: string
  sell?: number
  ret: number
  days: number
  rs?: number
  invested?: number
  open: boolean
  why?: string
}

interface BTResult {
  total: { n: number; win: number; mean: number; avgWin: number; avgLoss: number; days: number }
  byYear: { yr: number; n: number; win: number; mean: number }[]
  portfolio: { start: number; end: number; mult: number; cagr: number; maxdd: number; log: Trade[] }
  stop: number
  sell: string
  risk: number
  maxpos: number
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api"

function formatCurrency(value: number | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: number | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`
}

function exportCsv(result: BTResult) {
  const cols = ["symbol", "isin", "entry", "buy", "exit", "sell", "return_pct", "days", "rs", "invested", "open", "why"] as const
  const esc = (value: unknown) => {
    const text = value == null ? "" : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const rows = (result.portfolio.log || []).map((trade) => [
    trade.sym || trade.isin,
    trade.isin,
    trade.bo ?? "",
    trade.buy ?? "",
    trade.exit ?? "",
    trade.sell ?? "",
    trade.ret ?? "",
    trade.days ?? "",
    trade.rs ?? "",
    trade.invested ?? "",
    trade.open ?? "",
    trade.why ?? "",
  ])
  const csv = [cols.join(","), ...rows.map((row) => row.map(esc).join(","))].join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = "backtest-trades.csv"
  link.click()
  URL.revokeObjectURL(url)
}

function ConfigurationField({ children, label, htmlFor }: { children: React.ReactNode; label: string; htmlFor: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  )
}

const selectClassName = "h-10 w-full border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

export default function Backtest() {
  const [params, setParams] = useState<BacktestParams>({ stop: 8, sell: "ma50", risk: 1.5, maxpos: 5, market: "all" })
  const [result, setResult] = useState<BTResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)

    try {
      const query = new URLSearchParams({
        stop: String(params.stop),
        sell: params.sell,
        risk: String(params.risk),
        maxpos: String(params.maxpos),
        market: params.market,
        entry: "close",
      }).toString()
      const response = await fetch(`${API_BASE_URL}/backtest?${query}`)
      if (!response.ok) throw new Error(`The backtest could not run (${response.status}).`)
      setResult(await response.json())
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The backtest could not run.")
    } finally {
      setLoading(false)
    }
  }

  const closedTrades = useMemo(() => (result?.portfolio?.log || []).filter((trade) => !trade.open), [result])

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Rules laboratory</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">Validate the rules.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Choose the risk rules, then run the complete local history. No calculation starts just by opening this page.</p>
      </header>

      <Card className="border-border shadow-none">
        <CardContent className="p-5 sm:p-6">
          <form aria-busy={loading} className="space-y-5" onSubmit={(event) => { event.preventDefault(); void run() }}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <ConfigurationField htmlFor="stop" label="Initial stop">
                <select className={selectClassName} id="stop" name="stop" value={params.stop} onChange={(event) => setParams({ ...params, stop: Number(event.target.value) })}>
                  <option value={7}>7%</option>
                  <option value={8}>8%</option>
                  <option value={10}>10%</option>
                </select>
              </ConfigurationField>
              <ConfigurationField htmlFor="sell" label="Exit rule">
                <select className={selectClassName} id="sell" name="sell" value={params.sell} onChange={(event) => setParams({ ...params, sell: event.target.value as BacktestParams["sell"] })}>
                  <option value="ma50">Close below 50-day</option>
                  <option value="ma150">Close below 30-week</option>
                  <option value="t25">Take profit at 25%</option>
                </select>
              </ConfigurationField>
              <ConfigurationField htmlFor="risk" label="Account risk">
                <select className={selectClassName} id="risk" name="risk" value={params.risk} onChange={(event) => setParams({ ...params, risk: Number(event.target.value) })}>
                  <option value={1}>1%</option>
                  <option value={1.5}>1.5%</option>
                  <option value={2}>2%</option>
                </select>
              </ConfigurationField>
              <ConfigurationField htmlFor="maxpos" label="Maximum positions">
                <select className={selectClassName} id="maxpos" name="maxpos" value={params.maxpos} onChange={(event) => setParams({ ...params, maxpos: Number(event.target.value) })}>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={8}>8</option>
                  <option value={10}>10</option>
                </select>
              </ConfigurationField>
              <ConfigurationField htmlFor="market" label="Market filter">
                <select className={selectClassName} id="market" name="market" value={params.market} onChange={(event) => setParams({ ...params, market: event.target.value as BacktestParams["market"] })}>
                  <option value="all">All conditions</option>
                  <option value="strong">Strong market only</option>
                </select>
              </ConfigurationField>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button disabled={loading} type="submit">{loading ? "Running…" : "Run backtest"}</Button>
              <p className="text-xs text-muted-foreground">Entries are modelled at the signal-day close. A full run can take a few minutes.</p>
            </div>
          </form>
        </CardContent>
      </Card>

      <div aria-live="polite" className="sr-only">{loading ? "Running the full local universe." : ""}</div>

      {error && <div className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">{error}</div>}

      {loading && !result && (
        <section aria-label="Backtest loading" className="space-y-4">
          <p className="text-sm text-muted-foreground">Running the full local universe. This can take a few minutes.</p>
          <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div className="bg-card p-4" key={index}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-7 w-28" />
              </div>
            ))}
          </div>
        </section>
      )}

      {!result && !loading && !error && (
        <section className="border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">
          Set the rules above, then run the test when you are ready.
        </section>
      )}

      {result && (
        <section className="space-y-5" aria-labelledby="latest-run-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Latest run</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-foreground" id="latest-run-heading">Portfolio results</h2>
            </div>
            {loading && <p className="text-sm text-muted-foreground">Updating results…</p>}
          </div>

          <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard detail={`Started at ${formatCurrency(result.portfolio.start)}`} emphasis label="End equity" value={formatCurrency(result.portfolio.end)} />
            <MetricCard detail={`${result.total.n} total signals`} label="Closed trades" value={closedTrades.length} />
            <MetricCard detail="Closed positions only" label="Win rate" value={formatPercent(result.total.win)} />
            <MetricCard detail="Annualised return" label="CAGR" value={formatPercent(result.portfolio.cagr)} />
            <MetricCard detail="Peak to trough" label="Max drawdown" value={formatPercent(result.portfolio.maxdd)} />
          </div>

          <Card className="border-border shadow-none">
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
              <div>
                <CardTitle className="text-lg tracking-[-0.025em]">Closed trades</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Open positions remain in the exported log.</p>
              </div>
              <Button variant="outline" size="sm" disabled={!result.portfolio.log?.length} onClick={() => exportCsv(result)}>Export CSV</Button>
            </CardHeader>
            <CardContent className="p-0">
              {closedTrades.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground sm:px-6">No positions closed under these rules.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[780px] w-full border-collapse text-sm">
                    <thead className="bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                      <tr>
                        <th className="px-5 py-3 sm:px-6" scope="col">Stock</th>
                        <th className="px-3 py-3" scope="col">Entry</th>
                        <th className="px-3 py-3" scope="col">Exit</th>
                        <th className="px-3 py-3 text-right" scope="col">Buy</th>
                        <th className="px-3 py-3 text-right" scope="col">Sell</th>
                        <th className="px-3 py-3 text-right" scope="col">Return</th>
                        <th className="px-3 py-3 text-right" scope="col">Days</th>
                        <th className="px-3 py-3" scope="col">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closedTrades.map((trade) => (
                        <tr className="border-t border-border" key={`${trade.isin}-${trade.bo}`}>
                          <th className="px-5 py-3 text-left font-medium text-foreground sm:px-6" scope="row">{trade.sym || trade.isin}</th>
                          <td className="px-3 py-3 font-data text-muted-foreground">{trade.bo}</td>
                          <td className="px-3 py-3 font-data text-muted-foreground">{trade.exit || "—"}</td>
                          <td className="px-3 py-3 text-right font-data">{trade.buy.toFixed(2)}</td>
                          <td className="px-3 py-3 text-right font-data">{trade.sell?.toFixed(2) ?? "—"}</td>
                          <td className={`px-3 py-3 text-right font-data ${trade.ret > 0 ? "text-primary" : "text-destructive"}`}>{formatPercent(trade.ret)}</td>
                          <td className="px-3 py-3 text-right font-data">{trade.days}</td>
                          <td className="px-3 py-3 text-muted-foreground">{trade.why || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}
