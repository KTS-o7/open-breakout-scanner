const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api"

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.detail) message = body.detail
    } catch {
      // response wasn't JSON, keep the default message
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export type Health = {
  universe: number
  in_uptrend: number
  pct_uptrend: number
  leaders: number
  breaking_out: number
}

export type StockRow = {
  isin: string
  symbol?: string
  name?: string | null
  exchange?: string
  close?: number
  volume?: number
  rs?: number | null
  from_ath_pct?: number | null
  vol_ratio?: number | null
  in_uptrend: boolean
  leader: boolean
  liquid: boolean
  breakout: boolean
}

export type Snapshot = {
  as_of: string
  health: Health
  stocks: StockRow[]
}

export type OhlcBar = {
  dt: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  ma50?: number
  ma150?: number
  ma200?: number
}

export type BreakoutEvent = {
  d: string
  isin: string
  sym?: string
  name?: string | null
  close: number
  vol_ratio?: number
  rs?: number
}

export type PaperTradeRequest = {
  isin: string
  maximumEntry: number
  stopPrice: number
}

export type PaperTrade = {
  id: number
  isin: string
  symbol: string
  status: "planned" | "open" | "exit_pending" | "closed" | "skipped"
  plannedOn: string
  maximumEntry: number
  stopPrice: number
  quantity: number
  entryDate?: string | null
  entryPrice?: number | null
  exitDate?: string | null
  exitPrice?: number | null
  exitReason?: string | null
  netPnl?: number | null
  taxReserve?: number | null
  lastClose?: number | null
}

export type PaperAccount = {
  initialCapital: number
  cash: number
  reservedCash: number
  availableCash: number
  marketValue: number
  equity: number
  afterTaxEquity: number
  taxReserve: number
  plannedRisk: number
  riskPct: number
  maxPositions: number
  maxPositionPct: number
  estimatedCostPct: number
  taxReservePct: number
  trades: PaperTrade[]
}

export const api = {
  health: () => fetchJson<Health>("/health"),
  universe: () => fetchJson<Snapshot>("/universe"),
  breakouts: (days = 1) => fetchJson<BreakoutEvent[]>(`/breakouts?days=${days}`),
  ohlc: (isin: string) => fetchJson<OhlcBar[]>(`/ohlc/${isin}`),
  stock: (isin: string) => fetchJson<StockRow & { bars: OhlcBar[] }>(`/stock/${isin}`),
  paper: () => fetchJson<PaperAccount>("/paper"),
  planPaperTrade: (payload: PaperTradeRequest) => fetchJson<PaperAccount>("/paper/trades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }),
}
