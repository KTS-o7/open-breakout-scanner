import { useEffect, useMemo, useState } from "react"
import { api, type StockRow } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type SortKey = "symbol" | "close" | "rs" | "vol" | "from_ath" | "trend" | "leader" | "breakout"

const columns: { key: SortKey; label: string; cls: string }[] = [
  { key: "symbol", label: "Symbol", cls: "text-left py-3 px-4" },
  { key: "close", label: "Close", cls: "text-right py-3 px-4" },
  { key: "rs", label: "RS", cls: "text-right py-3 px-4" },
  { key: "vol", label: "Vol ×", cls: "text-right py-3 px-4" },
  { key: "from_ath", label: "From ATH", cls: "text-right py-3 px-4" },
  { key: "trend", label: "Trend", cls: "text-center py-3 px-4" },
  { key: "leader", label: "Leader", cls: "text-center py-3 px-4" },
  { key: "breakout", label: "Breakout", cls: "text-center py-3 px-4" },
]

export default function Screener() {
  const [stocks, setStocks] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "leaders" | "breakouts">("all")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "rs", dir: "desc" })

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
    const mult = sort.dir === "asc" ? 1 : -1
    const num = (v?: number | null) => v ?? 0
    return r.sort((a, b) => {
      let cmp = 0
      switch (sort.key) {
        case "symbol":
          cmp = (a.symbol || a.isin).localeCompare(b.symbol || b.isin)
          break
        case "close":
          cmp = num(a.close) - num(b.close)
          break
        case "rs":
          cmp = num(a.rs) - num(b.rs)
          break
        case "vol":
          cmp = num(a.vol_ratio) - num(b.vol_ratio)
          break
        case "from_ath":
          cmp = num(a.from_ath_pct) - num(b.from_ath_pct)
          break
        case "trend":
          cmp = Number(a.in_uptrend) - Number(b.in_uptrend)
          break
        case "leader":
          cmp = Number(a.leader) - Number(b.leader)
          break
        case "breakout":
          cmp = Number(a.breakout) - Number(b.breakout)
          break
      }
      return cmp * mult
    })
  }, [stocks, filter, sort])

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "symbol" ? "asc" : "desc" }
    )

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
                  {columns.map((c) => (
                    <th key={c.key} className={c.cls}>
                      <button
                        className="hover:text-foreground inline-flex items-center gap-1"
                        onClick={() => toggleSort(c.key)}
                      >
                        {c.label}
                        {sort.key === c.key && <span>{sort.dir === "asc" ? "▲" : "▼"}</span>}
                      </button>
                    </th>
                  ))}
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
