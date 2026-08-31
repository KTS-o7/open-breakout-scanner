const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api"

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`)
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

export const api = {
  health: () => fetchJson<Health>("/health"),
  universe: () => fetchJson<Snapshot>("/universe"),
  breakouts: (days = 1) => fetchJson<BreakoutEvent[]>(`/breakouts?days=${days}`),
  ohlc: (isin: string) => fetchJson<OhlcBar[]>(`/ohlc/${isin}`),
  stock: (isin: string) => fetchJson<StockRow & { bars: OhlcBar[] }>(`/stock/${isin}`),
}
