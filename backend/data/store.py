"""OHLCV persistence layer.

Keeps a SQLite symbol registry and one Parquet file per ISIN under data/parquet/.
NSE is preferred over BSE when both exchanges report the same ISIN on the same date.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import pandas as pd
from sqlalchemy import create_engine, text

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]  # repo root
DATA_DIR = ROOT / "data"
PARQUET_DIR = DATA_DIR / "parquet"
RAW_DIR = DATA_DIR / "raw"
DB_PATH = DATA_DIR / "obs.db"

PARQUET_DIR.mkdir(parents=True, exist_ok=True)
RAW_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(f"sqlite:///{DB_PATH}")


def init_registry() -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS symbols (
                    isin TEXT PRIMARY KEY,
                    symbol TEXT,
                    name TEXT,
                    exchange TEXT NOT NULL,
                    series TEXT,
                    first_dt TEXT,
                    last_dt TEXT,
                    n_bars INTEGER DEFAULT 0,
                    updated_at TEXT
                )
                """
            )
        )


def _isin_path(isin: str) -> Path:
    return PARQUET_DIR / f"{isin}.parquet"


def read_bars(isin: str) -> pd.DataFrame:
    p = _isin_path(isin)
    if not p.exists():
        return pd.DataFrame(columns=["dt", "open", "high", "low", "close", "volume", "turnover", "trades", "exchange"])
    df = pd.read_parquet(p)
    df["dt"] = pd.to_datetime(df["dt"])
    return df.sort_values("dt").reset_index(drop=True)


def _prefer_nse(df: pd.DataFrame) -> pd.DataFrame:
    """When two exchanges exist for the same date, prefer NSE."""
    if df.empty or "exchange" not in df.columns:
        return df
    df = df.sort_values("dt")
    # Create a priority column: NSE=0, others=1
    df["_ex_priority"] = df["exchange"].apply(lambda x: 0 if x == "NSE" else 1)
    df = df.sort_values(["dt", "_ex_priority"]).drop_duplicates(subset=["dt"], keep="first")
    return df.drop(columns=["_ex_priority"])


def write_bars(isin: str, df: pd.DataFrame) -> None:
    if df.empty:
        return
    df = df.copy()
    df["dt"] = pd.to_datetime(df["dt"])
    df = _prefer_nse(df)
    p = _isin_path(isin)
    df.to_parquet(p, index=False)


def upsert_bars(df: pd.DataFrame) -> None:
    """Upsert a DataFrame with multiple ISINs into per-ISIN parquet files and update registry."""
    if df.empty:
        return
    required = {"isin", "dt", "open", "high", "low", "close", "volume"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    cols = ["dt", "open", "high", "low", "close", "volume", "turnover", "trades", "exchange", "isin", "symbol", "name", "series"]
    df = df[[c for c in cols if c in df.columns]].copy()
    df["dt"] = pd.to_datetime(df["dt"])

    now = pd.Timestamp.utcnow().isoformat()
    registry_rows = []
    for isin, grp in df.groupby("isin"):
        existing = read_bars(isin)
        combined = pd.concat([existing, grp.drop(columns=["isin"])], ignore_index=True)
        combined["dt"] = pd.to_datetime(combined["dt"])
        combined = _prefer_nse(combined)
        write_bars(isin, combined)
        symbol_val = grp["symbol"].iloc[0] if "symbol" in grp.columns else None
        name_val = grp["name"].iloc[0] if "name" in grp.columns else None
        exchange_val = grp["exchange"].iloc[0]
        series_val = grp["series"].iloc[0] if "series" in grp.columns else None
        registry_rows.append(
            {
                "isin": isin,
                "symbol": symbol_val if pd.notna(symbol_val) else isin,
                "name": name_val if pd.notna(name_val) else None,
                "exchange": exchange_val if pd.notna(exchange_val) else "NSE",
                "series": series_val if pd.notna(series_val) else None,
                "first_dt": combined["dt"].min().strftime("%Y-%m-%d"),
                "last_dt": combined["dt"].max().strftime("%Y-%m-%d"),
                "n_bars": len(combined),
                "updated_at": now,
            }
        )

    init_registry()
    registry = pd.DataFrame(registry_rows)
    with engine.begin() as conn:
        for _, row in registry.iterrows():
            conn.execute(
                text(
                    """
                    INSERT INTO symbols (isin, symbol, name, exchange, series, first_dt, last_dt, n_bars, updated_at)
                    VALUES (:isin, :symbol, :name, :exchange, :series, :first_dt, :last_dt, :n_bars, :updated_at)
                    ON CONFLICT(isin) DO UPDATE SET
                        symbol=excluded.symbol,
                        name=COALESCE(excluded.name, symbols.name),
                        exchange=excluded.exchange,
                        series=COALESCE(excluded.series, symbols.series),
                        first_dt=excluded.first_dt,
                        last_dt=excluded.last_dt,
                        n_bars=excluded.n_bars,
                        updated_at=excluded.updated_at
                    """
                ),
                row.to_dict(),
            )


def list_symbols() -> pd.DataFrame:
    init_registry()
    return pd.read_sql("SELECT * FROM symbols ORDER BY last_dt DESC, symbol", engine)


def get_symbol(isin: str) -> Optional[dict]:
    init_registry()
    with engine.begin() as conn:
        row = conn.execute(text("SELECT * FROM symbols WHERE isin = :isin"), {"isin": isin}).mappings().fetchone()
    return dict(row) if row else None
