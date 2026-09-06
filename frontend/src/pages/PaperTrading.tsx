import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

import MetricCard from "@/components/MetricCard"
import SignalBadge from "@/components/SignalBadge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, type PaperAccount, type PaperTrade, type Snapshot, type StockRow } from "@/lib/api"

const inputClassName = "h-10 w-full border border-input bg-background px-3 font-data text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

function formatCurrency(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value)
}

function formatPrice(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

function titleForStatus(status: PaperTrade["status"]) {
  return {
    planned: "Waiting for next session",
    open: "Open",
    exit_pending: "Exit at next open",
    closed: "Closed",
    skipped: "Skipped",
  }[status]
}

function TradeTable({ empty, trades, title }: { empty: string; trades: PaperTrade[]; title: string }) {
  return (
    <section aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
        <h2 className="text-lg font-semibold tracking-[-0.025em]" id={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}>{title}</h2>
        <span className="font-data text-xs text-muted-foreground">{trades.length}</span>
      </div>
      {trades.length === 0 ? (
        <p className="py-5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="overflow-x-auto border-x border-b border-border bg-card/70">
          <table className="min-w-[780px] w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.1em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3" scope="col">Stock</th>
                <th className="px-3 py-3" scope="col">Status</th>
                <th className="px-3 py-3 text-right" scope="col">Quantity</th>
                <th className="px-3 py-3 text-right" scope="col">Max entry</th>
                <th className="px-3 py-3 text-right" scope="col">Stop</th>
                <th className="px-3 py-3 text-right" scope="col">Fill / exit</th>
                <th className="px-4 py-3 text-right" scope="col">Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr className="border-t border-border" key={trade.id}>
                  <th className="px-4 py-3 text-left font-medium" scope="row">
                    <span>{trade.symbol}</span>
                    <span className="mt-0.5 block font-data text-xs font-normal text-muted-foreground">Planned {trade.plannedOn}</span>
                  </th>
                  <td className="px-3 py-3"><SignalBadge tone={trade.status === "closed" && (trade.netPnl || 0) < 0 ? "neutral" : "signal"}>{titleForStatus(trade.status)}</SignalBadge></td>
                  <td className="px-3 py-3 text-right font-data">{trade.quantity}</td>
                  <td className="px-3 py-3 text-right font-data">{formatPrice(trade.maximumEntry)}</td>
                  <td className="px-3 py-3 text-right font-data">{formatPrice(trade.stopPrice)}</td>
                  <td className="px-3 py-3 text-right font-data text-muted-foreground">
                    {trade.exitPrice != null ? formatPrice(trade.exitPrice) : trade.entryPrice != null ? formatPrice(trade.entryPrice) : "—"}
                    {(trade.exitReason || trade.entryDate) && <span className="mt-0.5 block text-xs">{trade.exitReason || trade.entryDate}</span>}
                  </td>
                  <td className={`px-4 py-3 text-right font-data ${trade.netPnl != null && trade.netPnl < 0 ? "text-destructive" : "text-primary"}`}>
                    {formatCurrency(trade.netPnl)}
                    {trade.taxReserve ? <span className="mt-0.5 block text-xs text-muted-foreground">tax reserve {formatCurrency(trade.taxReserve)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function defaultPlan(stock: StockRow) {
  const close = stock.close || 0
  return { maximumEntry: (close * 1.02).toFixed(2), stopPrice: (close * 0.92).toFixed(2) }
}

export default function PaperTrading() {
  const [searchParams] = useSearchParams()
  const [account, setAccount] = useState<PaperAccount | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [selectedIsin, setSelectedIsin] = useState("")
  const [maximumEntry, setMaximumEntry] = useState("")
  const [stopPrice, setStopPrice] = useState("")
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const candidates = useMemo(
    () => (snapshot?.stocks || []).filter((stock) => stock.liquid && stock.breakout),
    [snapshot],
  )
  const selected = candidates.find((stock) => stock.isin === selectedIsin) || null
  const plannedTrades = useMemo(() => (account?.trades || []).filter((trade) => trade.status === "planned"), [account])
  const openTrades = useMemo(() => (account?.trades || []).filter((trade) => trade.status === "open" || trade.status === "exit_pending"), [account])
  const closedTrades = useMemo(() => (account?.trades || []).filter((trade) => trade.status === "closed" || trade.status === "skipped"), [account])

  useEffect(() => {
    let current = true
    Promise.all([api.paper(), api.universe()])
      .then(([nextAccount, nextSnapshot]) => {
        if (!current) return
        const nextCandidates = nextSnapshot.stocks.filter((stock) => stock.liquid && stock.breakout)
        const preferred = searchParams.get("isin")
        const stock = nextCandidates.find((candidate) => candidate.isin === preferred) || nextCandidates[0]
        setAccount(nextAccount)
        setSnapshot(nextSnapshot)
        if (stock) {
          const plan = defaultPlan(stock)
          setSelectedIsin(stock.isin)
          setMaximumEntry(plan.maximumEntry)
          setStopPrice(plan.stopPrice)
        }
      })
      .catch(() => current && setError("Could not load the local paper account. Start the backend and refresh this page."))
      .finally(() => current && setLoading(false))
    return () => { current = false }
  }, [searchParams])

  const changeCandidate = (isin: string) => {
    const stock = candidates.find((candidate) => candidate.isin === isin)
    setSelectedIsin(isin)
    if (stock) {
      const plan = defaultPlan(stock)
      setMaximumEntry(plan.maximumEntry)
      setStopPrice(plan.stopPrice)
    }
  }

  const submitPlan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    setSubmitting(true)
    setError(null)
    setNotice(null)
    try {
      const nextAccount = await api.planPaperTrade({
        isin: selected.isin,
        maximumEntry: Number(maximumEntry),
        stopPrice: Number(stopPrice),
      })
      setAccount(nextAccount)
      setNotice("Paper plan recorded. It will use the next available local trading session for its simulated fill.")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The paper plan could not be recorded.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div aria-label="Loading local paper account" className="space-y-6"><Skeleton className="h-6 w-40" /><Skeleton className="h-12 w-80" /><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>
  }

  if (error && !account) {
    return <p className="border-l-2 border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">{error}</p>
  }

  if (!account) return null

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-5 border-b border-border pb-6 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Practice only</p>
          <h1 className="mt-2 text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">Local paper account</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Plan cash-equity delivery trades from the local breakout snapshot. This simulator never contacts a broker or submits a real order.</p>
        </div>
        <p className="max-w-xs border-l-2 border-primary pl-3 text-xs leading-5 text-muted-foreground">Protective price rule: a planned buy fills only at the next available open when it is no higher than your maximum entry.</p>
      </header>

      <section className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-border lg:grid-cols-4" aria-label="Paper account summary">
        <MetricCard detail="virtual starting cash" label="Initial capital" value={formatCurrency(account.initialCapital)} />
        <MetricCard detail="after provisional tax reserve" emphasis label="Paper equity" value={formatCurrency(account.afterTaxEquity)} />
        <MetricCard detail={`of ${formatCurrency(account.cash)} cash`} label="Available to plan" value={formatCurrency(account.availableCash)} />
        <MetricCard detail={`${account.riskPct}% of paper equity`} label="Maximum planned loss" value={formatCurrency(account.plannedRisk)} />
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="border-border shadow-none">
          <CardHeader className="border-b border-border px-5 py-4 sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Approval step</p>
            <CardTitle className="mt-1 text-xl tracking-[-0.03em]">Plan one paper trade</CardTitle>
          </CardHeader>
          <CardContent className="p-5 sm:p-6">
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">There are no eligible liquid breakouts in the current snapshot. Staying in cash is a valid outcome.</p>
            ) : (
              <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { void submitPlan(event) }}>
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Eligible breakout</span>
                  <select className={inputClassName} value={selectedIsin} onChange={(event) => changeCandidate(event.target.value)}>
                    {candidates.map((stock) => <option key={stock.isin} value={stock.isin}>{stock.symbol || stock.isin}</option>)}
                  </select>
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Maximum entry price</span>
                  <input className={inputClassName} min="0.01" onChange={(event) => setMaximumEntry(event.target.value)} required step="0.01" type="number" value={maximumEntry} />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Initial stop price</span>
                  <input className={inputClassName} min="0.01" onChange={(event) => setStopPrice(event.target.value)} required step="0.01" type="number" value={stopPrice} />
                </label>
                <div className="sm:col-span-2 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                  <Button disabled={submitting} type="submit">{submitting ? "Recording…" : "Record paper plan"}</Button>
                  <p className="text-xs text-muted-foreground">{selected ? `${selected.symbol || selected.isin} close: ${formatPrice(selected.close)}` : "Choose a candidate"}</p>
                </div>
              </form>
            )}
            {notice && <p className="mt-4 border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm" role="status">{notice}</p>}
            {error && <p className="mt-4 border-l-2 border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>}
          </CardContent>
        </Card>

        <aside className="border-t border-border pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0" aria-label="Paper account assumptions">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Guardrails</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">The rules in use</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="border-b border-border pb-3"><dt className="text-muted-foreground">Capital</dt><dd className="mt-1 font-medium">Cash delivery only</dd></div>
            <div className="border-b border-border pb-3"><dt className="text-muted-foreground">New trade risk</dt><dd className="mt-1 font-medium">{account.riskPct}% of paper equity</dd></div>
            <div className="border-b border-border pb-3"><dt className="text-muted-foreground">Active positions</dt><dd className="mt-1 font-medium">At most {account.maxPositions}</dd></div>
            <div className="border-b border-border pb-3"><dt className="text-muted-foreground">Estimated trading cost</dt><dd className="mt-1 font-medium">{account.estimatedCostPct}% on each side</dd></div>
            <div className="border-b border-border pb-3"><dt className="text-muted-foreground">Tax treatment</dt><dd className="mt-1 font-medium">{account.taxReservePct}% reserve on profitable exits</dd></div>
          </dl>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">The cost and tax figures are conservative learning assumptions, not a broker contract note or tax calculation. The ledger uses local end-of-day data, so update data and rebuild the snapshot after market close.</p>
        </aside>
      </div>

      <div className="space-y-7">
        <TradeTable empty="No paper orders are waiting for the next local session." title="Planned orders" trades={plannedTrades} />
        <TradeTable empty="No paper positions are currently open." title="Open positions" trades={openTrades} />
        <TradeTable empty="Closed and skipped paper trades will appear here." title="Completed trades" trades={closedTrades} />
      </div>
    </div>
  )
}
