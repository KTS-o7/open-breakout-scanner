import { useEffect, useMemo, useState } from "react"
import { api, type Health, type StockRow } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

function numberFmt(n?: number) {
  if (n === undefined || n === null) return "-"
  return n.toLocaleString("en-IN")
}

export default function Dashboard() {
  const [snap, setSnap] = useState<{ as_of: string; health: Health; stocks: StockRow[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.universe()
      .then((data) => setSnap(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const breakouts = useMemo(
    () => (snap?.stocks || []).filter((s) => s.liquid && s.breakout).slice(0, 50),
    [snap]
  )

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-baseline justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-44" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }
  if (error) return <div className="p-8 text-destructive">{error}</div>
  if (!snap) return null

  const h = snap.health

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span className="text-sm text-muted-foreground">As of {snap.as_of}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Universe</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{numberFmt(h.universe)}</div>
            <p className="text-xs text-muted-foreground">liquid names</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Uptrend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{h.pct_uptrend}%</div>
            <p className="text-xs text-muted-foreground">{numberFmt(h.in_uptrend)} stocks</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leaders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{numberFmt(h.leaders)}</div>
            <p className="text-xs text-muted-foreground">RS ≥ 70, in trend</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Breaking Out</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{numberFmt(h.breaking_out)}</div>
            <p className="text-xs text-muted-foreground">today</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s Breakouts</CardTitle>
        </CardHeader>
        <CardContent>
          {breakouts.length === 0 ? (
            <p className="text-muted-foreground">No breakouts detected.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2">Symbol</th>
                    <th className="text-right py-2">Close</th>
                    <th className="text-right py-2">RS</th>
                    <th className="text-right py-2">Vol ×</th>
                    <th className="text-right py-2">From ATH</th>
                  </tr>
                </thead>
                <tbody>
                  {breakouts.map((s) => (
                    <tr key={s.isin} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <a href={`#/stock/${s.isin}`} className="hover:underline">
                          {s.symbol || s.isin}
                        </a>
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {s.exchange}
                        </Badge>
                      </td>
                      <td className="text-right py-2">{numberFmt(s.close)}</td>
                      <td className="text-right py-2">{s.rs}</td>
                      <td className="text-right py-2">{s.vol_ratio?.toFixed(2)}</td>
                      <td className="text-right py-2">{s.from_ath_pct?.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
