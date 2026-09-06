"""Tests for the local-only paper-trading ledger."""
from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from backend.compute import paper


ISIN = "INE000000001"


def _bars(opens: list[float], lows: list[float] | None = None) -> pd.DataFrame:
    closes = opens.copy()
    return pd.DataFrame(
        {
            "dt": pd.date_range("2026-09-04", periods=len(opens), freq="B"),
            "open": opens,
            "high": [value + 2 for value in opens],
            "low": lows or [value - 1 for value in opens],
            "close": closes,
            "volume": [1_000_000] * len(opens),
        }
    )


def _snapshot(breakout: bool = True) -> dict:
    return {
        "as_of": "2026-09-04",
        "stocks": [
            {
                "isin": ISIN,
                "symbol": "ALPHA",
                "name": "Alpha Limited",
                "close": 100.0,
                "liquid": True,
                "breakout": breakout,
            }
        ],
    }


def _use_temp_ledger(monkeypatch, tmp_path: Path) -> Path:
    ledger = tmp_path / "paper.db"
    monkeypatch.setattr(paper, "PAPER_DB_PATH", ledger)
    return ledger


def test_plan_trade_fills_at_next_open_when_under_maximum_entry(monkeypatch, tmp_path):
    ledger = _use_temp_ledger(monkeypatch, tmp_path)
    monkeypatch.setattr(paper, "read_bars", lambda isin: _bars([100.0, 101.0]))

    account = paper.plan_trade(_snapshot(), ISIN, 102.0, 92.0)

    trade = account["trades"][0]
    assert ledger.exists()
    assert trade["status"] == "open"
    assert trade["symbol"] == "ALPHA"
    assert trade["quantity"] == 25
    assert trade["entryPrice"] == 101.0
    assert trade["entryDate"] == "2026-09-07"


def test_plan_trade_skips_a_next_open_above_the_maximum_entry(monkeypatch, tmp_path):
    _use_temp_ledger(monkeypatch, tmp_path)
    monkeypatch.setattr(paper, "read_bars", lambda isin: _bars([100.0, 105.0]))

    account = paper.plan_trade(_snapshot(), ISIN, 102.0, 92.0)

    trade = account["trades"][0]
    assert trade["status"] == "skipped"
    assert trade["exitReason"] == "Opened above maximum entry"


def test_open_position_uses_the_open_when_price_gaps_below_stop(monkeypatch, tmp_path):
    _use_temp_ledger(monkeypatch, tmp_path)
    monkeypatch.setattr(paper, "read_bars", lambda isin: _bars([100.0, 100.0, 90.0], lows=[99.0, 99.0, 89.0]))

    account = paper.plan_trade(_snapshot(), ISIN, 102.0, 92.0)

    trade = account["trades"][0]
    assert trade["status"] == "closed"
    assert trade["entryPrice"] == 100.0
    assert trade["exitPrice"] == 90.0
    assert trade["exitReason"] == "Gap through stop"
    assert trade["netPnl"] < -250.0
    assert trade["taxReserve"] == 0.0


def test_plan_trade_rejects_a_stock_that_is_not_a_liquid_breakout(monkeypatch, tmp_path):
    _use_temp_ledger(monkeypatch, tmp_path)

    with pytest.raises(ValueError, match="eligible liquid breakout"):
        paper.plan_trade(_snapshot(breakout=False), ISIN, 102.0, 92.0)
