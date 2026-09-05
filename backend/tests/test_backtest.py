"""Unit tests for the event-driven backtest engine (backend/compute/backtest.py)."""
from datetime import date

import pandas as pd

from backend.compute import backtest as bt
from backend.compute.backtest import BacktestParams, Trade

ISIN = "INE000000001"
N_BARS = 170
BREAKOUT_IDX = 164  # phase A: bars 0-139 uptrend, phase B: bars 140-163 flat, breakout, 5 post bars


def _signal_bars(
    phase_b_close: float = 105.0,
    breakout_close: float = 108.0,
    breakout_volume: float = 6_000_000.0,
    turnover: float = 100_000_000.0,
    post_low: float = 99.0,
) -> pd.DataFrame:
    """Synthetic daily bars: 140-day gentle uptrend, 24-day flat base, one volume-spike
    breakout bar, then 5 declining bars (low breaches an 8% stop from the breakout close)."""
    dates = pd.date_range("2023-01-02", periods=N_BARS, freq="B")
    close = (
        [100.0 + 0.05 * i for i in range(140)]
        + [phase_b_close] * 24
        + [breakout_close]
        + [100.0] * 5
    )
    volume = [1_000_000.0] * BREAKOUT_IDX + [breakout_volume] + [1_000_000.0] * 5
    low = [c - 0.5 for c in close]
    for i in range(BREAKOUT_IDX + 1, N_BARS):
        low[i] = post_low
    return pd.DataFrame({
        "dt": dates,
        "open": close,
        "high": [c + 0.5 for c in close],
        "low": low,
        "close": close,
        "volume": volume,
        "turnover": [turnover] * N_BARS,
        "exchange": ["NSE"] * N_BARS,
        "symbol": ["SIG"] * N_BARS,
    })


def _universe(bars: pd.DataFrame, roc: float = 10.0, other_roc: float = None) -> pd.DataFrame:
    """Fake 63-day ROC universe: index=dates, columns=isins."""
    dates = pd.DatetimeIndex(pd.to_datetime(bars["dt"])).date
    data = {ISIN: [roc] * len(dates)}
    if other_roc is not None:
        data["INE000000002"] = [other_roc] * len(dates)
    return pd.DataFrame(data, index=dates)


def _breakout_date(bars: pd.DataFrame) -> date:
    return pd.to_datetime(bars["dt"]).dt.date.iloc[BREAKOUT_IDX]


# ---------------------------------------------------------------------------
# (a) _signal_series
# ---------------------------------------------------------------------------

def test_signal_fires_only_on_breakout_bar():
    bars = _signal_bars()
    df = bt._signal_series(bars, ISIN, _universe(bars))
    fired = df.index[df["signal"].fillna(False)]
    assert len(fired) == 1
    assert fired[0] == _breakout_date(bars)
    row = df.loc[fired[0]]
    assert bool(row["liquid"])
    assert bool(row["leader"])
    assert bool(row["in_uptrend"])
    assert row["rs"] >= bt.RS_LEADER_CUTOFF
    assert row["close"] > row["high_20"]
    assert row["vol_ratio"] >= 1.5
    assert row["from_ath_pct"] > -10


def test_high_20_is_shifted_one_day():
    bars = _signal_bars()
    df = bt._signal_series(bars, ISIN, _universe(bars))
    expected = df["close"].rolling(window=20, min_periods=10).max().shift(1)
    pd.testing.assert_series_equal(df["high_20"], expected.rename("high_20"))
    # Same-bar close must not be included: breakout close (108) > shifted high_20 (105).
    row = df.loc[_breakout_date(bars)]
    assert row["close"] == 108.0
    assert row["high_20"] == 105.0


def test_signal_requires_liquidity():
    bars = _signal_bars(turnover=1_000_000.0)  # well below LIQUIDITY_TURNOVER_CUTOFF
    df = bt._signal_series(bars, ISIN, _universe(bars))
    assert not df["signal"].fillna(False).any()
    assert not df["liquid"].fillna(False).any()


def test_signal_requires_rs_leader():
    bars = _signal_bars()
    # Second ISIN with a much higher ROC drags our stock's rank percentile to 50.
    df = bt._signal_series(bars, ISIN, _universe(bars, roc=10.0, other_roc=50.0))
    row = df.loc[_breakout_date(bars)]
    assert row["rs"] == 50
    assert not bool(row["leader"])
    assert not df["signal"].fillna(False).any()


def test_signal_requires_volume_spike():
    bars = _signal_bars(breakout_volume=1_000_000.0)  # no spike -> vol_ratio ~ 1
    df = bt._signal_series(bars, ISIN, _universe(bars))
    row = df.loc[_breakout_date(bars)]
    assert row["vol_ratio"] < 1.5
    assert not df["signal"].fillna(False).any()


def test_signal_requires_price_breakout():
    # Volume spike but close (105) does not exceed the prior 20-day high (105).
    bars = _signal_bars(breakout_close=105.0)
    df = bt._signal_series(bars, ISIN, _universe(bars))
    row = df.loc[_breakout_date(bars)]
    assert row["vol_ratio"] >= 1.5
    assert not (row["close"] > row["high_20"])
    assert not df["signal"].fillna(False).any()


def test_signal_requires_uptrend():
    # Deep pullback breaks close>ma50 (and ma50>ma150) even though the breakout bar
    # still clears the 20-day high with a volume spike.
    bars = _signal_bars(phase_b_close=95.0, breakout_close=97.0)
    df = bt._signal_series(bars, ISIN, _universe(bars))
    row = df.loc[_breakout_date(bars)]
    assert row["close"] > row["high_20"]  # breakout condition still holds
    assert not bool(row["in_uptrend"])
    assert not df["signal"].fillna(False).any()


# ---------------------------------------------------------------------------
# (b)+(c) run_backtest: position sizing and stop-loss exit (mocked data layer)
# ---------------------------------------------------------------------------

def _other_bars() -> pd.DataFrame:
    dates = pd.date_range("2023-01-02", periods=N_BARS, freq="B")
    close = [100.0 + 0.01 * i for i in range(N_BARS)]
    return pd.DataFrame({
        "dt": dates,
        "open": close,
        "high": [c + 0.5 for c in close],
        "low": [c - 0.5 for c in close],
        "close": close,
        "volume": [1_000_000.0] * N_BARS,
        "turnover": [100_000_000.0] * N_BARS,
        "exchange": ["NSE"] * N_BARS,
        "symbol": ["OTHER"] * N_BARS,
    })


def _run_backtest(monkeypatch, risk: float) -> dict:
    bars = _signal_bars()
    bars_by_isin = {ISIN: bars, "INE000000002": _other_bars()}
    symbols = pd.DataFrame([
        {"isin": ISIN, "symbol": "SIG"},
        {"isin": "INE000000002", "symbol": "OTHER"},
    ])
    monkeypatch.setattr(bt, "list_symbols", lambda: symbols)
    monkeypatch.setattr(bt, "read_bars", lambda isin: bars_by_isin[isin].copy())
    params = BacktestParams(
        stop=8.0, sell="ma50", risk=risk, maxpos=5, capital=1_000_000.0,
        market="all", period_start=date(2023, 1, 2),
        period_end=pd.to_datetime(bars["dt"]).dt.date.iloc[-1],
    )
    return bt.run_backtest(params)


def test_position_sizing_risk_based(monkeypatch):
    res = _run_backtest(monkeypatch, risk=1.5)
    log = res["portfolio"]["log"]
    assert len(log) == 1
    tr = log[0]
    assert tr["buy"] == 108.0
    # risk_amt = 1.5% * 1,000,000 = 15,000
    # pos_size = min(15,000 / 0.08, 0.30 * 1,000,000) = 187,500 (risk-based, below cap)
    # shares = int(187,500 / 108) = 1736
    assert tr["invested"] == round(1736 * 108.0, 2) == 187488.0


def test_position_sizing_capped_at_30_percent(monkeypatch):
    res = _run_backtest(monkeypatch, risk=5.0)
    tr = res["portfolio"]["log"][0]
    # risk_amt = 50,000 -> 50,000 / 0.08 = 625,000 > 0.30 * 1,000,000 -> capped at 300,000
    # shares = int(300,000 / 108) = 2777
    assert tr["invested"] == round(2777 * 108.0, 2) == 299916.0


def test_stop_loss_fills_at_buy_times_0_92(monkeypatch):
    res = _run_backtest(monkeypatch, risk=1.5)
    tr = res["portfolio"]["log"][0]
    # Next bar's low (99.0) breaches the stop (108 * 0.92 = 99.36) -> fill exactly at stop.
    assert tr["sell"] == round(108.0 * 0.92, 2) == 99.36
    assert tr["ret"] == -8.0
    assert tr["why"] == "\u22128.0% stop"  # U+2212 minus sign, matching the engine


# ---------------------------------------------------------------------------
# (d) _summarize stats
# ---------------------------------------------------------------------------

def _trade(ret: float, days: int, bo: date) -> Trade:
    return Trade(
        isin=ISIN, sym="SIG", bo=bo, buy=100.0, exit=bo,
        sell=round(100.0 * (1 + ret / 100), 2), ret=ret, days=days,
        rs=90, invested=10_000.0, open=False, why="test",
    )


def test_summarize_stats_and_max_drawdown():
    params = BacktestParams()
    dates = pd.date_range("2024-01-02", periods=4, freq="B").date.tolist()
    daily_equity = [
        {"dt": dates[0], "equity": 1_000_000.0},
        {"dt": dates[1], "equity": 1_100_000.0},  # peak
        {"dt": dates[2], "equity": 990_000.0},    # 10% off peak
        {"dt": dates[3], "equity": 1_210_000.0},  # new high
    ]
    trades = [
        _trade(10.0, 10, date(2024, 1, 10)),
        _trade(-5.0, 5, date(2024, 2, 10)),
        _trade(20.0, 20, date(2024, 2, 15)),
    ]
    res = bt._summarize(trades, 1_210_000.0, params, daily_equity)
    total = res["total"]
    assert total["n"] == 3
    assert total["win"] == 66.7
    assert total["avgWin"] == 15.0
    assert total["avgLoss"] == -5.0
    assert total["mean"] == 8.33
    assert total["days"] == 12
    assert res["portfolio"]["maxdd"] == 10.0
    assert res["portfolio"]["start"] == 1_000_000.0
    assert res["portfolio"]["end"] == 1_210_000.0
    assert len(res["byYear"]) == 1
    assert res["byYear"][0]["yr"] == 2024
    assert res["byYear"][0]["n"] == 3


def test_summarize_with_no_closed_trades():
    res = bt._summarize([], 1_000_000.0, BacktestParams(), [])
    assert res["ready"] is True
    assert res["trades"] == []
    assert res["portfolio"] == {}
