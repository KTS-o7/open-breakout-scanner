import type { StockRow } from "./api"

export type ScreenerFilter = "all" | "leaders" | "breakouts"
export type SortKey = "symbol" | "close" | "rs" | "vol" | "from_ath" | "trend" | "leader" | "breakout"
export type SortDirection = "asc" | "desc"

export type ScreenerOptions = {
  filter: ScreenerFilter
  query: string
  sort: { key: SortKey; dir: SortDirection }
}

function matchesFilter(row: StockRow, filter: ScreenerFilter): boolean {
  if (filter === "leaders") return row.leader
  if (filter === "breakouts") return row.breakout
  return true
}

function matchesQuery(row: StockRow, query: string): boolean {
  if (!query) return true
  return [row.symbol, row.name, row.isin].some((value) => value?.toLowerCase().includes(query))
}

function numberValue(value: number | null | undefined): number {
  return value ?? 0
}

function compareRows(left: StockRow, right: StockRow, key: SortKey): number {
  switch (key) {
    case "symbol":
      return (left.symbol || left.isin).localeCompare(right.symbol || right.isin)
    case "close":
      return numberValue(left.close) - numberValue(right.close)
    case "rs":
      return numberValue(left.rs) - numberValue(right.rs)
    case "vol":
      return numberValue(left.vol_ratio) - numberValue(right.vol_ratio)
    case "from_ath":
      return numberValue(left.from_ath_pct) - numberValue(right.from_ath_pct)
    case "trend":
      return Number(left.in_uptrend) - Number(right.in_uptrend)
    case "leader":
      return Number(left.leader) - Number(right.leader)
    case "breakout":
      return Number(left.breakout) - Number(right.breakout)
  }
}

export function filterAndSortStocks(rows: StockRow[], options: ScreenerOptions): StockRow[] {
  const query = options.query.trim().toLowerCase()
  const direction = options.sort.dir === "asc" ? 1 : -1

  return rows
    .filter((row) => row.liquid && matchesFilter(row, options.filter) && matchesQuery(row, query))
    .toSorted((left, right) => compareRows(left, right, options.sort.key) * direction)
}
