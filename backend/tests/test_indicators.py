import pandas as pd
import pytest

from backend.compute.indicators import add_mas, add_roc, add_rsvolume


def make_bars() -> pd.DataFrame:
    return pd.DataFrame({
        "dt": pd.date_range("2024-01-01", periods=60, freq="B"),
        "open": [100 + i for i in range(60)],
        "high": [101 + i for i in range(60)],
        "low": [99 + i for i in range(60)],
        "close": [100 + i for i in range(60)],
        "volume": [1000 + i * 10 for i in range(60)],
        "turnover": [1_00_000 + i * 1000 for i in range(60)],
    })


def test_add_mas():
    df = add_mas(make_bars())
    assert "ma50" in df.columns
    assert "ma200" in df.columns
    # last close is 159; ma50 of linear series = avg(110..159) = 134.5
    assert df["ma50"].iloc[-1] == pytest.approx(134.5, rel=1e-3)


def test_add_roc():
    df = add_roc(make_bars(), 10)
    # linear series: close[-1]=159, close 10 bars earlier=149 -> ROC = 10/149*100
    assert df["roc10"].iloc[-1] == pytest.approx(10 / 149 * 100, rel=1e-3)


def test_add_rsvolume():
    df = add_rsvolume(make_bars(), 20)
    assert "vol_ratio" in df.columns
