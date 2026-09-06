import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import Screener from "./Screener"

const snapshot = {
  as_of: "2026-09-04",
  health: { universe: 2, in_uptrend: 1, pct_uptrend: 50, leaders: 1, breaking_out: 1 },
  stocks: [
    { isin: "1", symbol: "ALPHA", liquid: true, leader: true, breakout: true, in_uptrend: true, rs: 90 },
    { isin: "2", symbol: "BETA", liquid: true, leader: false, breakout: false, in_uptrend: false, rs: 80 },
    { isin: "3", symbol: "GAMMA", liquid: false, leader: true, breakout: true, in_uptrend: true, rs: 99 },
  ],
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it("shows result count and an empty state after a search", async () => {
  render(<MemoryRouter><Screener /></MemoryRouter>)

  fireEvent.change(await screen.findByLabelText("Search stocks"), { target: { value: "missing" } })

  expect(screen.getByText("0 of 2 liquid stocks")).toBeVisible()
  expect(screen.getByText("No stocks match these filters.")).toBeVisible()
})
