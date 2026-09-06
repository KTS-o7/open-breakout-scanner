# Local paper trading implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only cash-equity paper account that lets the user plan qualified breakout trades, simulates next-session execution, and records after-cost and provisional-after-tax results without ever connecting to a broker.

**Architecture:** `backend/compute/paper.py` owns a separate, ignored SQLite ledger at `data/paper.db`. It derives account balances from ledger rows and the existing local OHLCV data; a pending buy fills only at the next available session open when it is no higher than the user’s maximum entry. API routes expose the read model and a single plan-trade action; React renders that data in a new Paper account route and links qualifying stock research to the planning form.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, SQLite, pandas, React 19, TypeScript, Vite, Tailwind, Vitest and Testing Library.

---

## File structure

- Create `backend/compute/paper.py`: SQLite schema, paper-account calculation, next-session fill and stop/50-day exit simulation, and candidate/position validation.
- Create `backend/tests/test_paper.py`: focused deterministic tests against a temporary paper database and synthetic OHLCV bars.
- Modify `backend/api/models.py`: request and response models for the local paper account.
- Modify `backend/api/routes.py`: `GET /api/paper` and `POST /api/paper/trades` routes.
- Modify `backend/tests/test_routes.py`: route-level proof that only a current liquid breakout can be planned.
- Create `frontend/src/pages/PaperTrading.tsx`: account summary, candidate plan form, open/planned/closed ledger views, and local-only warning.
- Create `frontend/src/pages/PaperTrading.test.tsx`: user-visible candidate filtering and paper-account rendering test.
- Modify `frontend/src/lib/api.ts`: typed paper-account API client.
- Modify `frontend/src/App.tsx`: Paper account navigation and route.
- Modify `frontend/src/pages/StockDetail.tsx`: link a qualified research page to the preselected paper-trade form.
- Modify `frontend/src/App.test.tsx`: prove the Paper account route is reachable.
- Modify `README.md`: paper-trading routine and explicit simulation/tax limitations.

### Task 1: Specify paper-ledger behaviour with failing backend tests

**Files:**
- Create: `backend/tests/test_paper.py`
- Reference: `backend/compute/indicators.py`

- [ ] **Step 1: Write failing tests for an eligible planned order**

```python
def test_plan_trade_fills_at_next_open_when_under_maximum_entry(monkeypatch, tmp_path):
    ledger = _use_temp_ledger(monkeypatch, tmp_path)
    monkeypatch.setattr(paper, "read_bars", lambda isin: _bars([100.0, 101.0]))
    account = paper.plan_trade(_candidate(), "INE000000001", 102.0, 92.0)
    trade = account["trades"][0]
    assert trade["status"] == "open"
    assert trade["entryPrice"] == 101.0
    assert trade["entryDate"] == "2026-09-05"
    assert ledger.exists()
```

- [ ] **Step 2: Run the new test and verify it fails because `backend.compute.paper` does not exist**

Run: `. .venv/bin/activate && pytest backend/tests/test_paper.py::test_plan_trade_fills_at_next_open_when_under_maximum_entry -v`

Expected: collection failure naming the missing `paper` module.

- [ ] **Step 3: Add failing tests for price protection, stop-gap handling and breakout validation**

```python
def test_plan_trade_skips_a_next_open_above_the_maximum_entry(monkeypatch, tmp_path):
    _use_temp_ledger(monkeypatch, tmp_path)
    monkeypatch.setattr(paper, "read_bars", lambda isin: _bars([100.0, 105.0]))
    trade = paper.plan_trade(_candidate(), "INE000000001", 102.0, 92.0)["trades"][0]
    assert trade["status"] == "skipped"
    assert trade["exitReason"] == "Opened above maximum entry"


def test_open_position_uses_the_open_when_price_gaps_below_stop(monkeypatch, tmp_path):
    _use_temp_ledger(monkeypatch, tmp_path)
    monkeypatch.setattr(paper, "read_bars", lambda isin: _bars([100.0, 100.0, 90.0]))
    trade = paper.plan_trade(_candidate(), "INE000000001", 102.0, 92.0)["trades"][0]
    assert trade["status"] == "closed"
    assert trade["exitPrice"] == 90.0
    assert trade["exitReason"] == "Gap through stop"


def test_plan_trade_rejects_a_stock_that_is_not_a_liquid_breakout(tmp_path):
    with pytest.raises(ValueError, match="eligible liquid breakout"):
        paper.plan_trade(_candidate(breakout=False), "INE000000001", 102.0, 92.0)
```

- [ ] **Step 4: Run the backend paper test file and verify every new test fails for the missing feature**

Run: `. .venv/bin/activate && pytest backend/tests/test_paper.py -v`

Expected: failures caused by unavailable paper-ledger behaviour, not fixture or import mistakes.

### Task 2: Implement the local ledger and simulation engine

**Files:**
- Create: `backend/compute/paper.py`
- Test: `backend/tests/test_paper.py`

- [ ] **Step 1: Implement a one-account, project-local SQLite schema**

```python
PAPER_DB_PATH = ROOT / "data" / "paper.db"
INITIAL_CAPITAL = 100_000.0
RISK_PCT = 0.25
MAX_OPEN_POSITIONS = 3
MAX_POSITION_PCT = 30.0
ESTIMATED_COST_RATE = 0.0015
SHORT_TERM_TAX_RESERVE_RATE = 0.20
```

The ledger must store the immutable plan (`planned_on`, maximum entry, stop, quantity), actual entry/exit facts, and a simulation status. It must not write to `obs.db`, change market data, call a broker, or run a trade automatically without the user’s explicit `POST` request.

- [ ] **Step 2: Implement `plan_trade`**

```python
def plan_trade(snapshot: dict, isin: str, maximum_entry: float, stop_price: float) -> dict:
    """Store one user-approved qualified plan and synchronise it from local OHLCV."""
```

It must require a snapshot row whose `liquid` and `breakout` flags are both true, require `0 < stop_price < maximum_entry`, reject a duplicate active symbol and reject a fourth active plan/position. Quantity must be floor-rounded from 0.25% of account after-tax equity and capped at 30% of available cash.

- [ ] **Step 3: Implement chronological synchronisation**

```python
def sync_trade(trade: dict) -> None:
    # The first bar after planned_on: fill at its open only if open <= maximum_entry.
    # An open at or below the stop is skipped; an open above maximum_entry is skipped.
    # Once filled: exit at the open for a gap below stop, at stop for an intraday low,
    # or at the next open after a close below the 50-day average.
```

All fills must deduct an estimated 0.15% per side. Closed profitable trades must show a 20% provisional short-term tax reserve separately from final tax filing; losses and surcharge/cess/set-off must not be claimed as calculated.

- [ ] **Step 4: Run `backend/tests/test_paper.py` and verify it passes**

Run: `. .venv/bin/activate && pytest backend/tests/test_paper.py -v`

Expected: all paper-ledger tests pass.

### Task 3: Expose a narrow paper-account API

**Files:**
- Modify: `backend/api/models.py`
- Modify: `backend/api/routes.py`
- Modify: `backend/tests/test_routes.py`

- [ ] **Step 1: Write the failing API test**

```python
def test_paper_trade_route_rejects_an_ineligible_snapshot_row(monkeypatch):
    monkeypatch.setattr(routes, "_latest_snapshot", lambda: {"as_of": "2026-09-04", "stocks": [{"isin": "INE1", "liquid": True, "breakout": False}]})
    client = TestClient(app)
    response = client.post("/api/paper/trades", json={"isin": "INE1", "maximumEntry": 102, "stopPrice": 92})
    assert response.status_code == 422
```

- [ ] **Step 2: Run the route test and verify it fails because the route does not exist**

Run: `. .venv/bin/activate && pytest backend/tests/test_routes.py::test_paper_trade_route_rejects_an_ineligible_snapshot_row -v`

Expected: `404` rather than the required validation response.

- [ ] **Step 3: Add Pydantic contracts and routes**

```python
@router.get("/paper", response_model=models.PaperAccount)
def get_paper_account() -> models.PaperAccount:
    return models.PaperAccount(**paper.get_account())


@router.post("/paper/trades", response_model=models.PaperAccount)
def create_paper_trade(payload: models.PaperTradeRequest) -> models.PaperAccount:
    try:
        return models.PaperAccount(**paper.plan_trade(_latest_snapshot(), payload.isin, payload.maximumEntry, payload.stopPrice))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
```

- [ ] **Step 4: Run backend route and paper tests**

Run: `. .venv/bin/activate && pytest backend/tests/test_paper.py backend/tests/test_routes.py -v`

Expected: all selected tests pass.

### Task 4: Specify the paper-account UI with failing tests

**Files:**
- Create: `frontend/src/pages/PaperTrading.test.tsx`
- Modify: `frontend/src/App.test.tsx`

- [ ] **Step 1: Write a failing page test for the account and eligible-candidate form**

```tsx
it("offers only current liquid breakouts for an explicit paper plan", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation((request: string) => {
    const body = request.includes("/paper") ? paperAccount : snapshot
    return Promise.resolve({ ok: true, json: async () => body })
  }))
  render(<PaperTrading />)
  expect(await screen.findByRole("heading", { name: "Local paper account" })).toBeVisible()
  expect(screen.getByRole("option", { name: /ALPHA/ })).toBeVisible()
  expect(screen.queryByRole("option", { name: /BETA/ })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the new test and confirm it fails because the page is missing**

Run: `npm test -- --run src/pages/PaperTrading.test.tsx`

Expected: import failure for `PaperTrading`.

- [ ] **Step 3: Add a failing route-navigation assertion**

```tsx
expect(screen.getByRole("link", { name: "Paper account" })).toBeVisible()
```

- [ ] **Step 4: Run the application test and confirm it fails because the route is absent**

Run: `npm test -- --run src/App.test.tsx`

Expected: missing navigation link assertion.

### Task 5: Implement the typed local UI and research link

**Files:**
- Create: `frontend/src/pages/PaperTrading.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/StockDetail.tsx`
- Test: `frontend/src/pages/PaperTrading.test.tsx`
- Test: `frontend/src/App.test.tsx`

- [ ] **Step 1: Add the typed client contract**

```ts
export type PaperAccount = {
  initialCapital: number
  availableCash: number
  afterTaxEquity: number
  plannedRisk: number
  maxPositions: number
  estimatedCostPct: number
  taxReservePct: number
  trades: PaperTrade[]
}

paper: () => fetchJson<PaperAccount>("/paper"),
planPaperTrade: (payload: PaperTradeRequest) => fetchJson<PaperAccount>("/paper/trades", { method: "POST", body: JSON.stringify(payload) }),
```

- [ ] **Step 2: Build the Paper account route**

The page must fetch the paper account and snapshot together, use `URLSearchParams` to preselect `?isin=`, restrict the selector to current eligible candidates, default the maximum entry to 2% above the latest close and stop to 8% below it, and render native labelled number controls. It must display: local-only/no-broker warning; initial capital; after-tax equity; available cash; planned loss per new trade; settings/assumptions; and separate planned/open/closed rows. Use the existing `MetricCard`, `Card`, `Button`, loading, error and responsive table patterns.

- [ ] **Step 3: Keep React work lightweight**

Fetch independent resources with `Promise.all`, retain a previous account while a new plan is being submitted, use a functional state update only where it prevents stale state, and avoid adding libraries, global listeners, global mutable data or browser-storage state.

- [ ] **Step 4: Add primary navigation and the stock-detail action**

```tsx
{ to: "/paper", label: "Paper account" },
// StockDetail, only when data.liquid && data.breakout:
<Link to={`/paper?isin=${data.isin}`}>Plan paper trade</Link>
```

- [ ] **Step 5: Run focused frontend tests and verify they pass**

Run: `npm test -- --run src/pages/PaperTrading.test.tsx src/App.test.tsx`

Expected: both test files pass.

### Task 6: Document, verify and manually test the complete local workflow

**Files:**
- Modify: `README.md`
- Verify: `backend/tests/`, `frontend/src/**/*.test.tsx`, `frontend` production build

- [ ] **Step 1: Update the README**

Add the Paper account to the feature list, API endpoints and local routine. Explain that the account is a local simulator, uses the next available session open, assumes an estimated 0.15% cost per side, reserves 20% only on profitable short-term simulated exits, and never replaces broker contract notes or tax advice.

- [ ] **Step 2: Run the full automated suite and production build**

Run:

```bash
make test
cd frontend && npm test -- --run && npm run build
```

Expected: all backend and frontend tests pass, and TypeScript/Vite production build exits zero.

- [ ] **Step 3: Test the local UI end to end in a browser**

Start the API and Vite servers, open the local app, navigate to Paper account, select an eligible candidate, verify the default plan values, submit a plan, confirm the account refreshes with a planned/open/simulated entry and no browser console errors. Then open a qualifying stock from Screener and verify “Plan paper trade” routes to the same preselected candidate.

- [ ] **Step 4: Review the final diff and commit the verified change**

Run: `git diff --check && git status --short`

Commit: `git add backend frontend README.md docs/superpowers/plans/2026-09-06-local-paper-trading.md && git commit -m "feat: add local paper trading account"`

## Plan self-review

- Coverage: the plan covers local persistence, selected-breakout validation, conservative next-session fill rules, gap/stop handling, position limits, charges/tax-reserve labelling, API contracts, responsive UI, stock-to-plan workflow, tests, browser QA and documentation.
- Deliberate omissions: no broker integration, real-money order submission, real-time prices, user authentication, deployment, external hosting, automatic reset, or claims of profit certainty.
- Placeholder scan: complete file paths, test names, commands, API payloads and simulation rules are specified. No implementation task relies on an unspecified component.
- Type consistency: backend returns camelCase fields matching the TypeScript `PaperAccount`/`PaperTrade` contract; POST payload uses `maximumEntry` and `stopPrice` throughout.
