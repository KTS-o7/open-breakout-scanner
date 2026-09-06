import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import Backtest from "./Backtest"

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it("does not request a backtest until the user runs one", () => {
  render(<Backtest />)

  expect(fetchMock).not.toHaveBeenCalled()
  expect(screen.getByRole("button", { name: "Run backtest" })).toBeEnabled()
})
