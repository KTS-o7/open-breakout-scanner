import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import PaperTrading from "./PaperTrading"

const paperAccount = {
  initialCapital: 100000,
  cash: 100000,
  reservedCash: 0,
  availableCash: 100000,
  marketValue: 0,
  equity: 100000,
  afterTaxEquity: 100000,
  taxReserve: 0,
  plannedRisk: 250,
  riskPct: 0.25,
  maxPositions: 3,
  maxPositionPct: 30,
  estimatedCostPct: 0.15,
  taxReservePct: 20,
  trades: [],
}

const snapshot = {
  as_of: "2026-09-04",
  health: { universe: 3, in_uptrend: 2, pct_uptrend: 66.7, leaders: 2, breaking_out: 1 },
  stocks: [
    { isin: "INE000000001", symbol: "ALPHA", close: 100, liquid: true, breakout: true, leader: true, in_uptrend: true },
    { isin: "INE000000002", symbol: "BETA", close: 100, liquid: true, breakout: false, leader: true, in_uptrend: true },
    { isin: "INE000000003", symbol: "GAMMA", close: 100, liquid: false, breakout: true, leader: true, in_uptrend: true },
  ],
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation((request: string) => {
    const body = request.includes("/paper") ? paperAccount : snapshot
    return Promise.resolve({ ok: true, json: async () => body })
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it("offers only current liquid breakouts for an explicit paper plan", async () => {
  render(<MemoryRouter><PaperTrading /></MemoryRouter>)

  expect(await screen.findByRole("heading", { name: "Local paper account" })).toBeVisible()
  expect(screen.getByRole("option", { name: "ALPHA" })).toBeVisible()
  expect(screen.queryByRole("option", { name: "BETA" })).not.toBeInTheDocument()
  expect(screen.queryByRole("option", { name: "GAMMA" })).not.toBeInTheDocument()
  expect(screen.getByDisplayValue("102.00")).toBeVisible()
  expect(screen.getByDisplayValue("92.00")).toBeVisible()
})
