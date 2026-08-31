"""CLI to update the local OHLCV store from NSE/BSE bhavcopies."""
from __future__ import annotations

import argparse
import logging
from datetime import date, timedelta

from backend.data import ingest_bse, ingest_nse, security_master, store

logger = logging.getLogger(__name__)


def update_recent(days: int = 7) -> None:
    """Download the last N trading days from both exchanges and upsert."""
    end = date.today()
    start = end - timedelta(days=days + 5)  # add buffer for weekends/holidays

    logger.info("Updating NSE from %s to %s", start, end)
    nse_df = ingest_nse.download_range(start, end)
    if not nse_df.empty:
        store.upsert_bars(nse_df)
        logger.info("NSE: %s rows", len(nse_df))
    else:
        logger.warning("No NSE data downloaded")

    logger.info("Updating BSE from %s to %s", start, end)
    bse_df = ingest_bse.download_range(start, end)
    if not bse_df.empty:
        store.upsert_bars(bse_df)
        logger.info("BSE: %s rows", len(bse_df))
    else:
        logger.warning("No BSE data downloaded")

    logger.info("Updating symbol registry")
    nse_master = security_master.download_nse_security_master()
    if nse_master is not None:
        # merge names into registry
        _merge_names(nse_master)


def _merge_names(master: security_master.pd.DataFrame) -> None:
    import pandas as pd

    with store.engine.begin() as conn:
        for _, row in master.iterrows():
            if pd.isna(row["isin"]):
                continue
            conn.execute(
                store.text(
                    "UPDATE symbols SET symbol = :symbol, name = :name, series = :series WHERE isin = :isin"
                ),
                {"symbol": row["symbol"], "name": row["name"], "series": row["series"], "isin": row["isin"]},
            )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(description="Update local OHLCV store from exchange bhavcopies")
    parser.add_argument("--days", type=int, default=7, help="Number of recent calendar days to fetch")
    args = parser.parse_args()
    store.init_registry()
    update_recent(args.days)
    df = store.list_symbols()
    logger.info("Store now has %s symbols, last bar %s", len(df), df["last_dt"].max() if not df.empty else "n/a")


if __name__ == "__main__":
    main()
