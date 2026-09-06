import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import StockDetail from "./StockDetail"

const detail = {
  isin: "INE000000001",
  symbol: "ALPHA",
  name: "Alpha Industries Ltd",
  exchange: "NSE",
  close: 105,
  rs: 90,
  vol_ratio: 2.4,
  from_ath_pct: -1.2,
  liquid: true,
  leader: true,
  breakout: true,
  in_uptrend: true,
  bars: [
    { dt: "2026-09-03", open: 100, high: 103, low: 99, close: 101, volume: 1_000, ma50: 95, ma200: 85 },
    { dt: "2026-09-04", open: 101, high: 106, low: 100, close: 105, volume: 2_000, ma50: 96, ma200: 86 },
  ],
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => detail }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it("provides a return route and chart", async () => {
  render(
    <MemoryRouter initialEntries={["/stock/INE000000001"]}>
      <Routes><Route path="/stock/:isin" element={<StockDetail />} /></Routes>
    </MemoryRouter>
  )

  expect(await screen.findByRole("link", { name: "Back to screener" })).toBeVisible()
  expect(screen.getByLabelText("Price history chart")).toBeVisible()
})
