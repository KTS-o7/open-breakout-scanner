import { render, screen } from "@testing-library/react"
import { expect, it } from "vitest"

import App from "./App"

it("keeps primary routes reachable from navigation", () => {
  render(<App />)

  expect(screen.getByRole("link", { name: "Today" })).toBeVisible()
  expect(screen.getByRole("link", { name: "Screener" })).toBeVisible()
  expect(screen.getByRole("link", { name: "Backtest" })).toBeVisible()
})
