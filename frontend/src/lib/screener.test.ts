import { expect, it } from "vitest"

import type { StockRow } from "./api"
import { filterAndSortStocks } from "./screener"

const rows: StockRow[] = [
  {
    isin: "INE000000001",
    symbol: "ALPHA",
    liquid: true,
    leader: true,
    breakout: true,
    in_uptrend: true,
    rs: 90,
  },
  {
    isin: "INE000000002",
    symbol: "BETA",
    liquid: true,
    leader: false,
    breakout: false,
    in_uptrend: false,
    rs: 80,
  },
  {
    isin: "INE000000003",
    symbol: "GAMMA",
    liquid: false,
    leader: true,
    breakout: true,
    in_uptrend: true,
    rs: 99,
  },
]

it("keeps only liquid matching breakout rows", () => {
  const output = filterAndSortStocks(rows, {
    filter: "breakouts",
    query: "alp",
    sort: { key: "rs", dir: "desc" },
  })

  expect(output.map((row) => row.symbol)).toEqual(["ALPHA"])
})
