"""Download and parse NSE bhavcopy archives (old zip and new sec_bhavdata_full CSV formats)."""
from __future__ import annotations

import io
import logging
from datetime import date, timedelta
from functools import lru_cache
from typing import Dict, Optional
from zipfile import ZipFile

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (compatible; OpenBreakoutScanner/0.1)"


@lru_cache(maxsize=1)
def _nse_isin_map(timeout: float = 60.0) -> Dict[str, str]:
    """Download NSE equity security master and return symbol -> ISIN map."""
    url = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
    logger.info("Loading NSE security master for ISIN mapping")
    try:
        r = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout, follow_redirects=True)
        r.raise_for_status()
    except Exception as exc:
        logger.warning("Could not load NSE security master: %s", exc)
        return {}
    try:
        df = pd.read_csv(io.StringIO(r.text))
    except Exception as exc:
        logger.warning("Could not parse NSE security master: %s", exc)
        return {}
    df.columns = df.columns.str.strip()
    df = df.rename(columns={"SYMBOL": "symbol", "ISIN NUMBER": "isin", "SERIES": "series"})
    df["symbol"] = df["symbol"].astype(str).str.strip()
    df["isin"] = df["isin"].astype(str).str.strip()
    df["series"] = df["series"].astype(str).str.strip()
    df = df[df["series"].isin(["EQ", "BE"])]
    # Drop duplicate symbols, keep first
    return df.drop_duplicates("symbol").set_index("symbol")["isin"].to_dict()


def _month_abbr(dt: date) -> str:
    return dt.strftime("%b").upper()


def old_bhavcopy_url(dt: date) -> str:
    """Pre-2023 NSE zip format: cm18AUG2021bhav.csv.zip"""
    return (
        "https://nsearchives.nseindia.com/content/historical/"
        f"EQUITIES/{dt.year}/{_month_abbr(dt)}/cm{dt.day:02d}{_month_abbr(dt)}{dt.year}bhav.csv.zip"
    )


def download_old_bhavcopy(dt: date, timeout: float = 60.0) -> Optional[pd.DataFrame]:
    url = old_bhavcopy_url(dt)
    logger.info("Downloading NSE old-format bhavcopy: %s", url)
    try:
        r = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout, follow_redirects=True)
        r.raise_for_status()
    except Exception as exc:
        logger.debug("Failed to download %s: %s", url, exc)
        return None

    try:
        with ZipFile(io.BytesIO(r.content)) as zf:
            csv_name = [n for n in zf.namelist() if n.lower().endswith(".csv")][0]
            with zf.open(csv_name) as f:
                df = pd.read_csv(f)
    except Exception as exc:
        logger.debug("Failed to unzip %s: %s", url, exc)
        return None

    df.columns = df.columns.str.strip()
    df = df.rename(
        columns={
            "SYMBOL": "symbol",
            "SERIES": "series",
            "OPEN": "open",
            "HIGH": "high",
            "LOW": "low",
            "CLOSE": "close",
            "LAST": "last",
            "PREVCLOSE": "prev_close",
            "TOTTRDQTY": "volume",
            "TOTTRDVAL": "turnover",
            "TIMESTAMP": "dt",
            "TOTALTRADES": "trades",
            "ISIN": "isin",
        }
    )
    df["dt"] = pd.to_datetime(df["dt"], format="mixed", dayfirst=False)
    df["exchange"] = "NSE"
    df["series"] = df["series"].astype(str).str.strip()
    df["symbol"] = df["symbol"].astype(str).str.strip()
    df = df[df["series"].isin(["EQ", "BE"])].copy()
    return df


def download_recent_bhavcopy(dt: date, timeout: float = 60.0) -> Optional[pd.DataFrame]:
    """NSE publishes a daily full security-wise file: sec_bhavdata_full_DDMMYYYY.csv"""
    ddmmyyyy = dt.strftime("%d%m%Y")
    url = f"https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_{ddmmyyyy}.csv"
    logger.info("Downloading NSE full security file: %s", url)
    try:
        r = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout, follow_redirects=True)
        r.raise_for_status()
    except Exception as exc:
        logger.debug("Failed to download %s: %s", url, exc)
        return None

    try:
        # Strip BOM and whitespace from header
        text = r.text.lstrip("\ufeff")
        df = pd.read_csv(io.StringIO(text))
    except Exception as exc:
        logger.debug("Failed to parse %s: %s", url, exc)
        return None

    df.columns = df.columns.str.strip()
    df = df.rename(
        columns={
            "SYMBOL": "symbol",
            "SERIES": "series",
            "DATE1": "dt",
            "PREV_CLOSE": "prev_close",
            "OPEN_PRICE": "open",
            "HIGH_PRICE": "high",
            "LOW_PRICE": "low",
            "LAST_PRICE": "last",
            "CLOSE_PRICE": "close",
            "TTL_TRD_QNTY": "volume",
            "TURNOVER_LACS": "turnover_lacs",
            "NO_OF_TRADES": "trades",
            "DELIV_QTY": "deliv_qty",
            "DELIV_PER": "deliv_per",
        }
    )
    df["dt"] = pd.to_datetime(df["dt"], format="mixed", dayfirst=True)
    df["turnover"] = pd.to_numeric(df["turnover_lacs"], errors="coerce") * 1_00_000
    df["exchange"] = "NSE"
    # NSE CSVs sometimes pad series values with spaces
    df["series"] = df["series"].astype(str).str.strip()
    df["symbol"] = df["symbol"].astype(str).str.strip()
    # Map symbol to ISIN (recent full file does not include ISIN)
    isin_map = _nse_isin_map()
    df["isin"] = df["symbol"].map(isin_map)
    before = len(df)
    df = df.dropna(subset=["isin"]).copy()
    if len(df) < before:
        logger.debug("Dropped %s rows without ISIN mapping", before - len(df))
    # Keep EQ (regular) and BE (T2T) equity series; drop GS/GB/etc.
    df = df[df["series"].isin(["EQ", "BE"])].copy()
    return df


def download_bhavcopy(dt: date) -> Optional[pd.DataFrame]:
    """Download NSE bhavcopy for a date. Prefers recent CSV, falls back to old zip."""
    df = download_recent_bhavcopy(dt)
    if df is not None and not df.empty:
        return df
    return download_old_bhavcopy(dt)


def download_range(start: date, end: date) -> pd.DataFrame:
    """Download all available NSE bhavcopies in a date range and concatenate."""
    frames = []
    cur = start
    while cur <= end:
        df = download_bhavcopy(cur)
        if df is not None and not df.empty:
            frames.append(df)
        cur += timedelta(days=1)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    d = date(2025, 8, 28)
    df = download_bhavcopy(d)
    print(df.head())
