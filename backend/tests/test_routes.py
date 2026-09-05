from backend.api import routes
from fastapi.testclient import TestClient

from backend.main import app


def test_api_allows_local_vite_origins():
    client = TestClient(app)

    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://127.0.0.1:5174",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5174"


def test_breakouts_excludes_illiquid_signals(monkeypatch):
    monkeypatch.setattr(
        routes,
        "_latest_snapshot",
        lambda: {
            "stocks": [
                {
                    "isin": "INE000000001",
                    "symbol": "LIQUID",
                    "dt": "2026-09-04",
                    "close": 100.0,
                    "breakout": True,
                    "liquid": True,
                },
                {
                    "isin": "INE000000002",
                    "symbol": "ILLIQUID",
                    "dt": "2026-09-04",
                    "close": 100.0,
                    "breakout": True,
                    "liquid": False,
                },
            ]
        },
    )

    events = routes.get_breakouts()

    assert [event.sym for event in events] == ["LIQUID"]
