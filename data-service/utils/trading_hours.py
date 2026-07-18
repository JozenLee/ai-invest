# A股交易时间检测工具
# 用于判断当前是否为交易时间，以及获取最近交易日

from datetime import datetime, time, timedelta


def is_trading_hours() -> bool:
    """判断当前是否为A股交易时间

    A股交易时间：
    - 周一至周五
    - 上午 9:30 - 11:30
    - 下午 13:00 - 15:00

    Returns:
        True 如果当前是交易时间
    """
    now = datetime.now()

    # 周末不交易
    if now.weekday() >= 5:
        return False

    current_time = now.time()

    # 上午 9:30-11:30
    morning = time(9, 30) <= current_time <= time(11, 30)
    # 下午 13:00-15:00
    afternoon = time(13, 0) <= current_time <= time(15, 0)

    return morning or afternoon


def is_pre_market() -> bool:
    """判断当前是否为盘前时间（交易日 9:30 之前）"""
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    return now.time() < time(9, 30)


def is_post_market() -> bool:
    """判断当前是否为盘后时间（交易日 15:00 之后）"""
    now = datetime.now()
    if now.weekday() >= 5:
        return False
    return now.time() > time(15, 0)


def get_last_trading_date() -> str:
    """获取最近交易日的日期

    规则：
    - 交易时间内 → 返回今天
    - 盘前（9:30前）→ 返回上一个交易日
    - 盘后（15:00后）→ 返回今天
    - 周末 → 返回上周五

    Returns:
        日期字符串，格式 "YYYY-MM-DD"
    """
    now = datetime.now()
    offset = 0

    if now.weekday() == 5:  # 周六
        offset = 1
    elif now.weekday() == 6:  # 周日
        offset = 2
    elif now.time() < time(9, 30):  # 盘前
        if now.weekday() == 0:  # 周一盘前
            offset = 3  # 上周五
        else:
            offset = 1  # 上一个交易日

    return (now - timedelta(days=offset)).strftime("%Y-%m-%d")


def get_market_status() -> dict:
    """获取市场状态信息

    Returns:
        {
            "isOpen": bool,          # 是否开盘中
            "isPreMarket": bool,     # 是否盘前
            "isPostMarket": bool,    # 是否盘后
            "status": str,           # 状态描述："trading" / "pre_market" / "post_market" / "closed"
            "statusText": str,       # 中文状态描述
            "lastTradingDate": str,  # 最近交易日
            "isRealtime": bool,      # 当前数据是否应为实时
        }
    """
    now = datetime.now()
    is_weekend = now.weekday() >= 5
    trading = is_trading_hours()
    pre = is_pre_market()
    post = is_post_market()

    if is_weekend:
        status = "closed"
        statusText = "休市（周末）"
    elif trading:
        status = "trading"
        statusText = "交易中"
    elif pre:
        status = "pre_market"
        statusText = "盘前"
    elif post:
        status = "post_market"
        statusText = "已收盘"
    else:
        # 午休时间
        status = "lunch_break"
        statusText = "午休"

    return {
        "isOpen": trading,
        "isPreMarket": pre and not is_weekend,
        "isPostMarket": post and not is_weekend,
        "status": status,
        "statusText": statusText,
        "lastTradingDate": get_last_trading_date(),
        "isRealtime": trading,
    }
