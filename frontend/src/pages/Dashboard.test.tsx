import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import Dashboard from "./Dashboard"

const snapshot = {
  as_of: "2026-09-04",
  health: { universe: 1, in_uptrend: 1, pct_uptrend: 100, leaders: 1, breaking_out: 1 },
  stocks: [
    {
      isin: "INE000000001",
      symbol: "ALPHA",
      exchange: "NSE",
      close: 100,
      rs: 90,
      vol_ratio: 2.4,
      from_ath_pct: 0,
      liquid: true,
      leader: true,
      breakout: true,
      in_uptrend: true,
    },
  ],
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it("labels why every displayed candidate qualifies", async () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>)

  expect(await screen.findByText("Breakout on volume")).toBeVisible()
  expect(screen.getByText("1 eligible candidate today")).toBeVisible()
  expect(screen.getByText("Trend intact")).toBeVisible()
})
