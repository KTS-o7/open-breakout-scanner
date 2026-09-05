# Open Breakout Scanner

[![test](https://github.com/KTS-o7/open-breakout-scanner/actions/workflows/test.yml/badge.svg)](https://github.com/KTS-o7/open-breakout-scanner/actions/workflows/test.yml)

A self-hosted, open-source momentum/breakout scanner for Indian equities. Inspired by well-known stage-analysis methods (bases, pivots, relative strength, sector rotation), but built from scratch with free NSE/BSE data.

**Not financial advice.** This is a research and education tool; it is not a recommendation to buy or sell any security.

## What it does

- Downloads official **NSE** and **BSE bhavcopy** archives after every close (free data).
- Stores per-ISIN OHLCV history in Parquet and a symbol registry in SQLite.
- Computes relative strength (RS) percentile, moving-average trends, and breakout signals.
- Serves a FastAPI backend and a React + shadcn/ui frontend.
- Provides a **Dashboard**, **Screener**, **Stock Detail**, and a **Backtest** engine.

## Tech stack

- **Backend**: Python 3.11+, FastAPI, Pydantic, pandas, SQLAlchemy, Parquet
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Data**: NSE `sec_bhavdata_full_DDMMYYYY.csv`, BSE `BhavCopy_BSE_CM_0_0_0_YYYYMMDD_F_0000.CSV`, NSE security master

## Quick start

```bash
# 1. Install Python + Node deps
make install

# 2. Download about a year of history (recommended to compute meaningful signals)
make backfill

# 3. Build the nightly snapshot
make snapshot

# 4. Start the backend (port 8000)
make backend

# 5. In another terminal, start the frontend (port 5173)
make frontend
```

Open http://localhost:5173.

To keep data current, run `make update` daily after market close, then `make snapshot`.

## Docker

Build and run the whole app (frontend built and served by the backend) in one container:

```bash
docker build -t open-breakout-scanner .
docker run -p 8000:8000 open-breakout-scanner
```

Open http://localhost:8000. The image contains no market data — mount your local `data/` directory (or a volume with the same layout) to enable the API endpoints that need snapshots/parquet:

```bash
docker run -p 8000:8000 -v "$(pwd)/data:/app/data" open-breakout-scanner
```

## API endpoints

- `GET /api/health` — market health counts
- `GET /api/universe` — full nightly snapshot
- `GET /api/breakouts?days=1` — recent breakout events
- `GET /api/ohlc/{isin}` — OHLCV + MAs
- `GET /api/stock/{isin}` — stock row + recent bars
- `GET /api/backtest?stop=8&sell=ma50&risk=1.5&maxpos=5&market=all&entry=close` — run a backtest

## Project layout

```
backend/
  data/        # ingestion, security master, store
  compute/     # indicators, snapshot, backtest engine
  api/         # Pydantic models + FastAPI routes
  main.py      # app entry point
frontend/
  src/pages/   # Dashboard, Screener, Stock Detail, Backtest
  src/components/ui/
  src/lib/api.ts
data/
  parquet/     # per-ISIN OHLCV files
  snapshots/   # nightly JSON snapshots
  obs.db       # SQLite symbol registry
```

## Backtest methodology

The current engine is intentionally simple and auditable:

- **Universe filter**: liquid stocks (median daily turnover ≥ ₹5 Cr), RS ≥ 70, in a 50/150/200 DMA uptrend, within 10% of 250-day highs.
- **Entry**: buy at the close of the day the stock closes above its 20-day high on ≥1.5× volume.
- **Position sizing**: `(risk% × current equity) ÷ stop distance`, capped at 30% of equity.
- **Exits**:
  - Hard stop at `stop%` below entry.
  - `ma50` — trail below the 50-day line.
  - `ma150` — trail below the 30-week line.
  - `t25` — fixed +25% profit target.
- **Market filter** (`market=strong`): only enter new positions when ≥40% of the liquid universe is above its 200-day DMA.

Results include per-year stats, total stats, max drawdown, CAGR, and a full trade log with exit reasons. This is a first-pass implementation; treat the numbers as experimental until validated against a longer history and a proper bear market.

## Honest limitations

- The available free data only goes back reliably to ~2021 for NSE and varies for BSE.
- The 2020–2025/2026 window contains no prolonged bear market, so trend-following strategies are biased upward.
- Real trading costs (slippage, STT, brokerage, STCG tax) are not modeled.
- Survivorship bias exists because today's listings are scanned backward.
- Base detection / X-ray view and sector rotation are not yet implemented.

## License

MIT — free to use, modify, and self-host.
