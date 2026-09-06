"""Local-only cash-equity paper trading ledger.

This module deliberately has no broker API or network calls. A plan is created only
from the current local breakout snapshot, then fills against later locally stored
daily bars. It is a conservative simulator, not a forecast or a trade instruction.
"""
from __future__ import annotations

import math
import sqlite3
from pathlib import Path
from typing import Any

import pandas as pd

from backend.compute.indicators import add_mas
from backend.data.store import read_bars

ROOT = Path(__file__).resolve().parents[2]
PAPER_DB_PATH = ROOT / "data" / "paper.db"

INITIAL_CAPITAL = 100_000.0
RISK_PCT = 0.25
MAX_OPEN_POSITIONS = 3
MAX_POSITION_PCT = 30.0
ESTIMATED_COST_RATE = 0.0015
SHORT_TERM_TAX_RESERVE_RATE = 0.20

_ACTIVE_STATUSES = {"planned", "open", "exit_pending"}


def _connection() -> sqlite3.Connection:
    PAPER_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(PAPER_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS paper_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            isin TEXT NOT NULL,
            symbol TEXT NOT NULL,
            planned_on TEXT NOT NULL,
            maximum_entry REAL NOT NULL,
            stop_price REAL NOT NULL,
            quantity INTEGER NOT NULL,
            status TEXT NOT NULL,
            entry_date TEXT,
            entry_price REAL,
            entry_cost REAL,
            exit_date TEXT,
            exit_price REAL,
            exit_net REAL,
            exit_reason TEXT,
            net_pnl REAL,
            tax_reserve REAL,
            last_processed_on TEXT
        )
        """
    )
    conn.commit()


def _fetch_trades(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute("SELECT * FROM paper_trades ORDER BY id DESC").fetchall()
    return [dict(row) for row in rows]


def _set_trade(conn: sqlite3.Connection, trade_id: int, **values: Any) -> None:
    if not values:
        return
    assignments = ", ".join(f"{column} = ?" for column in values)
    conn.execute(f"UPDATE paper_trades SET {assignments} WHERE id = ?", (*values.values(), trade_id))


def _bar_history(isin: str) -> pd.DataFrame:
    bars = read_bars(isin)
    if bars.empty:
        return bars
    bars = add_mas(bars)
    bars["dt"] = pd.to_datetime(bars["dt"])
    return bars.sort_values("dt").reset_index(drop=True)


def _close_trade(
    conn: sqlite3.Connection,
    trade: dict[str, Any],
    exit_date: str,
    exit_price: float,
    reason: str,
) -> None:
    gross_proceeds = int(trade["quantity"]) * exit_price
    exit_net = gross_proceeds * (1 - ESTIMATED_COST_RATE)
    net_pnl = exit_net - float(trade["entry_cost"])
    tax_reserve = max(net_pnl, 0.0) * SHORT_TERM_TAX_RESERVE_RATE
    _set_trade(
        conn,
        int(trade["id"]),
        status="closed",
        exit_date=exit_date,
        exit_price=round(exit_price, 2),
        exit_net=round(exit_net, 2),
        exit_reason=reason,
        net_pnl=round(net_pnl, 2),
        tax_reserve=round(tax_reserve, 2),
        last_processed_on=exit_date,
    )


def _sync_trade(conn: sqlite3.Connection, trade: dict[str, Any]) -> None:
    if trade["status"] not in _ACTIVE_STATUSES:
        return
    bars = _bar_history(str(trade["isin"]))
    if bars.empty:
        return

    lower_bound = trade["last_processed_on"] or trade["planned_on"]
    bars = bars[bars["dt"] > pd.Timestamp(lower_bound)]
    status = str(trade["status"])

    for bar in bars.itertuples(index=False):
        session = pd.Timestamp(bar.dt).strftime("%Y-%m-%d")
        opening_price = float(bar.open)
        low_price = float(bar.low)

        if status == "planned":
            if opening_price > float(trade["maximum_entry"]):
                _set_trade(
                    conn,
                    int(trade["id"]),
                    status="skipped",
                    exit_reason="Opened above maximum entry",
                    last_processed_on=session,
                )
                break
            if opening_price <= float(trade["stop_price"]):
                _set_trade(
                    conn,
                    int(trade["id"]),
                    status="skipped",
                    exit_reason="Opened at or below stop",
                    last_processed_on=session,
                )
                break

            entry_cost = int(trade["quantity"]) * opening_price * (1 + ESTIMATED_COST_RATE)
            _set_trade(
                conn,
                int(trade["id"]),
                status="open",
                entry_date=session,
                entry_price=round(opening_price, 2),
                entry_cost=round(entry_cost, 2),
            )
            trade["entry_cost"] = round(entry_cost, 2)
            status = "open"

        if status == "exit_pending":
            _close_trade(conn, trade, session, opening_price, str(trade["exit_reason"]))
            break

        if status == "open":
            if opening_price <= float(trade["stop_price"]):
                _close_trade(conn, trade, session, opening_price, "Gap through stop")
                break
            if low_price <= float(trade["stop_price"]):
                _close_trade(conn, trade, session, float(trade["stop_price"]), "Stop loss")
                break
            ma50 = getattr(bar, "ma50", None)
            if ma50 is not None and not pd.isna(ma50) and float(bar.close) < float(ma50):
                _set_trade(
                    conn,
                    int(trade["id"]),
                    status="exit_pending",
                    exit_reason="Close below 50-day average",
                    last_processed_on=session,
                )
                status = "exit_pending"
                continue

        _set_trade(conn, int(trade["id"]), last_processed_on=session)

    conn.commit()


def _sync_all(conn: sqlite3.Connection) -> None:
    for trade in _fetch_trades(conn):
        _sync_trade(conn, trade)


def _latest_close(isin: str) -> float | None:
    bars = _bar_history(isin)
    if bars.empty:
        return None
    return float(bars.iloc[-1]["close"])


def _trade_view(trade: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(trade["id"]),
        "isin": trade["isin"],
        "symbol": trade["symbol"],
        "status": trade["status"],
        "plannedOn": trade["planned_on"],
        "maximumEntry": round(float(trade["maximum_entry"]), 2),
        "stopPrice": round(float(trade["stop_price"]), 2),
        "quantity": int(trade["quantity"]),
        "entryDate": trade["entry_date"],
        "entryPrice": _round_or_none(trade["entry_price"]),
        "exitDate": trade["exit_date"],
        "exitPrice": _round_or_none(trade["exit_price"]),
        "exitReason": trade["exit_reason"],
        "netPnl": _round_or_none(trade["net_pnl"]),
        "taxReserve": _round_or_none(trade["tax_reserve"]),
        "lastClose": _latest_close(str(trade["isin"])) if trade["status"] in {"open", "exit_pending"} else None,
    }


def _round_or_none(value: Any) -> float | None:
    return round(float(value), 2) if value is not None else None


def _account_view(conn: sqlite3.Connection) -> dict[str, Any]:
    trades = _fetch_trades(conn)
    cash = INITIAL_CAPITAL
    reserved_cash = 0.0
    market_value = 0.0
    tax_reserve = 0.0

    for trade in trades:
        status = str(trade["status"])
        if status == "planned":
            reserved_cash += int(trade["quantity"]) * float(trade["maximum_entry"]) * (1 + ESTIMATED_COST_RATE)
        if trade["entry_cost"] is not None:
            cash -= float(trade["entry_cost"])
        if trade["exit_net"] is not None:
            cash += float(trade["exit_net"])
        if trade["tax_reserve"] is not None:
            tax_reserve += float(trade["tax_reserve"])
        if status in {"open", "exit_pending"}:
            last_close = _latest_close(str(trade["isin"]))
            if last_close is not None:
                market_value += int(trade["quantity"]) * last_close * (1 - ESTIMATED_COST_RATE)

    equity = cash + market_value
    after_tax_equity = equity - tax_reserve
    return {
        "initialCapital": INITIAL_CAPITAL,
        "cash": round(cash, 2),
        "reservedCash": round(reserved_cash, 2),
        "availableCash": round(max(cash - reserved_cash - tax_reserve, 0.0), 2),
        "marketValue": round(market_value, 2),
        "equity": round(equity, 2),
        "afterTaxEquity": round(after_tax_equity, 2),
        "taxReserve": round(tax_reserve, 2),
        "plannedRisk": round(max(after_tax_equity, 0.0) * RISK_PCT / 100, 2),
        "riskPct": RISK_PCT,
        "maxPositions": MAX_OPEN_POSITIONS,
        "maxPositionPct": MAX_POSITION_PCT,
        "estimatedCostPct": ESTIMATED_COST_RATE * 100,
        "taxReservePct": SHORT_TERM_TAX_RESERVE_RATE * 100,
        "trades": [_trade_view(trade) for trade in trades],
    }


def get_account() -> dict[str, Any]:
    """Return the current local account after synchronising from stored daily bars."""
    with _connection() as conn:
        _ensure_schema(conn)
        _sync_all(conn)
        return _account_view(conn)


def plan_trade(snapshot: dict[str, Any], isin: str, maximum_entry: float, stop_price: float) -> dict[str, Any]:
    """Create one explicitly approved paper plan and synchronise against local OHLCV."""
    if not all(math.isfinite(value) for value in [maximum_entry, stop_price]) or stop_price <= 0 or stop_price >= maximum_entry:
        raise ValueError("Stop price must be positive and below the maximum entry")

    candidate = next((stock for stock in snapshot.get("stocks", []) if stock.get("isin") == isin), None)
    if not candidate or not candidate.get("liquid") or not candidate.get("breakout"):
        raise ValueError("Paper trades can only be planned for an eligible liquid breakout")
    planned_on = snapshot.get("as_of")
    if not planned_on:
        raise ValueError("The current snapshot does not have an as-of date")

    with _connection() as conn:
        _ensure_schema(conn)
        _sync_all(conn)
        existing = _fetch_trades(conn)
        active = [trade for trade in existing if trade["status"] in _ACTIVE_STATUSES]
        if any(trade["isin"] == isin for trade in active):
            raise ValueError("This stock already has an active paper trade")
        if len(active) >= MAX_OPEN_POSITIONS:
            raise ValueError(f"The paper account allows at most {MAX_OPEN_POSITIONS} active positions")

        account = _account_view(conn)
        risk_per_share = maximum_entry - stop_price
        risk_limited_quantity = math.floor(account["plannedRisk"] / risk_per_share)
        cash_limited_quantity = math.floor(
            (account["availableCash"] * MAX_POSITION_PCT / 100) / (maximum_entry * (1 + ESTIMATED_COST_RATE))
        )
        quantity = min(risk_limited_quantity, cash_limited_quantity)
        if quantity < 1:
            raise ValueError("The account has insufficient available cash for this risk-limited plan")

        conn.execute(
            """
            INSERT INTO paper_trades (isin, symbol, planned_on, maximum_entry, stop_price, quantity, status)
            VALUES (?, ?, ?, ?, ?, ?, 'planned')
            """,
            (isin, candidate.get("symbol") or isin, planned_on, maximum_entry, stop_price, quantity),
        )
        conn.commit()
        _sync_all(conn)
        return _account_view(conn)
