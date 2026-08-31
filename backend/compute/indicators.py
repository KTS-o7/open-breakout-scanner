"""Technical indicator helpers built on pandas."""
from __future__ import annotations

import pandas as pd


def ensure_sorted(df: pd.DataFrame) -> pd.DataFrame:
    return df.sort_values("dt").reset_index(drop=True)


def add_mas(df: pd.DataFrame) -> pd.DataFrame:
    df = ensure_sorted(df).copy()
    for window in [10, 20, 50, 150, 200]:
        df[f"ma{window}"] = df["close"].rolling(window=window, min_periods=window // 2).mean()
    return df


def add_ema(df: pd.DataFrame, window: int, col: str = "close") -> pd.DataFrame:
    df = ensure_sorted(df).copy()
    df[f"ema{window}"] = df[col].ewm(span=window, adjust=False, min_periods=window // 2).mean()
    return df


def add_atr(df: pd.DataFrame, window: int = 14) -> pd.DataFrame:
    df = ensure_sorted(df).copy()
    df["tr0"] = df["high"] - df["low"]
    df["tr1"] = (df["high"] - df["close"].shift(1)).abs()
    df["tr2"] = (df["low"] - df["close"].shift(1)).abs()
    df["tr"] = df[["tr0", "tr1", "tr2"]].max(axis=1)
    df[f"atr{window}"] = df["tr"].rolling(window=window, min_periods=window // 2).mean()
    return df.drop(columns=["tr0", "tr1", "tr2", "tr"])


def add_roc(df: pd.DataFrame, window: int) -> pd.DataFrame:
    df = ensure_sorted(df).copy()
    df[f"roc{window}"] = df["close"].pct_change(window) * 100
    return df


def add_rsvolume(df: pd.DataFrame, window: int = 20) -> pd.DataFrame:
    df = ensure_sorted(df).copy()
    df["vol_ma"] = df["volume"].rolling(window=window, min_periods=window // 2).mean()
    df["vol_ratio"] = df["volume"] / df["vol_ma"]
    return df


def add_rs(df: pd.DataFrame, universe_roc: pd.Series, as_of_date) -> pd.DataFrame:
    """Add IBD-style relative strength percentile based on a 63-day ROC ranking.

    `universe_roc`: Series indexed by ISIN with the ROC value for the as-of date.
    """
    df = ensure_sorted(df).copy()
    rank_pct = universe_roc.rank(pct=True) * 100
    isin = df["isin"].iloc[0] if "isin" in df.columns else None
    df["rs"] = None
    if isin and isin in rank_pct.index:
        df.loc[df["dt"] == as_of_date, "rs"] = int(round(rank_pct.loc[isin]))
    return df


def add_pivot_highs_lows(df: pd.DataFrame, window: int = 10) -> pd.DataFrame:
    df = ensure_sorted(df).copy()
    df["pivot_high"] = df["high"].shift(window).eq(df["high"].rolling(window=2 * window + 1, center=True).max())
    df["pivot_low"] = df["low"].shift(window).eq(df["low"].rolling(window=2 * window + 1, center=True).min())
    return df


def add_ath_distance(df: pd.DataFrame, window: int = 250) -> pd.DataFrame:
    df = ensure_sorted(df).copy()
    df["high_250"] = df["close"].rolling(window=window, min_periods=window // 2).max()
    df["from_ath_pct"] = (df["close"] / df["high_250"] - 1) * 100
    return df
