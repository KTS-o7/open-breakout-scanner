import { expect, it } from "vitest"

import { chartPath } from "./PriceChart"

it("starts a moving-average path at its first available value", () => {
  const path = chartPath(
    [
      { close: 100, ma50: 95 },
      { close: 102, ma50: 96, ma200: 90 },
    ],
    "ma200",
    80,
    110,
  )

  expect(path).toMatch(/^M/)
})
