"""Event-driven portfolio backtest over historical breakout signals."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import List, Optional

import numpy as np
import pandas as pd

from backend.compute.indicators import add_ath_distance, add_mas, add_roc, add_rsvolume
from backend.data.store import list_symbols, read_bars

logger = logging.getLogger(__name__)

LIQUIDITY_TURNOVER_CUTOFF = 5_00_00_000
RS_LEADER_CUTOFF = 70


@dataclass
class BacktestParams:
    stop: float = 8.0
    sell: str = "ma50"  # ma50 | ma150 | t25
    risk: float = 1.5
    maxpos: int = 5
    capital: float = 1_000_000.0
    market: str = "all"  # all | strong
    entry: str = "close"  # close | pivot
    period_start: Optional[date] = None
    period_end: Optional[date] = None


@dataclass
class Trade:
    isin: str
    sym: str
    bo: date
    buy: float
    exit: Optional[date]
    sell: Optional[float]
    ret: float
    days: int
    rs: Optional[int]
    invested: float
    open: bool
    why: str


def _signal_series(bars: pd.DataFrame, isin: str, universe_roc_df: pd.DataFrame) -> pd.DataFrame:
    """Add per-bar signal columns to a single stock's bars.

    universe_roc_df: index=dates, columns=isins, values=63-day ROC.
    """
    df = bars.copy()
    df = add_mas(df)
    df = add_roc(df, 63)
    df = add_ath_distance(df, 250)
    df = add_rsvolume(df, 20)

    df["dt"] = pd.to_datetime(df["dt"]).dt.date
    df = df.set_index("dt")

    # RS percentile per date using cross-sectional ranking
    df["rs"] = np.nan
    if isin and isin in universe_roc_df.columns:
        stock_roc = universe_roc_df[isin]
        rank_pct = universe_roc_df.rank(axis=1, pct=True, ascending=True) * 100
        df["rs"] = rank_pct[isin].reindex(df.index)

    df["in_uptrend"] = (
        (df["close"] > df["ma50"]) &
        (df["ma50"] > df["ma150"]) &
        (df["ma150"] > df["ma200"])
    )
    df["leader"] = (
        (df["rs"] >= RS_LEADER_CUTOFF) &
        df["in_uptrend"] &
        (df["from_ath_pct"] > -10)
    )
    df["liquid"] = df["turnover"].rolling(window=20, min_periods=5).median() >= LIQUIDITY_TURNOVER_CUTOFF
    df["high_20"] = df["close"].rolling(window=20, min_periods=10).max().shift(1)
    df["signal"] = (
        df["liquid"] &
        df["leader"] &
        (df["close"] > df["high_20"]) &
        (df["vol_ratio"] >= 1.5) &
        (df["from_ath_pct"] > -10) &
        df["in_uptrend"]
    )
    return df


def _build_daily_universe_roc(trade_dates: List[date]) -> pd.DataFrame:
    """For each trade date, compute 63-day ROC for every liquid stock and return a DataFrame (date x isin)."""
    symbols = list_symbols()
    records = []
    for _, sym in symbols.iterrows():
        bars = read_bars(sym["isin"])
        if len(bars) < 63:
            continue
        bars["dt"] = pd.to_datetime(bars["dt"]).dt.date
        bars = bars.set_index("dt")
        bars["roc63"] = bars["close"].pct_change(63) * 100
        bars = bars.loc[bars.index.isin(trade_dates)]
        if bars.empty:
            continue
        for dt, row in bars.iterrows():
            if pd.notna(row["roc63"]):
                records.append({"dt": dt, "isin": sym["isin"], "roc63": float(row["roc63"])})
    return pd.DataFrame(records)


def run_backtest(params: BacktestParams) -> dict:
    symbols = list_symbols()
    if symbols.empty:
        return {"ready": True, "error": "no data"}

    end = params.period_end or date.today()
    start = params.period_start or (end - timedelta(days=365))
    trade_dates = pd.date_range(start=start, end=end, freq="B").date.tolist()

    logger.info("Computing universe ROC history...")
    roc_long = _build_daily_universe_roc(trade_dates)
    if roc_long.empty:
        return {"ready": True, "error": "insufficient history for backtest"}
    universe_roc_df = roc_long.pivot(index="dt", columns="isin", values="roc63")

    # Pre-compute per-stock signal series for each date
    logger.info("Computing per-stock signals...")
    stock_data: dict = {}
    for _, sym in symbols.iterrows():
        bars = read_bars(sym["isin"])
        if len(bars) < 63:
            continue
        bars["dt"] = pd.to_datetime(bars["dt"]).dt.date
        bars = bars.drop_duplicates("dt")
        # intersect with trade dates
        bars = bars[bars["dt"].isin(trade_dates)]
        if bars.empty:
            continue
        df = _signal_series(bars, sym["isin"], universe_roc_df)
        stock_data[sym["isin"]] = {"df": df, "symbol": sym["symbol"]}

    if not stock_data:
        return {"ready": True, "error": "no signals generated"}

    # Market regime: % of liquid universe above 200-DMA per date
    logger.info("Computing market regime...")
    market_records = []
    for dt in trade_dates:
        above200 = 0
        liquid = 0
        for info in stock_data.values():
            if dt not in info["df"].index:
                continue
            row = info["df"].loc[dt]
            if not bool(row["liquid"]):
                continue
            liquid += 1
            if row["close"] > row["ma200"]:
                above200 += 1
        market_records.append({
            "dt": dt,
            "strong": (above200 / liquid * 100) >= 40 if liquid else False,
            "pct_above200": (above200 / liquid * 100) if liquid else 0,
        })
    market_df = pd.DataFrame(market_records).set_index("dt")

    logger.info("Running simulation...")
    equity = params.capital
    positions: dict = {}  # isin -> {"entry", "buy", "shares", "invested", "stop_price"}
    trades: List[Trade] = []
    daily_equity = []

    for dt in trade_dates:
        strong = bool(market_df.loc[dt, "strong"]) if dt in market_df.index else False
        market_open = params.market != "strong" or strong

        # 1. Handle exits for existing positions
        exited = []
        for isin, pos in list(positions.items()):
            info = stock_data.get(isin)
            if info is None or dt not in info["df"].index:
                continue
            row = info["df"].loc[dt]
            buy = pos["buy"]
            stop_price = buy * (1 - params.stop / 100)
            exit_price = None
            reason = None

            if row["low"] <= stop_price:
                exit_price = stop_price
                reason = f"−{params.stop}% stop"
            elif params.sell == "t25":
                target = buy * 1.25
                if row["high"] >= target:
                    exit_price = target
                    reason = "hit the +25% target"
            elif params.sell == "ma50":
                if row["close"] < row["ma50"]:
                    exit_price = row["close"]
                    reason = "closed below 50-day"
            elif params.sell == "ma150":
                if row["close"] < row["ma150"]:
                    exit_price = row["close"]
                    reason = "closed below 30-week"

            if exit_price is not None:
                ret = (exit_price / buy - 1) * 100
                days = (dt - pos["entry"]).days
                equity += pos["shares"] * exit_price
                trades.append(Trade(
                    isin=isin, sym=pos["sym"], bo=pos["entry"], buy=buy,
                    exit=dt, sell=round(exit_price, 2), ret=round(ret, 2),
                    days=days, rs=pos.get("rs"), invested=round(pos["invested"], 2),
                    open=False, why=reason,
                ))
                exited.append(isin)

        for isin in exited:
            positions.pop(isin, None)

        # 2. Open new positions if market allows and room
        if market_open and len(positions) < params.maxpos:
            candidates = []
            for isin, info in stock_data.items():
                if isin in positions:
                    continue
                if dt not in info["df"].index:
                    continue
                row = info["df"].loc[dt]
                if not bool(row["signal"]):
                    continue
                candidates.append((isin, info, row))
            # simple ranking: highest RS first
            candidates.sort(key=lambda x: (x[2]["rs"] if pd.notna(x[2]["rs"]) else 0), reverse=True)
            for isin, info, row in candidates:
                if len(positions) >= params.maxpos:
                    break
                buy = float(row["close"])
                risk_amt = params.risk / 100 * equity
                pos_size = min(risk_amt / (params.stop / 100), 0.30 * equity)
                shares = int(pos_size / buy)
                if shares <= 0:
                    continue
                invested = shares * buy
                positions[isin] = {
                    "entry": dt, "buy": buy, "shares": shares, "invested": invested,
                    "sym": info["symbol"], "rs": int(row["rs"]) if pd.notna(row["rs"]) else None,
                }
                equity -= invested  # cash accounting: mark invested cash as not available

        daily_equity.append({"dt": dt, "equity": equity + sum(p["shares"] * stock_data[p_isin]["df"].loc[dt, "close"] for p_isin, p in positions.items() if p_isin in stock_data and dt in stock_data[p_isin]["df"].index)})

    # Mark remaining open positions to last close
    last_dt = trade_dates[-1]
    for isin, pos in positions.items():
        info = stock_data.get(isin)
        if info is None or last_dt not in info["df"].index:
            continue
        last_close = float(info["df"].loc[last_dt, "close"])
        ret = (last_close / pos["buy"] - 1) * 100
        trades.append(Trade(
            isin=isin, sym=pos["sym"], bo=pos["entry"], buy=pos["buy"],
            exit=None, sell=None, ret=round(ret, 2),
            days=(last_dt - pos["entry"]).days, rs=pos.get("rs"),
            invested=round(pos["invested"], 2), open=True,
            why="still open · marked to last close",
        ))

    final_equity = daily_equity[-1]["equity"] if daily_equity else equity
    return _summarize(trades, final_equity, params, daily_equity)


def _to_float(v):
    if v is None:
        return None
    return float(v)


def _summarize(trades: List[Trade], final_equity: float, params: BacktestParams, daily_equity: List[dict]) -> dict:
    closed = [t for t in trades if not t.open]
    if not closed:
        return {"ready": True, "trades": trades, "portfolio": {}}

    wins = [t for t in closed if t.ret > 0]
    losses = [t for t in closed if t.ret <= 0]
    eq_series = pd.Series([float(d["equity"]) for d in daily_equity], index=[d["dt"] for d in daily_equity])
    max_dd = 0.0
    peak = eq_series.iloc[0]
    for v in eq_series:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100
        if dd > max_dd:
            max_dd = dd

    total = {
        "n": len(closed),
        "win": float(round(len(wins) / len(closed) * 100, 1)),
        "mean": float(round(sum(t.ret for t in closed) / len(closed), 2)),
        "avgWin": float(round(sum(t.ret for t in wins) / len(wins), 2)) if wins else 0,
        "avgLoss": float(round(sum(t.ret for t in losses) / len(losses), 2)) if losses else 0,
        "days": int(round(sum(t.days for t in closed) / len(closed))),
    }

    by_year: dict = {}
    for t in closed:
        yr = t.bo.year
        by_year.setdefault(yr, []).append(t)
    by_year_rows = []
    for yr in sorted(by_year):
        ts = by_year[yr]
        ws = [t for t in ts if t.ret > 0]
        ls = [t for t in ts if t.ret <= 0]
        by_year_rows.append({
            "yr": yr,
            "n": len(ts),
            "win": float(round(len(ws) / len(ts) * 100, 1)),
            "mean": float(round(sum(t.ret for t in ts) / len(ts), 2)),
            "avgWin": float(round(sum(t.ret for t in ws) / len(ws), 2)) if ws else 0,
            "avgLoss": float(round(sum(t.ret for t in ls) / len(ls), 2)) if ls else 0,
            "days": int(round(sum(t.days for t in ts) / len(ts))),
        })

    years = (daily_equity[-1]["dt"] - daily_equity[0]["dt"]).days / 365.25
    start_eq = float(daily_equity[0]["equity"])
    mult = final_equity / start_eq if start_eq else 1
    cagr = (mult ** (1 / max(years, 0.1)) - 1) * 100

    portfolio = {
        "start": round(start_eq, 2),
        "end": round(float(final_equity), 2),
        "mult": round(float(mult), 2),
        "cagr": round(float(cagr), 1),
        "maxdd": round(float(max_dd), 1),
        "taken": len(closed),
        "log": [
            {
                "isin": t.isin, "sym": t.sym, "bo": t.bo.isoformat(),
                "buy": round(float(t.buy), 2),
                "exit": t.exit.isoformat() if t.exit else None,
                "sell": round(float(t.sell), 2) if t.sell is not None else None,
                "ret": float(t.ret), "days": t.days, "rs": t.rs,
                "invested": round(float(t.invested), 2), "open": t.open, "why": t.why,
            }
            for t in trades
        ],
    }

    return {
        "ready": True,
        "stop": params.stop,
        "sell": params.sell,
        "risk": params.risk,
        "maxpos": params.maxpos,
        "capital": params.capital,
        "market": params.market,
        "entry": params.entry,
        "total": total,
        "byYear": by_year_rows,
        "portfolio": portfolio,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    params = BacktestParams(stop=8, sell="ma50", risk=1.5, maxpos=5, market="all")
    res = run_backtest(params)
    print(res.get("portfolio", {}).get("mult"), res.get("total"))
