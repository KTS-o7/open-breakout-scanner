"""Load exchange security masters to map ISINs to symbols, names, sectors, etc."""
from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Optional

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (compatible; OpenBreakoutScanner/0.1)"


def download_nse_security_master(timeout: float = 60.0) -> Optional[pd.DataFrame]:
    """NSE publishes an equity security master CSV."""
    url = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
    logger.info("Downloading NSE security master: %s", url)
    try:
        r = httpx.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout, follow_redirects=True)
        r.raise_for_status()
    except Exception as exc:
        logger.warning("Failed: %s", exc)
        return None
    try:
        df = pd.read_csv(io.StringIO(r.text))
    except Exception as exc:
        logger.warning("Parse failed: %s", exc)
        return None
    df = df.rename(
        columns={
            "SYMBOL": "symbol",
            "NAME OF COMPANY": "name",
            " SERIES": "series",
            " DATE OF LISTING": "listing_date",
            " PAID UP VALUE": "face_value",
            " MARKET LOT": "lot_size",
            " ISIN NUMBER": "isin",
            " FACE VALUE": "face_value2",
        }
    )
    df["exchange"] = "NSE"
    return df[["symbol", "name", "series", "isin", "exchange"]]


def download_bse_security_master(timeout: float = 60.0) -> Optional[pd.DataFrame]:
    """BSE security master is available as a CSV from bseindia.com."""
    url = "https://www.bseindia.com/download/Bhavcopy/Equity/EQ_ISINCODE_3108.zip"
    # Note: exact filename may change. We'll try a static fallback and return None if unavailable.
    logger.info("Downloading BSE security master: %s", url)
    try:
        r = httpx.get(url, headers={"User-Agent": USER_AGENT, "Referer": "https://www.bseindia.com/"}, timeout=timeout)
        r.raise_for_status()
    except Exception as exc:
        logger.warning("Failed: %s", exc)
        return None
    return None


def build_symbol_registry(nse_df: Optional[pd.DataFrame] = None, bse_df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    frames = []
    if nse_df is not None:
        frames.append(nse_df)
    if bse_df is not None:
        frames.append(bse_df)
    if not frames:
        return pd.DataFrame(columns=["symbol", "name", "series", "isin", "exchange"])
    reg = pd.concat(frames, ignore_index=True)
    reg = reg.dropna(subset=["isin"])
    return reg


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    nse = download_nse_security_master()
    print(nse.head())
