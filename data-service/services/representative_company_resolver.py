"""Resolve representative companies from ETF holdings before using web search.

ETF holdings establish that a listed company is investable through a candidate
product. AI/web research is only used afterwards to validate business fit and
explain why the company represents the segment.
"""
import asyncio
import re
from collections import defaultdict
from typing import Any, Dict, List, Optional

from models.industry_models import CompanyInfo, RepresentativeETFRef, SegmentDetail, SegmentInfo
from providers.etf_provider import ETFProvider


ALIASES = {
    "芯片": ["半导体", "集成电路", "芯片"],
    "算力": ["人工智能", "AI", "算力", "云计算"],
    "服务器": ["计算机", "云计算", "人工智能", "算力"],
    "光互连": ["通信", "光通信", "光模块"],
    "网络": ["通信", "5G", "网络"],
    "电池": ["新能源", "电池", "储能"],
    "汽车": ["汽车", "新能源车", "智能汽车"],
    "医药": ["医药", "医疗", "生物科技", "创新药"],
    "机器人": ["机器人", "智能制造", "工业母机"],
    "消费电子": ["消费电子", "电子", "智能终端"],
}
GENERIC_TERMS = {"产业", "行业", "企业", "公司", "制造", "服务", "设备", "应用", "系统", "运营"}


def normalize_security_code(value: Any) -> str:
    code = str(value or "").strip()
    code = re.sub(r"^(sh|sz)", "", code, flags=re.I)
    code = re.sub(r"\.(sh|sz)$", "", code, flags=re.I)
    return code.zfill(6) if code.isdigit() else code.upper()


class RepresentativeCompanyResolver:
    def __init__(self, provider: Optional[ETFProvider] = None):
        self.provider = provider or ETFProvider()
        self._catalog: Dict[str, Dict[str, Any]] | None = None
        self._catalog_lock = asyncio.Lock()
        self._holding_cache: Dict[str, List[Dict[str, Any]]] = {}
        self._holding_locks: Dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def _etf_catalog(self) -> Dict[str, Dict[str, Any]]:
        if self._catalog is not None:
            return self._catalog
        async with self._catalog_lock:
            if self._catalog is None:
                self._catalog = await self.provider._get_all_etf_data()
        return self._catalog

    async def _holdings(self, code: str) -> List[Dict[str, Any]]:
        if code in self._holding_cache:
            return self._holding_cache[code]
        async with self._holding_locks[code]:
            if code not in self._holding_cache:
                self._holding_cache[code] = await self.provider.get_holdings(code)
        return self._holding_cache[code]

    @staticmethod
    def _terms(industry_name: str, segment: SegmentInfo) -> List[str]:
        text = " ".join([industry_name, segment.name, *(segment.key_categories or [])])
        terms = {
            token for token in re.findall(r"[A-Za-z0-9]{2,}|[\u4e00-\u9fff]{2,8}", text)
            if token not in GENERIC_TERMS
        }
        for key, values in ALIASES.items():
            if key in text:
                terms.update(values)
        return sorted(terms, key=len, reverse=True)

    @classmethod
    def _score_etf(cls, name: str, terms: List[str], segment_name: str) -> float:
        normalized = name.upper()
        matched = [term for term in terms if term.upper() in normalized]
        score = sum(min(0.34, 0.08 * len(term)) for term in matched)
        if any(term.upper() in normalized for term in cls._terms_from_segment(segment_name)):
            score += 0.25
        return min(1.0, score)

    @staticmethod
    def _terms_from_segment(segment_name: str) -> List[str]:
        terms = [segment_name]
        for key, values in ALIASES.items():
            if key in segment_name:
                terms.extend(values)
        return terms

    async def resolve_candidates(
        self,
        industry_name: str,
        segment: SegmentInfo,
        *,
        etf_limit: int = 6,
        company_limit: int = 30,
    ) -> List[Dict[str, Any]]:
        catalog = await self._etf_catalog()
        terms = self._terms(industry_name, segment)
        etfs = []
        for raw_code, row in catalog.items():
            code = normalize_security_code(raw_code or row.get("代码") or row.get("ticker"))
            name = str(row.get("名称") or row.get("name") or "").strip()
            if not code or not name:
                continue
            relevance = self._score_etf(name, terms, segment.name)
            if relevance >= 0.2:
                etfs.append({"code": code, "name": name, "relevance": relevance})
        etfs.sort(key=lambda item: (-item["relevance"], item["code"]))
        etfs = etfs[:etf_limit]
        if not etfs:
            return []

        holding_sets = await asyncio.gather(*(self._holdings(item["code"]) for item in etfs))
        aggregated: Dict[str, Dict[str, Any]] = {}
        for etf, holdings in zip(etfs, holding_sets):
            for holding in holdings[:100]:
                code = normalize_security_code(holding.get("stock_code") or holding.get("stockCode"))
                if not code:
                    continue
                weight = float(holding.get("weight") or 0)
                candidate = aggregated.setdefault(code, {
                    "ticker": code,
                    "name": str(holding.get("stock_name") or holding.get("stockName") or code),
                    "representative_etfs": [],
                    "aggregate_weight": 0.0,
                })
                candidate["aggregate_weight"] += max(0.0, weight) * etf["relevance"]
                candidate["representative_etfs"].append({
                    "code": etf["code"],
                    "name": etf["name"],
                    "holding_weight": weight or None,
                    "relevance": etf["relevance"],
                    "report_period": holding.get("report_period") or holding.get("trade_date"),
                    "source": holding.get("source"),
                    "holding_verified": True,
                })

        etf_count = max(1, len(etfs))
        for candidate in aggregated.values():
            breadth = len(candidate["representative_etfs"]) / etf_count
            exposure = min(1.0, candidate["aggregate_weight"] / 12.0)
            semantic = sum(item["relevance"] for item in candidate["representative_etfs"]) / len(candidate["representative_etfs"])
            candidate["representativeness_score"] = round(0.5 * exposure + 0.3 * breadth + 0.2 * semantic, 4)
            candidate["match_confidence"] = round(0.65 + 0.3 * candidate["representativeness_score"], 4)
            candidate["match_source"] = "etf_holdings"
            candidate["selection_reason"] = f"进入{len(candidate['representative_etfs'])}只相关ETF持仓，按持仓权重、覆盖广度与主题相关度排序"
        return sorted(
            aggregated.values(),
            key=lambda item: (-item["representativeness_score"], -item["aggregate_weight"], item["ticker"]),
        )[:company_limit]

    @staticmethod
    def fallback_detail(candidates: List[Dict[str, Any]], segment_code: str, limit: int = 4) -> SegmentDetail:
        companies = []
        for index, candidate in enumerate(candidates[:limit]):
            companies.append(CompanyInfo(
                name=candidate["name"],
                ticker=candidate["ticker"],
                exchange="SH" if candidate["ticker"].startswith("6") else "SZ",
                country="CN",
                market_position="leader" if index == 0 else "major",
                segment_code=segment_code,
                representative_etfs=[RepresentativeETFRef(**item) for item in candidate["representative_etfs"]],
                match_source="etf_holdings",
                match_confidence=candidate["match_confidence"],
                representativeness_score=candidate["representativeness_score"],
                selection_reason=candidate["selection_reason"],
                description="基于相关ETF已披露持仓筛选的代表性企业，主营归属仍需研究证据复核。",
            ))
        return SegmentDetail(companies=companies, relationships=[])
