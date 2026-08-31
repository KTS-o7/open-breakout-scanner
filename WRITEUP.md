# BananaPatterns — Reverse-Engineering Writeup

*How bananapatterns.com gets its market data and runs its backtests, inferred from the frontend bundle (`/static/app.js`, ~900 KB) and live API probing (Aug 2026). Companion file: [`openapi.json`](./openapi.json). Raw captures in [`_analysis/`](./_analysis/).*

---

## 1. Architecture in one sentence

Everything heavy happens **server-side, once per day after the NSE/BSE close**; the browser is a pure renderer over precomputed JSON — there is no client-side screening or backtesting engine.

- **Frontend**: a single vanilla-JS SPA (`/static/app.js`, no framework), charts via KLineChart (Apache-2.0), analytics via Microsoft Clarity + a first-party `/api/track`.
- **Backend**: Python **Flask** (stock Werkzeug 404/405 pages; auth state lives in a Flask signed `session` cookie) behind **Cloudflare**.
- **Auth**: passwordless — email magic link (`POST /api/auth/request`) or Google OAuth (`/api/auth/config` announces providers). Login's real perk is **de-anonymization**: logged out, every ticker is replaced with a fake name ("Bryquor Ltd", "LAWC") and an opaque `t_...` token; logged in, real ISINs/symbols (MCX, `INE745G01043`, …) come through.

## 2. The nightly pipeline (inferred)

1. **Ingest** daily OHLCV for ~4,645 NSE+BSE-listed companies (plus deep history — BSE names back to ~2000).
2. **Adjust** prices for splits (dividend-unadjusted — Yahoo convention, see §4).
3. **Per stock, per day**: RS rating, trend state, liquidity, base detection, breakout/squat/spring/poke events — ~80 fields per stock (`/api/stock/{isin}` shows the full row).
4. **Roll up**: market health (`pct_uptrend`, leaders, breaking_out…), sector synthetic indices, 52-week industry pulse.
5. **Publish** static JSON snapshots (`/static/data/*.json`, `/api/data/*.json`) and refresh the cached backtest results.

## 3. Computations, inferred from the API surface

### 3.1 Relative Strength (RS)
Every OHLC bar carries an `rs` percentile (0–100, IBD-style) — `MCX` currently 86. Per stock there is a whole RS block: `rs`, `rs5`, `rsAvg`, `rsMom`, `rsSlope`, `rsWk` — rating, 5-day delta, average, momentum, slope, and weekly variant.

### 3.2 Base detection (the core IP)
`/api/xray/{isin}` returns every detected base with measurements:

| Field | Meaning |
|---|---|
| `a` / `e` / `bo` | base start / end / breakout date |
| `p`, `lo`, `depth`, `wk` | pivot price, base low, depth %, length in weeks |
| `coil` | volatility contraction ratio (VCP-style tightening) |
| `dry` | volume dry-up ratio |
| `udBase`, `obv` | up/down volume ratio, OBV divergence |
| `pokes` + `fp[]` | intraday pivot breaches that didn't close above |
| `squats` + `sq[]` | failed follow-through days |
| `springs` / shakeouts | undercuts of support that recovered |
| `lvl` | base count/stage in the current run |
| `run`, `soFar` | post-breakout performance, still-holding flag |

### 3.3 Per-base "atoms" (factor store)
`/api/baseatoms/{isin}` exposes ~50 factors per base, keyed by base date: accumulation over 10/20/50/100 days (`accum*`), up-money vs down-money over 1–3 weeks (`upmoney_*`/`dnmoney_*`), price gains and swings (`gain_*`, `swing_*`), distance from EMAs/DMAs (`vsema_10..200`, `vsdma_10`), 52-week-high proximity (`nh52w`), overhead supply, breakout-day quality (`boGap`, `boRange`, `boThru`, `boVolX`), volume/turnover (`vol_*`, `turn_10`), RS range (`rsMin`/`rsMax`/`rsb`). These feed the custom-screen ranking engine (`POST /api/blend_ranks` with factor `terms`, optionally as-of a past date — i.e. **point-in-time ranking**) and `/api/wh?keys=` (12 keys per call).

### 3.4 Universe & market health
`/api/data/universe.json` (~21 MB, login-gated) is the master snapshot: `regime` ("risk-on"), health counts (1,029 liquid universe, 63% in uptrend, 291 leaders, 919 in base, 33 breaking out), sector rollups with RS trails, and the full `stocks[]` array. The public methodology funnel (`/static/data/method.json`): **4,645 tracked → liquidity floor → RS ≥ 70 + uptrend + near highs = leaders**.

### 3.5 Sector-as-index
`/api/sectors` (~1.9 MB) runs the *same base detection* on synthetic sector indices — each industry group gets a composite price series, pivot, base `{start,end,len,depth,bo_date,forming}`. Sector rotation via `/api/data/industry_pulse.json` (52 weekly observations per industry).

### 3.6 The backtester — `GET /api/backtest`
Parameters map 1:1 to the UI, and define the whole strategy:

```
screen = vcp | ath ("Blue sky") | bigbase ("Multi-year/deep comeback") | ipo ("IPO base")
stop   = hard stop-loss % (default 8)
sell   = exit rule (ma50 = trail the 50-DMA, trend, …)
risk   = % of equity risked per trade (default 1.5)
maxpos = max concurrent positions (default 5)
capital, period, market, entry (pivot, …)
```

The server runs a **full portfolio simulation** and returns:
- `byYear[]` / `total`: trades, win rate, mean/median return, avg win/loss, avg holding days.
- `portfolio`: start/end equity, multiple, CAGR, max drawdown, best/worst year, year-by-year growth, and crucially `skipFull` / `skipWeak` — signals *not* taken because the book was full or the setup too weak (so the sim enforces realistic capacity).
- `log[]`: every trade — ISIN, symbol, entry date/price, exit date/price, return %, RS at entry, days held, and an exit reason string (`"still open · marked to year-end close"`), so every claim is auditable per trade.
- `ready: false` while records rebuild (or for invalid screen names) — results are clearly cached per parameter tuple.

#### 3.6.1 The exact mechanics (from the UI tooltips in `app.js`, verified against responses)

It's an **event-driven replay over precomputed signals**, not bar-by-bar re-scanning: the nightly pipeline has already stored every base/breakout per stock, so the backtester just replays recorded signals through sizing + exit rules — which is why results return in ~1s.

- **Universe filter (fixed):** liquid stocks only — ₹500 Cr+ market cap, ₹5 Cr/day traded — plus leader criteria (RS ≥ 70, uptrend, near highs).
- **Entry** (`entry`): `close` = buy at the close of the breakout day (their "realistic fill"); `pivot` = filled at the pivot price.
- **Position sizing** — fixed-fractional, and it **compounds**: `size = (risk% × current equity) ÷ stop distance`, capped at 30% of capital. Verified: 1.5% risk / 8% stop / ₹10L → `sizeExample` = ₹187,500; a late-2025 trade in a t25 run showed `invested: 744,600`, consistent with sizing off a grown ~₹40L equity.
- **Portfolio cap** (`maxpos`: 3/5/8/10): when full, new breakouts are passed up — and reported. Observed run: **162 taken, 520 skipped (book full), 78 skipped (too weak)**.
- **Exits** (three layers):
  1. **Hard stop** (`stop`: 7/8/10%) below the buy. In the t25 run 94 of 162 trades exited as `−8% stop`.
  2. **Winner exit** (`sell`): trail the 50-DMA (`ma50`), trail the 30-week line (`ma150`), or bank +25% (`t25` — 63 trades: `hit the +25% target`).
  3. **Marking**: still-open trades are marked to the last close (`"still open · marked to year-end close"`) — no lookahead.
- **Market regime filter** (`market=strong`, off by default): buy only when ≥40% of the liquid universe is above its 200-DMA; on weak tape new buys stop, open positions run to their own stops. Their own tooltip admits: *"in a sustained uptrend this usually lowers returns — its value is dodging prolonged bears, which this 2020–2025 window doesn't contain."*
- **Period**: all (2020→now) or a single calendar year; trades booked to entry year (`yr`).

#### 3.6.2 Honest limitations

- The 2020–2025 window contains **no prolonged bear market** (their own admission) — the regime filter's value is untested by the data.
- Universe is today's listings scanned backward; no evidence of point-in-time delisting handling (survivorship risk is disclaimed on-site).
- Fills are simplified (breakout close or at-pivot; no slippage/spread model), mitigated somewhat by the liquidity floor.
- Backtest and live screens share one nightly signal engine — consistent, but a bug there invalidates both.

Reference numbers (published headline, `/static/data/data.json`): ₹10L → ₹23.6L (2.36×, CAGR 20.5%, max DD −24.7%, win rate 37%, profit factor 1.62, 103 trades). The site's own framing: *"probabilities, not predictions — wins on roughly 1 in 3 trades; the asymmetry is the entire edge."*

### 3.7 The "live book"
`live_positions.json`, `alltrades.json`, `live_charts.json`, `setup_charts.json`, `closed_charts.json` power the forward, real-money-style public track record (#live). **All currently 404** — either being regenerated or gated to the owner's deployment; the frontend `.catch(() => null)`s them silently, which is why the landing page shows "Loading today's scan…" states.

## 4. Data-source forensics

| Test | Result | Implication |
|---|---|---|
| MCX 2021-08 closes & volumes vs Yahoo | **exact match to the paise/share, every day** (300.90 / 2,865,850 …) | NSE leg is Yahoo-consistent |
| IRCTC around its 5:1 split (2021-10-28) | BP 2021-10-20 close = 886.87 = 4434.35 ÷ 5; matches Yahoo raw `close`, **not** `adjclose` (848.36) | Prices are **split-adjusted, dividend-unadjusted** — Yahoo's exact convention |
| Modern Steel (`MDRNSTL`, BSE-only) | BP: 4,897 daily bars from 2000-01-04; Yahoo `.BO`: 320 patchy bars | **BSE data is not Yahoo** — consistent with official **BSE bhavcopy archives** (free) |
| Trading calendar | 2021-08-19 (Muharram) correctly absent | genuine exchange calendar |
| `tvsyms.json` | ISIN → `NSE:`/`BSE:` TradingView map | used for chart *links*, not data |

**Most plausible stack for a free one-person app:** Yahoo Finance (`yfinance`) for NSE daily data, official BSE/NSE bhavcopies + security masters for BSE depth and the ISIN↔symbol map (explains the per-bar `x: "BSE"` flag), corporate actions from the same feeds, all crunched nightly by Flask and served as near-static JSON — marginal cost ≈ hosting only. The one unproven link: NSE-via-Yahoo vs NSE bhavcopy + Yahoo-identical in-house adjustment; a known Yahoo bad-print stock would settle it.

### 4.1 Bhavcopy archives (the free raw material)

A "bhavcopy" (*bhav* = price) is the **official end-of-day file each exchange publishes after every session** — one row per security: open/high/low/close, previous close, traded quantity, traded value, trade count, ISIN. Free, canonical, and published for decades — which is what makes deep backtests possible at zero data cost. All URLs below verified live (Aug 2026).

**NSE — old format (pre-July-2023), still served:**
```
https://nsearchives.nseindia.com/content/historical/EQUITIES/2021/AUG/cm18AUG2021bhav.csv.zip
→ SYMBOL,SERIES,OPEN,HIGH,LOW,CLOSE,LAST,PREVCLOSE,TOTTRDQTY,TOTTRDVAL,TIMESTAMP,TOTALTRADES,ISIN
```
**NSE — new format (since ~July 2023):** SEBI-mandated unified "common bhavcopy" (~60 columns: `TradDt, Sgmt, FinInstrmTp, ISIN, TckrSymb, OpnPric, …`), one file per segment (CM/FO/CD), same `nsearchives.nseindia.com` host (filename conventions changed again in 2024).

**BSE — new unified format, verified working:**
```
https://www.bseindia.com/download/Bhavcopy/Equity/BhavCopy_BSE_CM_0_0_0_20250828_F_0000.CSV
```
(~790 KB/day, includes ISIN.) The legacy `EQ{DDMMYY}.CSV` URLs now return BSE's Angular app shell instead of CSV.

**How a pipeline like BananaPatterns would use them:**
1. Nightly after close: download NSE + BSE bhavcopy, parse, dedupe by ISIN (NSE `EQ` series + BSE `A`/`B` groups), upsert into a local OHLCV store. Matches the `x: "BSE"` per-series flag and the "measured after every close" promise.
2. One-time backfill: archives reach ~1999–2000 on BSE, ~1994+ on NSE — exactly the observed API depth (MDRNSTL daily bars from 2000-01-04).
3. Corporate actions: exchanges publish separate daily CA files (splits/bonus/dividends); applying split factors to history reproduces the observed split-adjusted, dividend-unadjusted convention (IRCTC 4434.35 → 886.87 across its 5:1).
4. ISIN as primary key: both new-format bhavcopies carry ISIN — why every API is ISIN-keyed and NSE/BSE dual listings merge cleanly.
5. Re-run scans, publish JSON snapshots. Daily cost: two HTTP downloads + CPU. Zero vendor fees.

## 5. Endpoint map (full details in `openapi.json`)

- **Snapshots**: `/api/data/universe.json` 🔒, `/api/data/sparks.json` 🔒, `/api/data/industry_pulse.json` 🔒, `/static/data/{method,data,health_history,tvsyms}.json` (public)
- **Market scans**: `/api/breakouts?days=1|5`, `/api/feed` 🔒, `/api/sectors`
- **Backtest**: `/api/backtest?screen=…&stop=…&sell=…&risk=…&maxpos=…&market=…&capital=…&period=…&entry=…`
- **Per-stock**: `/api/ohlc/{isin}[?full=1]`, `/api/chart/{isin}`, `/api/xray/{isin}`, `/api/baseatoms/{isin}`, `/api/stock/{isin}`, `/api/search?q=`
- **Screen engine**: `POST /api/blend_ranks` (point-in-time multi-factor ranking), `/api/wh?keys=` (≤12 factor keys), `/api/filters` 🔒, `/api/dials` 🔒
- **Anonymization helpers**: `POST /api/name_top` (≤16 `t_` tokens), `/api/group_names?grp=|sub=`
- **User**: `/api/me`, `/api/auth/request|config`, `/api/portfolio` 🔒 (watchlists), `POST /api/list_trend` 🔒, `/api/screens` 🔒, `/api/prefs`, `/api/me/marks`
- **Misc**: `/api/track`, `/api/feedback`, `/api/course-interest`, plus an `/api/admin/*` suite (posts, tweets, stats, journeys — the owner's blog/social automation)

🔒 = 401 `{"error":"login"}` when logged out.

## 6. Notable design choices worth stealing

- **Precompute everything, serve JSON** — the SPA boots from a handful of multi-MB snapshots; per-stock APIs are only for drill-down. Zero per-user compute.
- **Anonymization as the paywall** — one data pipeline, two views; tokens (`t_…`) instead of ISINs cost nothing to apply.
- **Auditable backtests** — returning the full trade log with exit reasons and skip counts (`skipFull`/`skipWeak`) is what makes "losses shown beside gains" credible.
- **Graceful decay** — every optional fetch has a `.catch(() => null)` fallback; missing static files degrade the UI instead of breaking it (which is exactly the current state of the #live tab).

## 7. So — will it actually catch breakouts and make money?

A candid assessment, separating what's real from what's unproven.

### What's genuinely in its favor

- **Momentum/breakout buying is a real, documented effect** — one of the most replicated anomalies in academic finance, across decades and countries. The specific flavor here (bases, pivots, volume dry-up, RS ≥ 70 — O'Neil/Minervini-style) has a long practitioner track record.
- **The math is sound as designed**: ~37% win rate with avg win ~4–5× avg loss is positive expectancy *if* the backtest is honest. The asymmetry claim is arithmetically true in their data.
- **Unusually honest engineering for this genre**: full trade logs with exit reasons, skip accounting (520 signals passed up because the book was full), losses published beside gains, explicit "backtests are hypothetical" disclaimers. Most breakout-scanner products do none of this.
- **As a scanner it demonstrably works**: base detection, RS ratings and sector rollups are real computation on real data. It *will* surface stocks breaking out of valid bases after every close.

### What should temper expectations

- **The 2020–2025 backtest window contains no prolonged bear market** (their own tooltip admits it). Breakout strategies suffer long strings of −8% stops in choppy/bear tapes. The 20.5% CAGR was achieved in one of the best 5-year stretches in Indian market history (Nifty ~14%, smallcaps far more) — the edge over a smallcap index in that window is much smaller than the headline number sounds.
- **Live costs eat backtests**: slippage (you won't get filled at breakout close on a ₹5 Cr/day liquidity name), STT, stamp duty, brokerage, and ~20% STCG tax. A 20% CAGR backtest compresses meaningfully after all that, at 100+ mostly short trades/year.
- **Survivorship** is disclaimed but unknowable from outside; today's listings scanned backward overstates results to some degree.
- **The forward record is the real test — and is currently unverifiable**: `live_positions.json` / `alltrades.json` were 404 during this analysis. A live book surviving a bear market over 3–5 years would be far stronger evidence than any backtest.
- **Behavior is the biggest failure mode**: the strategy requires taking the next breakout after five straight stopped-out losses, and sitting through −25% drawdowns. Most followers override such systems exactly when it matters.

### Bottom line

- **As a screening/research tool**: yes — it compresses "read 4,000 charts a night" into a feed, and the X-ray/base measurements are genuinely informative.
- **As a money-making system**: the method has positive expectancy on paper, but whether a user captures it depends on execution discipline, costs, position sizing, and surviving a regime the backtest never saw. Treat the backtest numbers as an upper bound, not an expectation. Size any live attempt so a 2×-worse-than-backtest outcome (routine when strategies go live) is survivable, and judge it on the live book over years — not the 2020–2025 replay.
- Their own disclaimer is the right frame: it's measurement, not advice — the tool catches breakouts; making money from them is the part it can't do for you.

## Security note

`_analysis/session_cookie.txt` contains a live session credential captured during this analysis. Delete it when done, and log out of bananapatterns.com to invalidate the session server-side.
