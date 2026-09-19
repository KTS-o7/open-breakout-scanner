# Open Breakout Scanner

[![test](https://github.com/KTS-o7/open-breakout-scanner/actions/workflows/test.yml/badge.svg)](https://github.com/KTS-o7/open-breakout-scanner/actions/workflows/test.yml)

A self-hosted, open-source momentum/breakout scanner for Indian equities. Inspired by well-known stage-analysis methods (bases, pivots, relative strength, sector rotation), but built from scratch with free NSE/BSE data.

**Not financial advice.** This is a research and education tool; it is not a recommendation to buy or sell any security.

## What it does

- Downloads official **NSE** and **BSE bhavcopy** archives after every close (free data).
- Stores per-ISIN OHLCV history in Parquet and a symbol registry in SQLite.
- Computes relative strength (RS) percentile, moving-average trends, and breakout signals.
- Serves a FastAPI backend and a React + shadcn/ui frontend.
- Provides a **Dashboard**, **Screener**, **Stock Detail**, **Backtest**, and local-only **Paper account**.

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

Open http://localhost:5173. If that port is occupied, Vite selects another local port; the API accepts both `localhost` and `127.0.0.1` development addresses.

## Local operating routine

All market data stays in the project-local `data/` directory, which Git ignores.

After each market close, refresh the data and rebuild the candidate snapshot:

```bash
make update
make snapshot
```

With `make backend` running, use the dashboard to review the current liquid breakout candidates. The screener's **Breakouts** filter uses the same liquidity rule. For a machine-readable list, request `http://127.0.0.1:8000/api/breakouts?days=1`.

Use the Backtest page to validate the current rules against the locally stored history. A full-universe run currently takes about three minutes on this machine. It is a research check, not a forecast or a trading recommendation. After changing the code, run `make test` before relying on the result.

## Local paper account

Use **Paper account** to practise cash-equity delivery trades without a broker account or live order. It starts with ₹1,00,000 virtual cash and only accepts stocks that are liquid breakouts in the current local snapshot.

1. Run `make update` and `make snapshot` after market close.
2. Review a candidate in Screener or Stock Detail. A qualifying stock has a **Plan paper trade** link.
3. In Paper account, choose the candidate and set the maximum price you would pay and the stop price. Selecting **Record paper plan** is the explicit approval step.
4. The simulator checks the next available local daily bar. It fills only when the next open is at or below the maximum entry. A gap above the maximum entry is skipped. A gap through the stop exits at that opening price.
5. Re-run the update and snapshot routine after each close to keep the paper ledger in step with locally stored market data.

The paper ledger is stored in `data/paper.db`, which stays on your machine and is ignored by Git. It never connects to a broker, transmits credentials, or sends an order. It reserves 0.15% on each side for estimated costs and 20% of profitable short-term simulated exits as a provisional tax reserve. These are learning assumptions, not a contract note or a final tax calculation: charges vary by broker and final tax depends on your circumstances, losses, cess and other factors.

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
- `GET /api/paper` — local paper account and its synchronised ledger
- `POST /api/paper/trades` — explicitly record one qualified paper plan

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
- The Paper account uses end-of-day bars and a simplified 0.15% per-side cost estimate. It cannot reproduce intraday prices, exchange queue priority, broker-specific charges, all taxes or live execution.

## License

MIT — free to use, modify, and self-host.
