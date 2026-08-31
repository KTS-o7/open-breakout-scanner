"""Download and parse BSE unified bhavcopy archives."""
from __future__ import annotations

import io
import logging
from datetime import date, timedelta
from typing import Optional

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (compatible; OpenBreakoutScanner/0.1)"


def unified_bhavcopy_url(dt: date) -> str:
    """New SEBI-mandated unified bhavcopy format."""
    yyyymmdd = dt.strftime("%Y%m%d")
    return f"https://www.bseindia.com/download/Bhavcopy/Equity/BhavCopy_BSE_CM_0_0_0_{yyyymmdd}_F_0000.CSV"


def download_bhavcopy(dt: date, timeout: float = 60.0) -> Optional[pd.DataFrame]:
    url = unified_bhavcopy_url(dt)
    logger.info("Downloading BSE unified bhavcopy: %s", url)
    try:
        r = httpx.get(
            url,
            headers={
                "User-Agent": USER_AGENT,
                "Referer": "https://www.bseindia.com/",
            },
            timeout=timeout,
            follow_redirects=True,
        )
        r.raise_for_status()
    except Exception as exc:
        logger.debug("Failed to download %s: %s", url, exc)
        return None

    try:
        text = r.text.lstrip("\ufeff")
        df = pd.read_csv(io.StringIO(text), low_memory=False)
    except Exception as exc:
        logger.debug("Failed to parse %s: %s", url, exc)
        return None

    # Strip whitespace and any stray control chars from headers
    df.columns = df.columns.str.strip().str.replace(r"\s+", "", regex=True)
    df.columns = df.columns.str.replace(r"[^\w]", "", regex=True)

    col_map = {
        "TradDt": "dt",
        "BizDt": "biz_dt",
        "ISIN": "isin",
        "TckrSymb": "symbol_raw",
        "SctySrs": "series",
        "FinInstrmNm": "name",
        "OpnPric": "open",
        "HghPric": "high",
        "LwPric": "low",
        "ClsPric": "close",
        "LastPric": "last",
        "PrvsClsgPric": "prev_close",
        "TtlTradgVol": "volume",
        "TtlTrfVal": "turnover",
        "TtlNbOfTxsExctd": "trades",
    }
    present = [c for c in col_map.keys() if c in df.columns]
    df = df.rename(columns={k: col_map[k] for k in present})
    df["dt"] = pd.to_datetime(df["dt"], errors="coerce")
    df["series"] = df["series"].astype(str).str.strip().str.upper()
    df["symbol"] = df["symbol_raw"].astype(str).str.replace(r"#+$", "", regex=True).str.strip()
    df["name"] = df["name"].astype(str).str.strip()
    df["exchange"] = "BSE"
    # Keep equity segments; ignore rights/warrants
    df = df[df["series"].isin(["A", "B", "T", "XT", "BE", "EQ"])].copy()
    # Drop rows without a price or volume
    df = df.dropna(subset=["close", "volume"])
    df = df[df["volume"] > 0]
    return df


def download_range(start: date, end: date) -> pd.DataFrame:
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
