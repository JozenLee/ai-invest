import asyncio
from datetime import datetime
from fastapi import APIRouter, HTTPException
import akshare as ak
import math
import re

router = APIRouter()
_fund_cache = {"loaded_at": None, "items": {}}
_profile_cache = {}
_etf_catalog_cache = {"loaded_at": None, "items": []}


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


async def _load_etf_catalog():
    now = datetime.now().timestamp()
    if _etf_catalog_cache["loaded_at"] and now - _etf_catalog_cache["loaded_at"] < 3600:
        return _etf_catalog_cache["items"]
    frame = await asyncio.to_thread(ak.fund_etf_spot_em)
    items = []
    if frame is not None and not frame.empty:
        for _, row in frame.iterrows():
            code = _value(row, "代码", "基金代码")
            name = _value(row, "名称", "基金简称")
            if code and name:
                items.append({"code": code.zfill(6), "name": name})
    _etf_catalog_cache.update({"loaded_at": now, "items": items})
    return items


def _target_etf_candidate(full_name, company, catalog):
    if "联接" not in str(full_name or ""):
        return None
    manager = re.sub(r"(?:基金)?管理(?:股份)?有限公司$|基金有限公司$", "", str(company or ""))
    theme = re.sub(r"交易型开放式(?:指数)?证券投资基金.*$", "", str(full_name or ""))
    theme = theme.replace(manager, "")
    def semantic(value):
        return re.sub(r"中证|国证|上证|深证|指数|产业|主题|全指|成份|发起式|基金|板", "", value)
    theme = semantic(theme)
    tokens = {theme[i:i + 2] for i in range(max(0, len(theme) - 1))}
    ranked = []
    for item in catalog:
        name = item["name"]
        if manager and manager not in name:
            continue
        candidate = semantic(re.sub(r"ETF.*$", "", name))
        candidate_tokens = {candidate[i:i + 2] for i in range(max(0, len(candidate) - 1))}
        overlap = 1.0 if candidate == theme else .85 + .1 * len(candidate) / len(theme) if len(candidate) >= 2 and candidate in theme else .8 if len(theme) >= 2 and theme in candidate else len(tokens & candidate_tokens) / max(1, len(tokens | candidate_tokens))
        ranked.append((overlap, item))
    ranked.sort(key=lambda value: value[0], reverse=True)
    if not ranked or ranked[0][0] < .18 or len(ranked) > 1 and ranked[0][0] - ranked[1][0] < .08:
        return None
    return ranked[0][1]


@router.get("/{ticker}/info")
async def get_fund_info(ticker: str):
    try:
        info = (await _load_funds()).get(ticker.strip().zfill(6))
        if not info:
            return {"success": False, "error": f"未找到基金 {ticker} 的类别信息", "data": None}
        return {"success": True, "data": info}
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))


def _finite_number(value):
    try:
        parsed = float(str(value).replace("%", "").strip())
        return parsed if math.isfinite(parsed) else None
    except (TypeError, ValueError):
        return None


def _holding_range(condition):
    text = str(condition or "").replace(" ", "")
    numbers = [float(item) for item in re.findall(r"\d+(?:\.\d+)?", text)]
    lower = numbers[0] if numbers else 0.0
    upper = numbers[-1] if len(numbers) > 1 else None
    if "<=" in text and text.find("<=") < text.find("持有期限"):
        lower = numbers[0]
    if "大于等于" in text and len(numbers) == 1:
        upper = None
    return lower, upper


@router.get("/{ticker}/profile")
async def get_fund_profile(ticker: str):
    """返回基金产品身份与赎回费档位。持有期只在 Node 组合服务中由可追溯日期计算。"""
    code = ticker.strip().zfill(6)
    cached = _profile_cache.get(code)
    now = datetime.now().timestamp()
    if cached and now - cached["loaded_at"] < 3600:
        return {"success": True, "data": cached["data"]}
    try:
        basic_frame, fee_frame = await asyncio.gather(
            asyncio.to_thread(ak.fund_individual_basic_info_xq, symbol=code, timeout=15),
            asyncio.to_thread(ak.fund_individual_detail_info_xq, symbol=code, timeout=15),
        )
        basic = {}
        if basic_frame is not None and not basic_frame.empty:
            for _, row in basic_frame.iterrows():
                basic[_value(row, "item", "项目")] = _value(row, "value", "值")
        schedule = []
        if fee_frame is not None and not fee_frame.empty:
            for _, row in fee_frame.iterrows():
                if _value(row, "费用类型") != "卖出规则":
                    continue
                condition = _value(row, "条件或名称")
                fee = _finite_number(row.get("费用"))
                if fee is None:
                    continue
                lower, upper = _holding_range(condition)
                schedule.append({"condition": condition, "minDays": lower, "maxDays": upper, "feePct": fee})
        name = basic.get("基金名称") or (await _load_funds()).get(code, {}).get("name") or code
        category = basic.get("基金类型") or (await _load_funds()).get(code, {}).get("category")
        product_type = "feeder" if "联接" in name else "index-enhanced" if "指数增强" in name else "qdii" if "QDII" in name.upper() else "active" if "混合" in name else "index" if "指数" in name else "other"
        full_name = basic.get("基金全称")
        company = basic.get("基金公司")
        target = _target_etf_candidate(full_name, company, await _load_etf_catalog()) if product_type == "feeder" else None
        data = {
            "ticker": code,
            "name": name,
            "fullName": full_name,
            "company": company,
            "category": category,
            "productType": product_type,
            "benchmark": basic.get("业绩比较基准"),
            "investmentStrategy": basic.get("投资策略"),
            "targetEtfCode": target["code"] if target else None,
            "targetEtfName": target["name"] if target else None,
            "mappingConfidence": .9 if target else None,
            "mappingEvidence": ([
                {"source": "eastmoney/fund-profile", "url": f"https://fund.eastmoney.com/{code}.html", "locator": "基金全称、基金公司与投资策略"},
                {"source": "eastmoney/etf-catalog", "url": "https://quote.eastmoney.com/center/gridlist.html#fund_etf", "locator": f"同管理人唯一主题ETF：{target['code']} {target['name']}"},
            ] if target else []),
            "redemptionFeeSchedule": schedule,
            "source": "xueqiu/fund-detail",
            "fetchedAt": datetime.now().astimezone().isoformat(),
        }
        _profile_cache[code] = {"loaded_at": now, "data": data}
        return {"success": True, "data": data}
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error))
