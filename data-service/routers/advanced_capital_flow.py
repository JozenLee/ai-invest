# 高级资金流向分析路由
# 提供更具参考价值的资金流向指标：
# 1. 持续多日大单净流入趋势
# 2. 成交量放大分析
# 3. 股价与资金流向背离
# 4. 机构行为数据（龙虎榜、北向资金等）

from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import statistics

from services.data_service import data_service

router = APIRouter()


def _analyze_consecutive_trend(sector_data: List[Dict]) -> Dict:
    """分析板块连续流入趋势

    Args:
        sector_data: 板块资金流向历史数据

    Returns:
        包含连续天数、累计净流入等信息的字典
    """
    if not sector_data:
        return {
            "days": 0,
            "totalNet": 0,
            "avgDaily": 0,
            "direction": "neutral",
            "strength": "weak"
        }

    # 按净流入排序，取Top 5板块
    top_sectors = sorted(sector_data, key=lambda x: abs(x.get("netFlow", 0)), reverse=True)[:5]

    if not top_sectors:
        return {
            "days": 0,
            "totalNet": 0,
            "avgDaily": 0,
            "direction": "neutral",
            "strength": "weak"
        }

    # 计算平均净流入
    total_net = sum(s.get("netFlow", 0) for s in top_sectors)
    avg_net = total_net / len(top_sectors) if top_sectors else 0

    # 判断方向和强度
    direction = "inflow" if avg_net > 0 else "outflow"

    if abs(avg_net) >= 10:
        strength = "strong"
    elif abs(avg_net) >= 3:
        strength = "moderate"
    else:
        strength = "weak"

    return {
        "days": 1,  # 当前仅支持单日数据，后续可扩展多日
        "totalNet": round(avg_net, 2),
        "avgDaily": round(avg_net, 2),
        "direction": direction,
        "strength": strength
    }


def _analyze_volume_amplification(sector_data: List[Dict]) -> Dict:
    """分析成交量放大情况

    Args:
        sector_data: 板块资金流向数据

    Returns:
        包含成交量放大倍数等信息的字典
    """
    if not sector_data:
        return {
            "currentVolume": 0,
            "avgVolume": 0,
            "amplification": 1.0,
            "isAmplified": False
        }

    # 使用板块净流入的绝对值作为成交活跃度的代理指标
    volumes = [abs(s.get("netFlow", 0)) for s in sector_data if s.get("netFlow")]

    if not volumes:
        return {
            "currentVolume": 0,
            "avgVolume": 0,
            "amplification": 1.0,
            "isAmplified": False
        }

    current_volume = volumes[0] if volumes else 0
    avg_volume = statistics.mean(volumes) if len(volumes) > 1 else current_volume

    amplification = current_volume / avg_volume if avg_volume > 0 else 1.0
    is_amplified = amplification >= 1.5

    return {
        "currentVolume": round(current_volume, 2),
        "avgVolume": round(avg_volume, 2),
        "amplification": round(amplification, 2),
        "isAmplified": is_amplified
    }


def _analyze_price_flow_divergence(sector_data: List[Dict]) -> Dict:
    """分析股价与资金流向背离

    Args:
        sector_data: 板块资金流向数据（包含涨跌幅）

    Returns:
        包含背离类型和信号的字典
    """
    if not sector_data:
        return {
            "priceChange": 0,
            "flowNet": 0,
            "isDivergent": False,
            "divergenceType": "none",
            "signal": "无明显背离"
        }

    # 取净流入最大的板块
    top_sector = max(sector_data, key=lambda x: abs(x.get("netFlow", 0))) if sector_data else {}

    price_change = top_sector.get("changePct", 0)
    flow_net = top_sector.get("netFlow", 0)

    # 判断背离：资金流入但股价下跌（看多背离），或资金流出但股价上涨（看空背离）
    is_divergent = False
    divergence_type = "none"
    signal = "价格与资金流向同步"

    if flow_net > 5 and price_change < -1:
        is_divergent = True
        divergence_type = "bullish"
        signal = "资金流入但股价下跌，可能存在市场分歧或短期调整"
    elif flow_net < -5 and price_change > 1:
        is_divergent = True
        divergence_type = "bearish"
        signal = "资金流出但股价上涨，可能存在散户推动或短期反弹"

    return {
        "priceChange": round(price_change, 2),
        "flowNet": round(flow_net, 2),
        "isDivergent": is_divergent,
        "divergenceType": divergence_type,
        "signal": signal
    }


@router.get("/enhanced")
async def get_enhanced_capital_flow():
    """获取增强版资金流向数据（替代传统的机构/散户/市场情绪指标）"""
    try:
        # 并行获取数据
        sector_data_today = await data_service.get_sector_capital_flow("今日")
        northbound_data = await data_service.get_northbound_flow()
        lhb_data = await data_service.get_lhb_data()

        # 转换为统一格式
        sectors_formatted = []
        for item in sector_data_today:
            net = float(item.get("今日主力净流入-净额", 0))
            change_pct = float(item.get("今日涨跌幅", 0))
            sectors_formatted.append({
                "sector": item.get("名称", ""),
                "netFlow": round(net / 1e8, 2),  # 前端期望的字段名
                "changePct": round(change_pct, 2),
            })

        # 分析各项指标
        consecutive_trend = _analyze_consecutive_trend(sectors_formatted)
        volume_amplification = _analyze_volume_amplification(sectors_formatted)
        price_flow_divergence = _analyze_price_flow_divergence(sectors_formatted)

        # 构建机构行为数据
        has_northbound = bool(northbound_data and "value" in northbound_data)
        northbound_net = round(float(northbound_data.get("value", 0)), 2) if has_northbound else 0

        # 龙虎榜数据统计
        lhb_count = len(lhb_data) if lhb_data else 0
        lhb_net_buy = 0  # 简化处理，后续可根据买卖方向计算
        lhb_top_stocks = []

        if lhb_data:
            # 取前5个上榜股票
            for item in lhb_data[:5]:
                lhb_top_stocks.append({
                    "name": item.get("stock_name", ""),
                    "netBuy": round(item.get("amount", 0) / 1e8, 2)
                })

        institutional_behavior = {
            "dragonTiger": {
                "count": lhb_count,
                "netBuy": lhb_net_buy,
                "topStocks": lhb_top_stocks
            },
            "institutionalSeats": {
                "buySeats": 0,  # 需要额外API支持
                "sellSeats": 0,
                "netBuy": 0
            },
            "northboundCapital": {
                "net": northbound_net,
                "shConnect": round(float(northbound_data.get("shConnect", 0)), 2) if has_northbound else 0,
                "szConnect": round(float(northbound_data.get("szConnect", 0)), 2) if has_northbound else 0,
                "stale": northbound_data.get("stale", True) if has_northbound else True,
                "dataDate": northbound_data.get("date", "") if has_northbound else "",
                "source": northbound_data.get("source", "unavailable") if has_northbound else "unavailable"
            }
        }

        # 板块流向（保留原有逻辑）
        sectors_formatted.sort(key=lambda x: x["netFlow"], reverse=True)
        top_inflow = sectors_formatted[:10]
        top_outflow = sorted(sectors_formatted, key=lambda x: x["netFlow"])[:10]

        return {
            "success": True,
            "data": {
                "consecutiveTrend": consecutive_trend,
                "volumeAmplification": volume_amplification,
                "priceFlowDivergence": price_flow_divergence,
                "institutionalBehavior": institutional_behavior,
                "topInflowSectors": top_inflow,
                "topOutflowSectors": top_outflow,
                "source": "realtime",
                "dataDate": datetime.now().strftime("%Y-%m-%d"),
                "dataQuality": "realtime",
                "timestamp": datetime.now().isoformat()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lhb/latest")
async def get_latest_lhb():
    """获取最新龙虎榜数据"""
    try:
        data = await data_service.get_lhb_data()
        return {
            "success": True,
            "data": data,
            "count": len(data) if data else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/lhb/{date}")
async def get_lhb_by_date(date: str):
    """获取指定日期龙虎榜数据

    Args:
        date: YYYY-MM-DD格式
    """
    try:
        data = await data_service.get_lhb_detail(date)
        return {
            "success": True,
            "data": data,
            "count": len(data) if data else 0,
            "date": date
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
