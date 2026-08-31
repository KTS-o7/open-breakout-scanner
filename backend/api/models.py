"""Pydantic models for FastAPI responses."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class Health(BaseModel):
    universe: int = 0
    in_uptrend: int = 0
    pct_uptrend: float = 0.0
    leaders: int = 0
    breaking_out: int = 0


class StockRow(BaseModel):
    isin: str
    symbol: Optional[str] = None
    name: Optional[str] = None
    exchange: Optional[str] = None
    dt: Optional[str] = None
    close: Optional[float] = None
    volume: Optional[int] = None
    ma50: Optional[float] = None
    ma150: Optional[float] = None
    ma200: Optional[float] = None
    rs: Optional[int] = None
    from_ath_pct: Optional[float] = None
    vol_ratio: Optional[float] = None
    in_uptrend: bool = False
    leader: bool = False
    liquid: bool = False
    breakout: bool = False


class Snapshot(BaseModel):
    as_of: str
    health: Health
    stocks: List[StockRow]


class OhlcBar(BaseModel):
    dt: str
    open: float
    high: float
    low: float
    close: float
    volume: int
    turnover: Optional[float] = None
    ma50: Optional[float] = None
    ma150: Optional[float] = None
    ma200: Optional[float] = None
    rs: Optional[int] = None


class BreakoutEvent(BaseModel):
    d: str
    isin: str
    sym: Optional[str] = None
    name: Optional[str] = None
    close: float
    vol_ratio: Optional[float] = None
    rs: Optional[int] = None


class StockDetail(StockRow):
    bars: List[OhlcBar] = []
