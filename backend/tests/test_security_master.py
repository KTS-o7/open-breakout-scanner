import io
import pandas as pd
import pytest

from backend.data import security_master


MOCK_EQUITY_L_CSV = """SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE
RELIANCE,Reliance Industries Limited,EQ,29-NOV-1995,10,1,INE002A01018,10
INFY,Infosys Limited,EQ,08-FEB-1995,5,1,INE009A01021,5
"""


def test_download_nse_security_master(monkeypatch):
    class MockResponse:
        status_code = 200
        text = MOCK_EQUITY_L_CSV
        def raise_for_status(self):
            pass

    monkeypatch.setattr(security_master.httpx, "get", lambda *args, **kwargs: MockResponse())

    df = security_master.download_nse_security_master()
    assert df is not None
    assert list(df.columns) == ["symbol", "name", "series", "isin", "exchange"]
    assert len(df) == 2
    assert df.iloc[0]["symbol"] == "RELIANCE"
    assert df.iloc[0]["name"] == "Reliance Industries Limited"
    assert df.iloc[0]["isin"] == "INE002A01018"
    assert df.iloc[0]["exchange"] == "NSE"
