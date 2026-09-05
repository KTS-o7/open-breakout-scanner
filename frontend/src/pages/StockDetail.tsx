import { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { api, type OhlcBar, type StockRow } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

export default function StockDetail() {
  const { isin } = useParams<{ isin: string }>()
  const [data, setData] = useState<(StockRow & { bars: OhlcBar[] }) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isin) return
    api.stock(isin)
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [isin])

  const stats = useMemo(() => {
    if (!data?.bars?.length) return null
    const closes = data.bars.map((b) => b.close)
    const high250 = Math.max(...closes)
    const low250 = Math.min(...closes)
    return { high250, low250 }
  }, [data])

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-baseline gap-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-16" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-56" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }
  if (error) return <div className="p-8 text-destructive">{error}</div>
  if (!data) return null

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold">{data.symbol || data.isin}</h1>
        {data.name && <span className="text-muted-foreground">{data.name}</span>}
        <Badge variant="outline">{data.exchange}</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Close</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{data.close}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">RS</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{data.rs ?? "-"}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Vol ×</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{data.vol_ratio?.toFixed(2) ?? "-"}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">From ATH</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{data.from_ath_pct?.toFixed(1) ?? "-"}%</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Price History (last 252 sessions)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="text-left py-2">Date</th>
                  <th className="text-right py-2">Open</th>
                  <th className="text-right py-2">High</th>
                  <th className="text-right py-2">Low</th>
                  <th className="text-right py-2">Close</th>
                  <th className="text-right py-2">Volume</th>
                  <th className="text-right py-2">50 MA</th>
                  <th className="text-right py-2">200 MA</th>
                </tr>
              </thead>
              <tbody>
                {[...data.bars].reverse().slice(0, 30).map((b) => (
                  <tr key={b.dt} className="border-b last:border-0">
                    <td className="py-1">{b.dt}</td>
                    <td className="text-right py-1">{b.open.toFixed(2)}</td>
                    <td className="text-right py-1">{b.high.toFixed(2)}</td>
                    <td className="text-right py-1">{b.low.toFixed(2)}</td>
                    <td className="text-right py-1 font-medium">{b.close.toFixed(2)}</td>
                    <td className="text-right py-1">{b.volume.toLocaleString("en-IN")}</td>
                    <td className="text-right py-1">{b.ma50?.toFixed(1) ?? "-"}</td>
                    <td className="text-right py-1">{b.ma200?.toFixed(1) ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stats && (
            <p className="text-xs text-muted-foreground mt-4">
              252-day range: {stats.low250.toFixed(2)} – {stats.high250.toFixed(2)}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
