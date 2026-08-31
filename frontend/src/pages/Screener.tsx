import { useEffect, useMemo, useState } from "react"
import { api, type StockRow } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export default function Screener() {
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "leaders" | "breakouts">("all")

  useEffect(() => {
    api.universe()
      .then((d) => setStocks(d.stocks))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const rows = useMemo(() => {
    let r = stocks.filter((s) => s.liquid)
    if (filter === "leaders") r = r.filter((s) => s.leader)
    if (filter === "breakouts") r = r.filter((s) => s.breakout)
    return r.sort((a, b) => (b.rs ?? 0) - (a.rs ?? 0))
  }, [stocks, filter])

  if (loading) return <div className="p-8">Loading…</div>
  if (error) return <div className="p-8 text-destructive">{error}</div>

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Screener</h1>
        <div className="flex gap-2">
          {(["all", "leaders", "breakouts"] as const).map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b bg-muted/50">
                <tr>
                  <th className="text-left py-3 px-4">Symbol</th>
                  <th className="text-right py-3 px-4">Close</th>
                  <th className="text-right py-3 px-4">RS</th>
                  <th className="text-right py-3 px-4">Vol ×</th>
                  <th className="text-right py-3 px-4">From ATH</th>
                  <th className="text-center py-3 px-4">Trend</th>
                  <th className="text-center py-3 px-4">Leader</th>
                  <th className="text-center py-3 px-4">Breakout</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.isin} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2 px-4">
                      <a href={`#/stock/${s.isin}`} className="font-medium hover:underline">
                        {s.symbol || s.isin}
                      </a>
                      <Badge variant="outline" className="ml-2 text-[10px]">{s.exchange}</Badge>
                    </td>
                    <td className="text-right py-2 px-4">{s.close?.toLocaleString("en-IN")}</td>
                    <td className="text-right py-2 px-4">{s.rs ?? "-"}</td>
                    <td className="text-right py-2 px-4">{s.vol_ratio?.toFixed(2) ?? "-"}</td>
                    <td className="text-right py-2 px-4">{s.from_ath_pct?.toFixed(1) ?? "-"}%</td>
                    <td className="text-center py-2 px-4">{s.in_uptrend ? "✓" : "—"}</td>
                    <td className="text-center py-2 px-4">{s.leader ? "✓" : "—"}</td>
                    <td className="text-center py-2 px-4">{s.breakout ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
