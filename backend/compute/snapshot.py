"""Nightly snapshot computation: build a per-stock row with signals and market health."""
from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import Optional

import pandas as pd

from backend.compute.indicators import add_ath_distance, add_mas, add_roc, add_rsvolume
from backend.data.store import list_symbols, read_bars

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT_DIR = ROOT / "data" / "snapshots"
SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

LIQUIDITY_TURNOVER_CUTOFF = 5_00_00_000  # Rs 5 Cr median daily turnover over 20 sessions
RS_LEADER_CUTOFF = 70


def _median_turnover(df: pd.DataFrame) -> float:
    return df["turnover"].rolling(window=20, min_periods=5).median().iloc[-1]


def compute_stock_row(
    isin: str,
    bars: pd.DataFrame,
    universe_roc: pd.Series,
    as_of: date,
    name: Optional[str] = None,
) -> Optional[dict]:
    if bars.empty or len(bars) < 30:
        return None
    df = bars.copy()
    df = add_mas(df)
    df = add_roc(df, 63)
    df = add_ath_distance(df, 250)
    df = add_rsvolume(df, 20)
    latest = df.iloc[-1]

    median_turnover = _median_turnover(df)
    liquid = bool(pd.notna(median_turnover) and median_turnover >= LIQUIDITY_TURNOVER_CUTOFF)

    rs = None
    if not universe_roc.empty and isin in universe_roc.index and pd.notna(universe_roc.loc[isin]):
        rank_pct = universe_roc.rank(pct=True) * 100
        rs = int(round(rank_pct.loc[isin]))

    in_uptrend = bool(
        pd.notna(latest["ma50"]) and pd.notna(latest["ma150"]) and pd.notna(latest["ma200"]) and
        latest["close"] > latest["ma50"] > latest["ma150"] > latest["ma200"]
    )
    leader = bool(
        rs is not None and rs >= RS_LEADER_CUTOFF and in_uptrend and
        pd.notna(latest["from_ath_pct"]) and latest["from_ath_pct"] > -10
    )

    breakout = False
    if len(df) >= 21:
        high_20 = df["close"].rolling(window=20, min_periods=10).max().iloc[-2]
        breakout = bool(
            pd.notna(high_20) and latest["close"] > high_20 and
            pd.notna(latest["vol_ratio"]) and latest["vol_ratio"] >= 1.5 and
            rs is not None and rs >= RS_LEADER_CUTOFF and
            pd.notna(latest["from_ath_pct"]) and latest["from_ath_pct"] > -10 and
            in_uptrend
        )

    stock_name = name if (name is not None and pd.notna(name)) else latest.get("name")
    if pd.isna(stock_name):
        stock_name = None

    return {
        "isin": isin,
        "symbol": latest.get("symbol", isin),
        "name": stock_name,
        "exchange": latest.get("exchange"),
        "dt": as_of.isoformat(),
        "close": round(float(latest["close"]), 2),
        "volume": int(latest["volume"]),
        "ma50": _to_float(latest["ma50"]),
        "ma150": _to_float(latest["ma150"]),
        "ma200": _to_float(latest["ma200"]),
        "rs": rs,
        "from_ath_pct": _to_float(latest["from_ath_pct"]),
        "vol_ratio": _to_float(latest["vol_ratio"]),
        "in_uptrend": in_uptrend,
        "leader": leader,
        "liquid": liquid,
        "breakout": breakout,
    }


def _to_float(v):
    if pd.isna(v):
        return None
    return round(float(v), 2)


def build_snapshot(
    as_of: Optional[date] = None,
    security_master_df: Optional[pd.DataFrame] = None,
) -> dict:
    if as_of is None:
        as_of = date.today()
    symbols = list_symbols()
    if symbols.empty:
        return {"as_of": as_of.isoformat(), "stocks": [], "health": {}}

    # Merge EQUITY_L.csv security master names into the snapshot
    master_names: dict[str, str] = {}
    master = security_master_df
    if master is None:
        try:
            from backend.data.security_master import download_nse_security_master
            master = download_nse_security_master()
        except Exception as exc:
            logger.warning("Could not download security master for snapshot: %s", exc)
            master = None

    if master is not None and not master.empty:
        for _, m_row in master.iterrows():
            m_name = m_row.get("name")
            if pd.notna(m_name) and str(m_name).strip():
                clean_name = str(m_name).strip()
                m_isin = m_row.get("isin")
                if pd.notna(m_isin) and str(m_isin).strip():
                    master_names[str(m_isin).strip()] = clean_name
                m_sym = m_row.get("symbol")
                if pd.notna(m_sym) and str(m_sym).strip():
                    master_names[str(m_sym).strip()] = clean_name

    roc_records = []
    for _, sym in symbols.iterrows():
        bars = read_bars(sym["isin"])
        if len(bars) < 63:
            continue
        bars = add_roc(bars, 63)
        latest = bars.iloc[-1]
        if pd.notna(latest["roc63"]):
            roc_records.append({"isin": sym["isin"], "roc63": float(latest["roc63"])})
    universe_roc = pd.DataFrame(roc_records).set_index("isin")["roc63"] if roc_records else pd.Series(dtype=float)

    stocks = []
    for _, sym in symbols.iterrows():
        bars = read_bars(sym["isin"])
        sym_name = sym.get("name")
        stock_name = (
            master_names.get(sym["isin"])
            or (master_names.get(sym.get("symbol")) if pd.notna(sym.get("symbol")) else None)
            or (sym_name if pd.notna(sym_name) else None)
        )
        row = compute_stock_row(sym["isin"], bars, universe_roc, as_of, name=stock_name)
        if row:
            stocks.append(row)

    universe = [s for s in stocks if s["liquid"]]
    n_uni = len(universe)
    n_uptrend = sum(1 for s in universe if s["in_uptrend"])
    n_leaders = sum(1 for s in universe if s["leader"])
    n_breakouts = sum(1 for s in universe if s["breakout"])

    snapshot = {
        "as_of": as_of.isoformat(),
        "health": {
            "universe": n_uni,
            "in_uptrend": n_uptrend,
            "pct_uptrend": round(n_uptrend / n_uni * 100, 1) if n_uni else 0,
            "leaders": n_leaders,
            "breaking_out": n_breakouts,
        },
        "stocks": stocks,
    }

    snapshot = _sanitize(snapshot)
    out_path = SNAPSHOT_DIR / f"snapshot_{as_of.isoformat()}.json"
    with open(out_path, "w") as f:
        json.dump(snapshot, f, indent=2, default=str)
    logger.info("Snapshot written to %s", out_path)
    return snapshot


def _sanitize(obj):
    import math
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    return obj


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    snap = build_snapshot()
    print(snap["health"])
    print([s for s in snap["stocks"] if s["breakout"]][:5])
