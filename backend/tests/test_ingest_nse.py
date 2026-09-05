import io
from datetime import date
import pandas as pd
import pytest

from backend.data import ingest_nse


MOCK_EQUITY_L_CSV = """SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE
RELIANCE,Reliance Industries Limited,EQ,29-NOV-1995,10,1,INE002A01018,10
TCS,Tata Consultancy Services Limited,EQ,25-AUG-2004,1,1,INE467B01029,1
INFY,Infosys Limited,EQ,08-FEB-1995,5,1,INE009A01021,5
"""

MOCK_RECENT_BHAVDATA_CSV = """SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER
RELIANCE, EQ, 01-Sep-2026, 2900.0, 2910.0, 2950.0, 2905.0, 2940.0, 2945.0, 2930.0, 1000000, 29300.0, 50000, 500000, 50.0
TCS, EQ, 01-Sep-2026, 4200.0, 4210.0, 4250.0, 4200.0, 4230.0, 4240.0, 4220.0, 500000, 21100.0, 30000, 300000, 60.0
"""


def test_nse_master_maps(monkeypatch):
    class MockResponse:
        status_code = 200
        text = MOCK_EQUITY_L_CSV
        def raise_for_status(self):
            pass

    monkeypatch.setattr(ingest_nse.httpx, "get", lambda *args, **kwargs: MockResponse())
    ingest_nse._load_nse_master_df.cache_clear()
    ingest_nse._nse_isin_map.cache_clear()
    ingest_nse._nse_name_map.cache_clear()

    isin_map = ingest_nse._nse_isin_map()
    assert isin_map["RELIANCE"] == "INE002A01018"
    assert isin_map["TCS"] == "INE467B01029"

    name_map = ingest_nse._nse_name_map()
    assert name_map["RELIANCE"] == "Reliance Industries Limited"
    assert name_map["TCS"] == "Tata Consultancy Services Limited"


def test_download_recent_bhavcopy_maps_name(monkeypatch):
    class MockClient:
        def __init__(self, url):
            self.url = url
            self.status_code = 200
        @property
        def text(self):
            if "EQUITY_L.csv" in self.url:
                return MOCK_EQUITY_L_CSV
            return MOCK_RECENT_BHAVDATA_CSV
        def raise_for_status(self):
            pass

    def mock_get(url, *args, **kwargs):
        return MockClient(url)

    monkeypatch.setattr(ingest_nse.httpx, "get", mock_get)
    ingest_nse._load_nse_master_df.cache_clear()
    ingest_nse._nse_isin_map.cache_clear()
    ingest_nse._nse_name_map.cache_clear()

    df = ingest_nse.download_recent_bhavcopy(date(2026, 9, 1))
    assert df is not None
    assert "name" in df.columns
    assert "isin" in df.columns
    reliance = df[df["symbol"] == "RELIANCE"].iloc[0]
    assert reliance["isin"] == "INE002A01018"
    assert reliance["name"] == "Reliance Industries Limited"

    tcs = df[df["symbol"] == "TCS"].iloc[0]
    assert tcs["isin"] == "INE467B01029"
    assert tcs["name"] == "Tata Consultancy Services Limited"
