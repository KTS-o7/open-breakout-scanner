from datetime import date
import pandas as pd
import pytest

from backend.compute.snapshot import compute_stock_row, build_snapshot
from backend.data import store


def make_test_bars(name: str = None) -> pd.DataFrame:
    data = {
        "dt": pd.date_range("2024-01-01", periods=65, freq="B"),
        "open": [100.0 + i for i in range(65)],
        "high": [101.0 + i for i in range(65)],
        "low": [99.0 + i for i in range(65)],
        "close": [100.0 + i for i in range(65)],
        "volume": [1_000_000 for _ in range(65)],
        "turnover": [100_000_000.0 for _ in range(65)],
        "exchange": ["NSE" for _ in range(65)],
        "symbol": ["TESTSYM" for _ in range(65)],
    }
    if name is not None:
        data["name"] = [name for _ in range(65)]
    return pd.DataFrame(data)


def test_compute_stock_row_with_explicit_name():
    bars = make_test_bars()
    roc = pd.Series({"INE123456789": 10.0})
    row = compute_stock_row(
        isin="INE123456789",
        bars=bars,
        universe_roc=roc,
        as_of=date(2024, 4, 1),
        name="Test Company Limited",
    )
    assert row is not None
    assert row["name"] == "Test Company Limited"
    assert row["symbol"] == "TESTSYM"


def test_compute_stock_row_fallback_to_bars_name():
    bars = make_test_bars(name="Bar Company Ltd")
    roc = pd.Series({"INE123456789": 10.0})
    row = compute_stock_row(
        isin="INE123456789",
        bars=bars,
        universe_roc=roc,
        as_of=date(2024, 4, 1),
    )
    assert row is not None
    assert row["name"] == "Bar Company Ltd"


def test_compute_stock_row_without_name():
    bars = make_test_bars()
    roc = pd.Series({"INE123456789": 10.0})
    row = compute_stock_row(
        isin="INE123456789",
        bars=bars,
        universe_roc=roc,
        as_of=date(2024, 4, 1),
    )
    assert row is not None
    assert row["name"] is None


def test_build_snapshot_merges_security_master_names(monkeypatch, tmp_path):
    # Route data and snapshots to tmp_path
    monkeypatch.setattr(store, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(store, "PARQUET_DIR", tmp_path / "data" / "parquet")
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "data" / "obs.db")
    (tmp_path / "data" / "parquet").mkdir(parents=True, exist_ok=True)
    store.engine = store.create_engine(f"sqlite:///{tmp_path / 'data' / 'obs.db'}")
    store.init_registry()

    from backend.compute import snapshot as snap_module
    monkeypatch.setattr(snap_module, "SNAPSHOT_DIR", tmp_path / "snapshots")
    (tmp_path / "snapshots").mkdir(parents=True, exist_ok=True)

    # Upsert bars without name column (simulating NSE daily full file)
    bars = make_test_bars()  # no "name" column
    bars["isin"] = "INE123456789"
    store.upsert_bars(bars)

    # Mock security master DataFrame (simulating EQUITY_L.csv)
    mock_master = pd.DataFrame([
        {
            "symbol": "TESTSYM",
            "name": "Test Company Limited",
            "series": "EQ",
            "isin": "INE123456789",
            "exchange": "NSE",
        }
    ])

    result = build_snapshot(as_of=date(2024, 3, 29), security_master_df=mock_master)
    assert len(result["stocks"]) == 1
    stock = result["stocks"][0]
    assert stock["isin"] == "INE123456789"
    assert stock["name"] == "Test Company Limited"


def test_build_snapshot_fallback_to_registry_name(monkeypatch, tmp_path):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(store, "PARQUET_DIR", tmp_path / "data" / "parquet")
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "data" / "obs.db")
    (tmp_path / "data" / "parquet").mkdir(parents=True, exist_ok=True)
    store.engine = store.create_engine(f"sqlite:///{tmp_path / 'data' / 'obs.db'}")
    store.init_registry()

    from backend.compute import snapshot as snap_module
    monkeypatch.setattr(snap_module, "SNAPSHOT_DIR", tmp_path / "snapshots")
    (tmp_path / "snapshots").mkdir(parents=True, exist_ok=True)

    # Upsert bars with name in registry
    bars = make_test_bars(name="Registry Name Ltd")
    bars["isin"] = "INE987654321"
    bars["symbol"] = "REGISTRY"
    store.upsert_bars(bars)

    # Empty security master
    empty_master = pd.DataFrame(columns=["symbol", "name", "series", "isin", "exchange"])

    result = build_snapshot(as_of=date(2024, 3, 29), security_master_df=empty_master)
    assert len(result["stocks"]) == 1
    stock = result["stocks"][0]
    assert stock["name"] == "Registry Name Ltd"


def test_build_snapshot_defaults_to_latest_stored_trading_date(monkeypatch, tmp_path):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(store, "PARQUET_DIR", tmp_path / "data" / "parquet")
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "data" / "obs.db")
    (tmp_path / "data" / "parquet").mkdir(parents=True, exist_ok=True)
    store.engine = store.create_engine(f"sqlite:///{tmp_path / 'data' / 'obs.db'}")
    store.init_registry()

    from backend.compute import snapshot as snap_module
    monkeypatch.setattr(snap_module, "SNAPSHOT_DIR", tmp_path / "snapshots")
    (tmp_path / "snapshots").mkdir(parents=True, exist_ok=True)

    bars = make_test_bars()
    bars["isin"] = "INE123456789"
    store.upsert_bars(bars)

    result = build_snapshot(security_master_df=pd.DataFrame())

    assert result["as_of"] == bars["dt"].max().date().isoformat()


def test_build_snapshot_excludes_symbols_without_latest_trading_bar(monkeypatch, tmp_path):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(store, "PARQUET_DIR", tmp_path / "data" / "parquet")
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "data" / "obs.db")
    (tmp_path / "data" / "parquet").mkdir(parents=True, exist_ok=True)
    store.engine = store.create_engine(f"sqlite:///{tmp_path / 'data' / 'obs.db'}")
    store.init_registry()

    from backend.compute import snapshot as snap_module
    monkeypatch.setattr(snap_module, "SNAPSHOT_DIR", tmp_path / "snapshots")
    (tmp_path / "snapshots").mkdir(parents=True, exist_ok=True)

    fresh = make_test_bars()
    fresh["isin"] = "INE123456789"
    stale = make_test_bars().iloc[:-3].copy()
    stale["isin"] = "INE987654321"
    stale["symbol"] = "STALE"
    store.upsert_bars(fresh)
    store.upsert_bars(stale)

    result = build_snapshot(security_master_df=pd.DataFrame())

    assert result["as_of"] == fresh["dt"].max().date().isoformat()
    assert [stock["isin"] for stock in result["stocks"]] == ["INE123456789"]


def test_upsert_bars_preserves_existing_name(monkeypatch, tmp_path):
    monkeypatch.setattr(store, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(store, "PARQUET_DIR", tmp_path / "data" / "parquet")
    monkeypatch.setattr(store, "DB_PATH", tmp_path / "data" / "obs.db")
    (tmp_path / "data" / "parquet").mkdir(parents=True, exist_ok=True)
    store.engine = store.create_engine(f"sqlite:///{tmp_path / 'data' / 'obs.db'}")
    store.init_registry()

    # First upsert with name
    bars1 = make_test_bars(name="Original Company Name")
    bars1["isin"] = "INE111222333"
    bars1["symbol"] = "ORIG"
    store.upsert_bars(bars1)

    sym = store.get_symbol("INE111222333")
    assert sym["name"] == "Original Company Name"

    # Second upsert without name
    bars2 = make_test_bars()  # no name column
    bars2["isin"] = "INE111222333"
    bars2["symbol"] = "ORIG"
    store.upsert_bars(bars2)

    sym_after = store.get_symbol("INE111222333")
    # Should not be overwritten with NULL
    assert sym_after["name"] == "Original Company Name"
