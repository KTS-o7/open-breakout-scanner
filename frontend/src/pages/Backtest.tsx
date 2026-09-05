import { useEffect, useMemo, useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

interface BTResult {
  total: { n: number; win: number; mean: number; avgWin: number; avgLoss: number; days: number }
  byYear: { yr: number; n: number; win: number; mean: number }[]
  portfolio: { start: number; end: number; mult: number; cagr: number; maxdd: number; log: any[] }
  stop: number
  sell: string
  risk: number
  maxpos: number
}

function exportCsv(result: BTResult) {
  const cols = ["symbol", "isin", "entry", "buy", "exit", "sell", "return_pct", "days", "rs", "invested", "open", "why"] as const
  const esc = (v: any) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = (result.portfolio.log || []).map((t: any) => [
    t.sym || t.isin, t.isin, t.bo ?? "", t.buy ?? "", t.exit ?? "", t.sell ?? "",
    t.ret ?? "", t.days ?? "", t.rs ?? "", t.invested ?? "", t.open ?? "", t.why ?? "",
  ])
  const csv = [cols.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = "backtest-trades.csv"
  a.click()
  URL.revokeObjectURL(url)
}

export default function Backtest() {
  const [params, setParams] = useState({ stop: 8, sell: "ma50", risk: 1.5, maxpos: 5, market: "all", entry: "close" })
  const [result, setResult] = useState<BTResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = () => {
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams(params as any).toString()
    fetch(`${import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api"}/backtest?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d) => setResult(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    run()
  }, [])

  const closed = useMemo(() => (result?.portfolio?.log || []).filter((t: any) => !t.open), [result])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Backtest</h1>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Stop %</label>
              <select className="border rounded px-2 py-1" value={params.stop} onChange={(e) => setParams({ ...params, stop: Number(e.target.value) })}>
                <option value={7}>7%</option>
                <option value={8}>8%</option>
                <option value={10}>10%</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Sell rule</label>
              <select className="border rounded px-2 py-1" value={params.sell} onChange={(e) => setParams({ ...params, sell: e.target.value })}>
                <option value="ma50">Trail 50-day</option>
                <option value="ma150">Trail 30-week</option>
                <option value="t25">Take +25%</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Risk %</label>
              <select className="border rounded px-2 py-1" value={params.risk} onChange={(e) => setParams({ ...params, risk: Number(e.target.value) })}>
                <option value={1}>1%</option>
                <option value={1.5}>1.5%</option>
                <option value={2}>2%</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Max pos</label>
              <select className="border rounded px-2 py-1" value={params.maxpos} onChange={(e) => setParams({ ...params, maxpos: Number(e.target.value) })}>
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={8}>8</option>
                <option value={10}>10</option>
              </select>
            </div>
            <Button onClick={run} disabled={loading}>{loading ? "Running…" : "Run scan ▸"}</Button>
          </div>
        </CardContent>
      </Card>

      {error && <div className="text-destructive">{error}</div>}

      {loading && !result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-8 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-24" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Multiple</div><div className="text-2xl font-bold">{result.portfolio.mult.toFixed(2)}×</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">CAGR</div><div className="text-2xl font-bold">{result.portfolio.cagr.toFixed(1)}%</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Max DD</div><div className="text-2xl font-bold">{result.portfolio.maxdd.toFixed(1)}%</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Win rate</div><div className="text-2xl font-bold">{result.total.win}%</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Trade log</CardTitle>
                <Button variant="outline" size="sm" disabled={!result.portfolio.log?.length} onClick={() => exportCsv(result)}>Export CSV</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground border-b">
                    <tr><th className="text-left py-2">Symbol</th><th className="text-left py-2">Entry</th><th className="text-left py-2">Exit</th><th className="text-right py-2">Buy</th><th className="text-right py-2">Sell</th><th className="text-right py-2">Return</th><th className="text-right py-2">Days</th><th className="text-left py-2">Why</th></tr>
                  </thead>
                  <tbody>
                    {closed.map((t: any) => (
                      <tr key={t.isin + t.bo} className="border-b last:border-0">
                        <td className="py-1 font-medium">{t.sym || t.isin}</td>
                        <td className="py-1">{t.bo}</td>
                        <td className="py-1">{t.exit || "open"}</td>
                        <td className="text-right py-1">{t.buy.toFixed(2)}</td>
                        <td className="text-right py-1">{t.sell?.toFixed(2) ?? "—"}</td>
                        <td className={`text-right py-1 ${t.ret > 0 ? "text-green-600" : "text-red-600"}`}>{t.ret.toFixed(2)}%</td>
                        <td className="text-right py-1">{t.days}</td>
                        <td className="py-1 text-muted-foreground">{t.why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
