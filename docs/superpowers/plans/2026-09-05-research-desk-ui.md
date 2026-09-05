# Research desk UI implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the generic dashboard with a responsive, accessible local research desk for finding, comparing, inspecting, and validating breakout candidates.

**Architecture:** Keep FastAPI contracts unchanged. Add small frontend-only view-model helpers for filtering and qualification labels, build reusable data-display primitives, and refactor each route around the user's workflow. Use inline SVG charts to avoid a charting dependency.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 3, Vitest, Testing Library.

---

### Task 1: Add a frontend test harness and screener model

**Files:**
- Modify: frontend/package.json
- Modify: frontend/vite.config.ts
- Create: frontend/src/lib/screener.ts
- Create: frontend/src/lib/screener.test.ts

- [ ] **Step 1: Write the failing screener test**

~~~ts
import { expect, it } from "vitest"
import { filterAndSortStocks } from "./screener"

it("keeps only liquid matching breakout rows", () => {
  const rows = [
    { isin: "1", symbol: "ALPHA", liquid: true, leader: true, breakout: true, rs: 90 },
    { isin: "2", symbol: "BETA", liquid: true, leader: false, breakout: false, rs: 80 },
    { isin: "3", symbol: "GAMMA", liquid: false, leader: true, breakout: true, rs: 99 },
  ]
  const output = filterAndSortStocks(rows, { filter: "breakouts", query: "alp", sort: { key: "rs", dir: "desc" } })
  expect(output.map((row) => row.symbol)).toEqual(["ALPHA"])
})
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: cd frontend && npm test -- screener.test.ts

Expected: failure because the test command and filterAndSortStocks do not exist.

- [ ] **Step 3: Add the test command and helper**

Add vitest, jsdom, @testing-library/react, and @testing-library/jest-dom as development dependencies. Configure test: { environment: "jsdom" } in Vite. Implement filterAndSortStocks as a pure function that keeps liquid rows, applies all, leaders, or breakouts, matches symbol/name/ISIN case-insensitively, and returns a copied sorted array.

~~~ts
export function filterAndSortStocks(rows: StockRow[], options: ScreenerOptions): StockRow[] {
  const query = options.query.trim().toLowerCase()
  return rows
    .filter((row) => row.liquid && matchesFilter(row, options.filter) && matchesQuery(row, query))
    .toSorted((left, right) => compareRows(left, right, options.sort))
}
~~~

- [ ] **Step 4: Run the focused test**

Run: cd frontend && npm test -- screener.test.ts

Expected: one passing test.

- [ ] **Step 5: Commit**

~~~bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/src/lib/screener.ts frontend/src/lib/screener.test.ts
git commit -m "test: cover screener filtering"
~~~

### Task 2: Establish the responsive research-desk shell

**Files:**
- Modify: frontend/src/App.tsx
- Modify: frontend/src/index.css
- Modify: frontend/index.html
- Create: frontend/src/App.test.tsx

- [ ] **Step 1: Write the failing shell test**

~~~tsx
it("keeps primary routes reachable from navigation", () => {
  render(<MemoryRouter><App /></MemoryRouter>)
  expect(screen.getByRole("link", { name: "Today" })).toBeVisible()
  expect(screen.getByRole("link", { name: "Screener" })).toBeVisible()
  expect(screen.getByRole("link", { name: "Backtest" })).toBeVisible()
})
~~~

- [ ] **Step 2: Run it to verify it fails**

Run: cd frontend && npm test -- App.test.tsx

Expected: failure because the current shell has no Today link and lacks mobile navigation.

- [ ] **Step 3: Implement the shell**

Replace the desktop-only sidebar with a semantic header and responsive nav. Add a skip link to #main-content, a focus-visible theme button, metadata description, warm/dark research-desk tokens, tabular figures, reduced-motion handling, and explicit transition properties.

~~~tsx
<a className="skip-link" href="#main-content">Skip to content</a>
<header><nav aria-label="Primary">…</nav></header>
<main id="main-content">{children}</main>
~~~

- [ ] **Step 4: Run the focused test**

Run: cd frontend && npm test -- App.test.tsx

Expected: pass.

- [ ] **Step 5: Commit**

~~~bash
git add frontend/src/App.tsx frontend/src/index.css frontend/index.html frontend/src/App.test.tsx
git commit -m "feat: add responsive research desk shell"
~~~

### Task 3: Make Today a concise candidate briefing

**Files:**
- Modify: frontend/src/pages/Dashboard.tsx
- Create: frontend/src/components/SignalBadge.tsx
- Create: frontend/src/components/MetricCard.tsx
- Create: frontend/src/pages/Dashboard.test.tsx

- [ ] **Step 1: Write the failing dashboard test**

~~~tsx
it("labels why every displayed candidate qualifies", async () => {
  render(<Dashboard />)
  expect(await screen.findByText("Breakout on volume")).toBeVisible()
  expect(screen.getByText("18 eligible today")).toBeVisible()
})
~~~

- [ ] **Step 2: Run it to verify it fails**

Run: cd frontend && npm test -- Dashboard.test.tsx

Expected: failure because the current table has no qualification labels or candidate-count label.

- [ ] **Step 3: Implement the briefing**

Show as-of status and compact metrics. Limit today's liquid breakout list to eight. Add Breakout on volume, RS leader, and Trend intact labels, link View all candidates to the screener, and render loading, no-data, and connection-error states.

- [ ] **Step 4: Run focused tests and commit**

Run: cd frontend && npm test -- Dashboard.test.tsx

Expected: pass.

~~~bash
git add frontend/src/pages/Dashboard.tsx frontend/src/pages/Dashboard.test.tsx frontend/src/components/SignalBadge.tsx frontend/src/components/MetricCard.tsx
git commit -m "feat: focus dashboard on eligible candidates"
~~~

### Task 4: Build a searchable comparison workspace

**Files:**
- Modify: frontend/src/pages/Screener.tsx
- Modify: frontend/src/lib/screener.ts
- Create: frontend/src/pages/Screener.test.tsx

- [ ] **Step 1: Write the failing page test**

~~~tsx
it("shows result count and empty state after a search", async () => {
  render(<Screener />)
  await userEvent.type(await screen.findByLabelText("Search stocks"), "missing")
  expect(screen.getByText("0 of 2 liquid stocks")).toBeVisible()
  expect(screen.getByText("No stocks match these filters.")).toBeVisible()
})
~~~

- [ ] **Step 2: Run it to verify it fails**

Run: cd frontend && npm test -- Screener.test.tsx

Expected: failure because no labelled search, result count, or empty state exists.

- [ ] **Step 3: Implement the screener**

Use filterAndSortStocks and local state. Add aria-pressed quick filters, labelled symbol search, result count, reset action, sticky table heading and symbol column, sort buttons with aria-sort, text status labels, and a narrow-screen result-card layout. Apply content-visibility: auto to long table rows.

- [ ] **Step 4: Run focused tests and commit**

Run: cd frontend && npm test -- Screener.test.tsx frontend/src/lib/screener.test.ts

Expected: pass.

~~~bash
git add frontend/src/pages/Screener.tsx frontend/src/pages/Screener.test.tsx frontend/src/lib/screener.ts frontend/src/lib/screener.test.ts
git commit -m "feat: make screener fast to filter and compare"
~~~

### Task 5: Give stock detail decision context

**Files:**
- Modify: frontend/src/pages/StockDetail.tsx
- Create: frontend/src/components/PriceChart.tsx
- Create: frontend/src/pages/StockDetail.test.tsx

- [ ] **Step 1: Write the failing detail test**

~~~tsx
it("provides a return route and chart", async () => {
  render(<StockDetail />)
  expect(await screen.findByRole("link", { name: "Back to screener" })).toBeVisible()
  expect(screen.getByLabelText("Price history chart")).toBeVisible()
})
~~~

- [ ] **Step 2: Run it to verify it fails**

Run: cd frontend && npm test -- StockDetail.test.tsx

Expected: failure because the page has neither back link nor chart.

- [ ] **Step 3: Implement the detail view**

Add a Back to screener link, a summary block with price, RS, volume, distance from high, qualification labels, and a responsive inline SVG chart for close, 50-day MA, and 200-day MA. Label the SVG and retain the recent-session table below it.

- [ ] **Step 4: Run focused test and commit**

Run: cd frontend && npm test -- StockDetail.test.tsx

Expected: pass.

~~~bash
git add frontend/src/pages/StockDetail.tsx frontend/src/pages/StockDetail.test.tsx frontend/src/components/PriceChart.tsx
git commit -m "feat: add stock decision context"
~~~

### Task 6: Make validation deliberate and comprehensible

**Files:**
- Modify: frontend/src/pages/Backtest.tsx
- Create: frontend/src/pages/Backtest.test.tsx

- [ ] **Step 1: Write the failing backtest test**

~~~tsx
it("does not request a backtest until the user runs one", () => {
  render(<Backtest />)
  expect(global.fetch).not.toHaveBeenCalled()
  expect(screen.getByRole("button", { name: "Run backtest" })).toBeEnabled()
})
~~~

- [ ] **Step 2: Run it to verify it fails**

Run: cd frontend && npm test -- Backtest.test.tsx

Expected: failure because a mount effect starts the current backtest request.

- [ ] **Step 3: Implement explicit validation**

Remove the mount effect. Add named and labelled settings for stop, exit, risk, position limit, market condition, and entry. Show rules, a Run backtest button, an aria-live progress message, a few-minutes warning, preserved old results while rerunning, and ending equity/trade-count/win-rate/CAGR/max-drawdown before the detailed log.

- [ ] **Step 4: Run focused test and commit**

Run: cd frontend && npm test -- Backtest.test.tsx

Expected: pass.

~~~bash
git add frontend/src/pages/Backtest.tsx frontend/src/pages/Backtest.test.tsx
git commit -m "feat: make backtest an explicit validation step"
~~~

### Task 7: Verify the research workflow in a browser

**Files:**
- Verify: frontend/src/App.tsx
- Verify: frontend/src/pages/Dashboard.tsx
- Verify: frontend/src/pages/Screener.tsx
- Verify: frontend/src/pages/StockDetail.tsx
- Verify: frontend/src/pages/Backtest.tsx

- [ ] **Step 1: Run automated checks**

Run: make test && cd frontend && npm test -- --run && npm run build && git diff --check

Expected: backend tests, frontend tests, production build, and whitespace checks pass.

- [ ] **Step 2: Test the local workflow in-browser**

At widths 1280px, 768px, and 390px, verify that Today's candidate count matches the API, screener search/filter/sort opens stock detail, back navigation works, and Backtest makes no request until Run backtest is selected.

- [ ] **Step 3: Test keyboard and state behaviour**

Tab through skip link, navigation, theme control, filter buttons, search, table links, and backtest controls. Verify visible focus and helpful empty/loading/error states; inspect the browser console for errors.

- [ ] **Step 4: Commit final integration**

~~~bash
git add frontend
git commit -m "feat: deliver usable local research desk"
~~~
