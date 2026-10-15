"""Main agent registers router; this endpoint accepts public product codes only."""
import asyncio
from fastapi import APIRouter, HTTPException
from services.portfolio_product_research import collect_portfolio_product

router = APIRouter(prefix='/api/portfolio-products', tags=['portfolio-products'])
_slots = asyncio.Semaphore(3)


@router.get('/{ticker}/research')
async def portfolio_product_research(ticker: str):
    if len(ticker) != 6 or not ticker.isascii() or not ticker.isdigit():
        raise HTTPException(status_code=400, detail='Expected six-digit public fund code')
    async with _slots:
        return await asyncio.to_thread(collect_portfolio_product, ticker)

