"""Pydantic models for FastAPI responses."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


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


class BacktestYearRow(BaseModel):
    yr: Optional[int] = None
    n: int
    win: float
    mean: float
    avgWin: Optional[float] = None
    avgLoss: Optional[float] = None
    days: Optional[int] = None


class BacktestResponse(BaseModel):
    ready: bool
    stop: float
    sell: str
    risk: float
    maxpos: int
    capital: float
    market: str
    entry: str
    total: BacktestYearRow
    byYear: List[BacktestYearRow]
    portfolio: dict


class PaperTradeRequest(BaseModel):
    isin: str
    maximumEntry: float = Field(gt=0)
    stopPrice: float = Field(gt=0)


class PaperTrade(BaseModel):
    id: int
    isin: str
    symbol: str
    status: str
    plannedOn: str
    maximumEntry: float
    stopPrice: float
    quantity: int
    entryDate: Optional[str] = None
    entryPrice: Optional[float] = None
    exitDate: Optional[str] = None
    exitPrice: Optional[float] = None
    exitReason: Optional[str] = None
    netPnl: Optional[float] = None
    taxReserve: Optional[float] = None
    lastClose: Optional[float] = None


class PaperAccount(BaseModel):
    initialCapital: float
    cash: float
    reservedCash: float
    availableCash: float
    marketValue: float
    equity: float
    afterTaxEquity: float
    taxReserve: float
    plannedRisk: float
    riskPct: float
    maxPositions: int
    maxPositionPct: float
    estimatedCostPct: float
    taxReservePct: float
    trades: List[PaperTrade]
