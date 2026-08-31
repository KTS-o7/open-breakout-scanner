"""FastAPI routers."""
from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from backend.api import models
from backend.compute.backtest import BacktestParams, run_backtest
from backend.compute.indicators import add_mas
from backend.data.store import read_bars

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_DIR = ROOT / "data" / "snapshots"

router = APIRouter()


def _latest_snapshot() -> dict:
    files = sorted(SNAPSHOT_DIR.glob("snapshot_*.json"), reverse=True)
    if not files:
        raise HTTPException(status_code=503, detail="No snapshot available. Run 'python -m backend.compute.snapshot' first.")
    with open(files[0]) as f:
        return json.load(f)


@router.get("/health", response_model=models.Health)
def get_health() -> models.Health:
    snap = _latest_snapshot()
    return models.Health(**snap["health"])


@router.get("/universe", response_model=models.Snapshot)
def get_universe() -> models.Snapshot:
    snap = _latest_snapshot()
    return models.Snapshot(**snap)


@router.get("/breakouts", response_model=List[models.BreakoutEvent])
def get_breakouts(days: int = Query(1, ge=1, le=5)) -> List[models.BreakoutEvent]:
    snap = _latest_snapshot()
    events = []
    for s in snap["stocks"]:
        if not s.get("breakout"):
            continue
        events.append(
            models.BreakoutEvent(
                d=s["dt"],
                isin=s["isin"],
                sym=s.get("symbol"),
                name=s.get("name"),
                close=s.get("close") or 0.0,
                vol_ratio=s.get("vol_ratio"),
                rs=s.get("rs"),
            )
        )
    # For now we only generate today's snapshot; repeat for multiple days once history of snapshots exists.
    return events[:200]


@router.get("/ohlc/{isin}", response_model=List[models.OhlcBar])
def get_ohlc(isin: str, full: bool = False) -> List[models.OhlcBar]:
    bars = read_bars(isin)
    if bars.empty:
        raise HTTPException(status_code=404, detail="ISIN not found")
    bars = add_mas(bars)
    if not full:
        bars = bars.tail(252)
    records = []
    for _, row in bars.iterrows():
        records.append(
            models.OhlcBar(
                dt=row["dt"].strftime("%Y-%m-%d"),
                open=round(float(row["open"]), 2),
                high=round(float(row["high"]), 2),
                low=round(float(row["low"]), 2),
                close=round(float(row["close"]), 2),
                volume=int(row["volume"]),
                turnover=_to_float(row.get("turnover")),
                ma50=_to_float(row.get("ma50")),
                ma150=_to_float(row.get("ma150")),
                ma200=_to_float(row.get("ma200")),
                rs=_to_int(row.get("rs")),
            )
        )
    return records


@router.get("/stock/{isin}", response_model=models.StockDetail)
def get_stock(isin: str) -> models.StockDetail:
    snap = _latest_snapshot()
    row = next((s for s in snap["stocks"] if s["isin"] == isin), None)
    if row is None:
        raise HTTPException(status_code=404, detail="ISIN not found in latest snapshot")
    detail = models.StockDetail(**row)
    detail.bars = get_ohlc(isin, full=False)
    return detail


@router.get("/backtest", response_model=models.BacktestResponse)
def get_backtest(
    stop: float = Query(8.0),
    sell: str = Query("ma50"),
    risk: float = Query(1.5),
    maxpos: int = Query(5),
    capital: float = Query(1_000_000.0),
    market: str = Query("all"),
    entry: str = Query("close"),
) -> models.BacktestResponse:
    params = BacktestParams(
        stop=stop, sell=sell, risk=risk, maxpos=maxpos,
        capital=capital, market=market, entry=entry,
    )
    result = run_backtest(params)
    if not result.get("ready"):
        raise HTTPException(status_code=503, detail=result.get("error", "backtest not ready"))
    return models.BacktestResponse(**result)


def _to_float(v) -> Optional[float]:
    if v is None:
        return None
    try:
        import pandas as pd
        if pd.isna(v):
            return None
    except Exception:
        pass
    return round(float(v), 2)


def _to_int(v) -> Optional[int]:
    if v is None:
        return None
    try:
        import pandas as pd
        if pd.isna(v):
            return None
    except Exception:
        pass
    return int(v)
