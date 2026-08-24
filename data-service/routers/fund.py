import asyncio
from datetime import datetime
from fastapi import APIRouter, HTTPException
import akshare as ak

router = APIRouter()
_fund_cache = {"loaded_at": None, "items": {}}


def _value(row, *keys):
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip() and str(value).strip().lower() != "nan":
            return str(value).strip()
    return ""


def _category(row):
    fund_type = _value(row, "基金类型", "类型")
    fund_class = _value(row, "基金分类", "分类", "投资类型")
    if fund_type and fund_class and fund_type != fund_class:
        return f"{fund_type}-{fund_class}"
    return fund_type or fund_class or None


async def _load_funds():
    now = datetime.now().timestamp()
    if _fund_cache["loaded_at"] and now - _fund_cache["loaded_at"] < 3600:
        return _fund_cache["items"]
    frame = await asyncio.to_thread(ak.fund_name_em)
    items = {}
    if frame is not None and not frame.empty:
        for _, row in frame.iterrows():
            code = _value(row, "基金代码", "代码")
            if code:
                items[code.zfill(6)] = {
                    "ticker": code.zfill(6),
                    "name": _value(row, "基金简称", "名称"),
                    "category": _category(row),
                    "fundType": _value(row, "基金类型", "类型") or None,
                    "fundClass": _value(row, "基金分类", "分类", "投资类型") or None,
                }
    _fund_cache["loaded_at"] = now
    _fund_cache["items"] = items
    return items


@router.get("/{ticker}/info")
async def get_fund_info(ticker: str):
    try:
        info = (await _load_funds()).get(ticker.strip().zfill(6))
        if not info:
            return {"success": False, "error": f"未找到基金 {ticker} 的类别信息", "data": None}
        return {"success": True, "data": info}
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
