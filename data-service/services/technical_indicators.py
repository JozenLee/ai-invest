"""
Technical Indicators Module - 技术指标计算库
提供完整的技术分析指标计算函数，支持趋势、动量、成交量、稳定性分析

Author: AI Investment Analysis System
Created: 2026-08-09
"""
from typing import List, Dict, Any, Optional, Union, Tuple
import logging
import math
from datetime import datetime

logger = logging.getLogger(__name__)


# ============================================================================
# 工具函数 (Utility Functions)
# ============================================================================

def _validate_data(data: List[float], min_length: int, param_name: str = "data") -> None:
    """
    验证输入数据的有效性

    Args:
        data: 数据列表
        min_length: 最小数据长度要求
        param_name: 参数名称（用于错误提示）

    Raises:
        ValueError: 数据无效时抛出异常
    """
    if not data:
        raise ValueError(f"{param_name} cannot be empty")
    if len(data) < min_length:
        raise ValueError(f"{param_name} requires at least {min_length} data points, got {len(data)}")
    if any(x is None or (isinstance(x, float) and math.isnan(x)) for x in data):
        raise ValueError(f"{param_name} contains None or NaN values")


def _safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
    """安全除法，避免除零错误"""
    return numerator / denominator if denominator != 0 else default


# ============================================================================
# 趋势类指标 (Trend Indicators)
# ============================================================================

def calculate_ma(prices: List[float], periods: List[int] = None) -> Dict[str, List[Optional[float]]]:
    """
    计算多周期移动平均线 (Moving Average)

    算法: MA(n) = (P1 + P2 + ... + Pn) / n

    Args:
        prices: 收盘价序列
        periods: 周期列表，默认 [5, 10, 20, 60]

    Returns:
        字典，键为 'ma5', 'ma10' 等，值为MA序列

    Example:
        >>> prices = [10, 11, 12, 13, 14, 15]
        >>> result = calculate_ma(prices, [3, 5])
        >>> result['ma3']  # [None, None, 11.0, 12.0, 13.0, 14.0]
    """
    if periods is None:
        periods = [5, 10, 20, 60]

    _validate_data(prices, max(periods), "prices")

    result = {}

    for period in periods:
        ma_values = []
        for i in range(len(prices)):
            if i < period - 1:
                ma_values.append(None)
            else:
                window = prices[i - period + 1:i + 1]
                ma_values.append(sum(window) / period)

        result[f'ma{period}'] = ma_values

    logger.debug(f"Calculated MA for periods: {periods}")
    return result


def calculate_ema(prices: List[float], period: int = 12) -> List[Optional[float]]:
    """
    计算指数移动平均线 (Exponential Moving Average)

    算法 (递推):
        EMA(1) = Price(1)
        EMA(t) = α × Price(t) + (1 - α) × EMA(t-1)
        其中 α = 2 / (period + 1)

    Args:
        prices: 收盘价序列
        period: 计算周期，默认12

    Returns:
        EMA序列

    Example:
        >>> prices = [10, 11, 12, 13, 14]
        >>> ema = calculate_ema(prices, 3)
    """
    _validate_data(prices, 1, "prices")

    alpha = 2.0 / (period + 1)
    ema_values = [None] * len(prices)

    # 第一个值使用价格本身
    ema_values[0] = prices[0]

    # 递推计算
    for i in range(1, len(prices)):
        ema_values[i] = alpha * prices[i] + (1 - alpha) * ema_values[i - 1]

    return ema_values


def calculate_macd(
    prices: List[float],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9
) -> Dict[str, List[Optional[float]]]:
    """
    计算MACD指标 (Moving Average Convergence Divergence)

    算法:
        DIF = EMA(fast) - EMA(slow)
        DEA = EMA(DIF, signal)
        MACD = (DIF - DEA) × 2

    Args:
        prices: 收盘价序列
        fast: 快线周期，默认12
        slow: 慢线周期，默认26
        signal: 信号线周期，默认9

    Returns:
        {'dif': [], 'dea': [], 'macd': []}

    Example:
        >>> prices = [100, 101, 102, ...]
        >>> result = calculate_macd(prices)
        >>> result['dif'], result['dea'], result['macd']
    """
    _validate_data(prices, slow, "prices")

    # 计算快慢EMA
    ema_fast = calculate_ema(prices, fast)
    ema_slow = calculate_ema(prices, slow)

    # 计算DIF
    dif = [None] * len(prices)
    for i in range(len(prices)):
        if ema_fast[i] is not None and ema_slow[i] is not None:
            dif[i] = ema_fast[i] - ema_slow[i]

    # 计算DEA (DIF的EMA)
    dea = [None] * len(prices)
    alpha = 2.0 / (signal + 1)

    # 找到第一个非None的DIF作为DEA初始值
    first_valid_idx = next((i for i, x in enumerate(dif) if x is not None), None)
    if first_valid_idx is not None:
        dea[first_valid_idx] = dif[first_valid_idx]
        for i in range(first_valid_idx + 1, len(prices)):
            if dif[i] is not None:
                dea[i] = alpha * dif[i] + (1 - alpha) * dea[i - 1]

    # 计算MACD柱
    macd = [None] * len(prices)
    for i in range(len(prices)):
        if dif[i] is not None and dea[i] is not None:
            macd[i] = (dif[i] - dea[i]) * 2

    logger.debug(f"Calculated MACD with params: fast={fast}, slow={slow}, signal={signal}")

    return {
        'dif': dif,
        'dea': dea,
        'macd': macd
    }


def calculate_boll(
    prices: List[float],
    period: int = 20,
    multiplier: float = 2.0
) -> Dict[str, List[Optional[float]]]:
    """
    计算布林带 (Bollinger Bands)

    算法:
        中轨 = MA(period)
        标准差 = STDEV(period)
        上轨 = 中轨 + multiplier × 标准差
        下轨 = 中轨 - multiplier × 标准差
        带宽 = (上轨 - 下轨) / 中轨
        %B = (收盘价 - 下轨) / (上轨 - 下轨)

    Args:
        prices: 收盘价序列
        period: 计算周期，默认20
        multiplier: 标准差倍数，默认2

    Returns:
        {'upper': [], 'middle': [], 'lower': [], 'bandwidth': [], 'percentB': []}

    Example:
        >>> prices = [100, 102, 101, ...]
        >>> result = calculate_boll(prices, 20, 2)
    """
    _validate_data(prices, period, "prices")

    upper = []
    middle = []
    lower = []
    bandwidth = []
    percentB = []

    for i in range(len(prices)):
        if i < period - 1:
            upper.append(None)
            middle.append(None)
            lower.append(None)
            bandwidth.append(None)
            percentB.append(None)
        else:
            window = prices[i - period + 1:i + 1]
            ma = sum(window) / period
            variance = sum((x - ma) ** 2 for x in window) / period
            std = math.sqrt(variance)

            upper_val = ma + multiplier * std
            lower_val = ma - multiplier * std

            upper.append(upper_val)
            middle.append(ma)
            lower.append(lower_val)

            # 带宽
            bw = _safe_divide(upper_val - lower_val, ma, 0)
            bandwidth.append(bw)

            # %B
            pb = _safe_divide(prices[i] - lower_val, upper_val - lower_val, 0.5)
            percentB.append(pb)

    logger.debug(f"Calculated Bollinger Bands with period={period}, multiplier={multiplier}")

    return {
        'upper': upper,
        'middle': middle,
        'lower': lower,
        'bandwidth': bandwidth,
        'percentB': percentB
    }


def calculate_dmi(
    highs: List[float],
    lows: List[float],
    closes: List[float],
    period: int = 14
) -> Dict[str, List[Optional[float]]]:
    """
    计算DMI/ADX指标 (Directional Movement Index)

    算法:
        1. TR = max(H-L, |H-PC|, |L-PC|)
        2. +DM = H - PH (若 > 0 且 > |L - PL|), 否则0
        3. -DM = PL - L (若 > 0 且 > |H - PH|), 否则0
        4. +DI = EMA(+DM, period) / EMA(TR, period) × 100
        5. -DI = EMA(-DM, period) / EMA(TR, period) × 100
        6. DX = |+DI - -DI| / (+DI + -DI) × 100
        7. ADX = EMA(DX, period)
        8. ADXR = (ADX + ADX[period前]) / 2

    Args:
        highs: 最高价序列
        lows: 最低价序列
        closes: 收盘价序列
        period: 计算周期，默认14

    Returns:
        {'pdi': [], 'mdi': [], 'adx': [], 'adxr': []}

    Note:
        ADX > 25 表示趋势强劲
    """
    _validate_data(highs, period + 1, "highs")
    _validate_data(lows, period + 1, "lows")
    _validate_data(closes, period + 1, "closes")

    n = len(closes)

    # 计算TR, +DM, -DM
    tr_list = [None]
    plus_dm_list = [None]
    minus_dm_list = [None]

    for i in range(1, n):
        # TR
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1])
        )
        tr_list.append(tr)

        # +DM
        up_move = highs[i] - highs[i - 1]
        down_move = lows[i - 1] - lows[i]
        plus_dm = up_move if up_move > down_move and up_move > 0 else 0
        plus_dm_list.append(plus_dm)

        # -DM
        minus_dm = down_move if down_move > up_move and down_move > 0 else 0
        minus_dm_list.append(minus_dm)

    # EMA平滑
    alpha = 1.0 / period

    tr_smooth = [None] * n
    plus_dm_smooth = [None] * n
    minus_dm_smooth = [None] * n

    # 初始值：前period个数的和
    if period < n:
        tr_smooth[period] = sum(tr_list[1:period + 1])
        plus_dm_smooth[period] = sum(plus_dm_list[1:period + 1])
        minus_dm_smooth[period] = sum(minus_dm_list[1:period + 1])

        # 递推
        for i in range(period + 1, n):
            tr_smooth[i] = tr_smooth[i - 1] * (1 - alpha) + tr_list[i] * alpha
            plus_dm_smooth[i] = plus_dm_smooth[i - 1] * (1 - alpha) + plus_dm_list[i] * alpha
            minus_dm_smooth[i] = minus_dm_smooth[i - 1] * (1 - alpha) + minus_dm_list[i] * alpha

    # 计算+DI, -DI
    pdi = [None] * n
    mdi = [None] * n
    dx = [None] * n

    for i in range(period, n):
        if tr_smooth[i] and tr_smooth[i] > 0:
            pdi[i] = (plus_dm_smooth[i] / tr_smooth[i]) * 100
            mdi[i] = (minus_dm_smooth[i] / tr_smooth[i]) * 100

            di_sum = pdi[i] + mdi[i]
            if di_sum > 0:
                dx[i] = abs(pdi[i] - mdi[i]) / di_sum * 100

    # 计算ADX
    adx = [None] * n
    first_dx_idx = next((i for i, x in enumerate(dx) if x is not None), None)

    if first_dx_idx is not None and first_dx_idx + period < n:
        adx[first_dx_idx + period - 1] = sum(dx[first_dx_idx:first_dx_idx + period]) / period

        for i in range(first_dx_idx + period, n):
            if dx[i] is not None:
                adx[i] = adx[i - 1] * (1 - alpha) + dx[i] * alpha

    # 计算ADXR
    adxr = [None] * n
    for i in range(period * 2, n):
        if adx[i] is not None and adx[i - period] is not None:
            adxr[i] = (adx[i] + adx[i - period]) / 2

    logger.debug(f"Calculated DMI with period={period}")

    return {
        'pdi': pdi,
        'mdi': mdi,
        'adx': adx,
        'adxr': adxr
    }


# ============================================================================
# 动量类指标 (Momentum Indicators)
# ============================================================================

def calculate_rsi(
    prices: List[float],
    period: int = 14
) -> List[Optional[float]]:
    """
    计算RSI相对强弱指标 (Relative Strength Index)

    算法:
        1. 计算每日涨跌幅
        2. avgGain = MA(涨幅, period)
        3. avgLoss = MA(跌幅, period)
        4. RS = avgGain / avgLoss
        5. RSI = 100 - (100 / (1 + RS))

    Args:
        prices: 收盘价序列
        period: 计算周期，默认14

    Returns:
        RSI序列

    Note:
        RSI > 70 超买, RSI < 30 超卖

    Example:
        >>> prices = [100, 102, 101, 103, ...]
        >>> rsi = calculate_rsi(prices, 14)
    """
    _validate_data(prices, period + 1, "prices")

    # 计算价格变化
    changes = [None]
    for i in range(1, len(prices)):
        changes.append(prices[i] - prices[i - 1])

    rsi = [None] * len(prices)

    # 初始平均增益和损失
    gains = [max(0, ch) if ch is not None else 0 for ch in changes]
    losses = [abs(min(0, ch)) if ch is not None else 0 for ch in changes]

    if len(prices) > period:
        avg_gain = sum(gains[1:period + 1]) / period
        avg_loss = sum(losses[1:period + 1]) / period

        # Wilder平滑法
        for i in range(period, len(prices)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period

            if avg_loss == 0:
                rsi[i] = 100.0
            else:
                rs = avg_gain / avg_loss
                rsi[i] = 100 - (100 / (1 + rs))

    logger.debug(f"Calculated RSI with period={period}")
    return rsi


def calculate_kdj(
    highs: List[float],
    lows: List[float],
    closes: List[float],
    period: int = 9
) -> Dict[str, List[Optional[float]]]:
    """
    计算KDJ随机指标 (Stochastic Oscillator)

    算法:
        RSV = (C - LN) / (HN - LN) × 100
        K = 2/3 × K[前一日] + 1/3 × RSV
        D = 2/3 × D[前一日] + 1/3 × K
        J = 3K - 2D

    Args:
        highs: 最高价序列
        lows: 最低价序列
        closes: 收盘价序列
        period: 计算周期，默认9

    Returns:
        {'k': [], 'd': [], 'j': []}

    Note:
        K、D金叉看涨，死叉看跌
        J > 100 超买，J < 0 超卖

    Example:
        >>> highs = [105, 106, 107, ...]
        >>> lows = [99, 100, 101, ...]
        >>> closes = [102, 103, 104, ...]
        >>> result = calculate_kdj(highs, lows, closes, 9)
    """
    _validate_data(highs, period, "highs")
    _validate_data(lows, period, "lows")
    _validate_data(closes, period, "closes")

    n = len(closes)
    k_values = [None] * n
    d_values = [None] * n
    j_values = [None] * n

    # 初始K、D值设为50
    prev_k = 50.0
    prev_d = 50.0

    for i in range(period - 1, n):
        # 计算周期内最高和最低
        window_high = max(highs[i - period + 1:i + 1])
        window_low = min(lows[i - period + 1:i + 1])

        # 计算RSV
        if window_high == window_low:
            rsv = 50.0  # 避免除零
        else:
            rsv = (closes[i] - window_low) / (window_high - window_low) * 100

        # 递推计算K、D
        k = (2.0 / 3.0) * prev_k + (1.0 / 3.0) * rsv
        d = (2.0 / 3.0) * prev_d + (1.0 / 3.0) * k
        j = 3 * k - 2 * d

        k_values[i] = k
        d_values[i] = d
        j_values[i] = j

        prev_k = k
        prev_d = d

    logger.debug(f"Calculated KDJ with period={period}")

    return {
        'k': k_values,
        'd': d_values,
        'j': j_values
    }


def calculate_cci(
    highs: List[float],
    lows: List[float],
    closes: List[float],
    period: int = 14
) -> List[Optional[float]]:
    """
    计算CCI顺势指标 (Commodity Channel Index)

    算法:
        TP = (H + L + C) / 3
        SMA_TP = MA(TP, period)
        MD = Σ|TP - SMA_TP| / period
        CCI = (TP - SMA_TP) / (0.015 × MD)

    Args:
        highs: 最高价序列
        lows: 最低价序列
        closes: 收盘价序列
        period: 计算周期，默认14

    Returns:
        CCI序列

    Note:
        CCI > 100 强势，CCI < -100 弱势
        CCI在±100之间为常态区

    Example:
        >>> highs = [105, 106, ...]
        >>> lows = [99, 100, ...]
        >>> closes = [102, 103, ...]
        >>> cci = calculate_cci(highs, lows, closes, 14)
    """
    _validate_data(highs, period, "highs")
    _validate_data(lows, period, "lows")
    _validate_data(closes, period, "closes")

    # 计算典型价格
    tp = [(highs[i] + lows[i] + closes[i]) / 3 for i in range(len(closes))]

    cci = [None] * len(closes)

    for i in range(period - 1, len(closes)):
        window_tp = tp[i - period + 1:i + 1]
        sma_tp = sum(window_tp) / period

        # 计算平均偏差
        md = sum(abs(x - sma_tp) for x in window_tp) / period

        # 计算CCI
        if md > 0:
            cci[i] = (tp[i] - sma_tp) / (0.015 * md)
        else:
            cci[i] = 0

    logger.debug(f"Calculated CCI with period={period}")
    return cci


def calculate_wr(
    highs: List[float],
    lows: List[float],
    closes: List[float],
    period: int = 14
) -> List[Optional[float]]:
    """
    计算威廉指标 (Williams %R)

    算法:
        WR = (HN - C) / (HN - LN) × -100

    Args:
        highs: 最高价序列
        lows: 最低价序列
        closes: 收盘价序列
        period: 计算周期，默认14

    Returns:
        WR序列

    Note:
        WR > -20 超买区
        WR < -80 超卖区
        WR在-20至-80之间为常态区

    Example:
        >>> highs = [105, 106, ...]
        >>> lows = [99, 100, ...]
        >>> closes = [102, 103, ...]
        >>> wr = calculate_wr(highs, lows, closes, 14)
    """
    _validate_data(highs, period, "highs")
    _validate_data(lows, period, "lows")
    _validate_data(closes, period, "closes")

    wr = [None] * len(closes)

    for i in range(period - 1, len(closes)):
        window_high = max(highs[i - period + 1:i + 1])
        window_low = min(lows[i - period + 1:i + 1])

        if window_high == window_low:
            wr[i] = -50.0  # 避免除零
        else:
            wr[i] = (window_high - closes[i]) / (window_high - window_low) * -100

    logger.debug(f"Calculated WR with period={period}")
    return wr


# ============================================================================
# 成交量类指标 (Volume Indicators)
# ============================================================================

def calculate_obv(closes: List[float], volumes: List[float]) -> List[Optional[float]]:
    """
    计算能量潮 (On Balance Volume)

    算法:
        价涨 → OBV += 当日成交量
        价跌 → OBV -= 当日成交量
        价平 → OBV 不变

    Args:
        closes: 收盘价序列
        volumes: 成交量序列

    Returns:
        OBV序列

    Note:
        OBV上升表示资金流入，下降表示资金流出
        配合价格走势判断资金动向

    Example:
        >>> closes = [100, 102, 101, 103, ...]
        >>> volumes = [1000, 1200, 800, 1500, ...]
        >>> obv = calculate_obv(closes, volumes)
    """
    _validate_data(closes, 2, "closes")
    _validate_data(volumes, 2, "volumes")

    if len(closes) != len(volumes):
        raise ValueError("closes and volumes must have the same length")

    obv = [0.0]  # 第一天OBV为0

    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            obv.append(obv[-1] + volumes[i])
        elif closes[i] < closes[i - 1]:
            obv.append(obv[-1] - volumes[i])
        else:
            obv.append(obv[-1])

    logger.debug(f"Calculated OBV for {len(closes)} data points")
    return obv


def calculate_vol_ma(volumes: List[float], periods: List[int] = None) -> Dict[str, List[Optional[float]]]:
    """
    计算成交量均线 (Volume Moving Average)

    算法: VOL_MA(n) = (V1 + V2 + ... + Vn) / n

    Args:
        volumes: 成交量序列
        periods: 周期列表，默认 [5, 10, 20]

    Returns:
        字典，键为 'vol_ma5', 'vol_ma10' 等

    Example:
        >>> volumes = [1000, 1200, 1100, ...]
        >>> result = calculate_vol_ma(volumes, [5, 10])
        >>> result['vol_ma5']
    """
    if periods is None:
        periods = [5, 10, 20]

    _validate_data(volumes, max(periods), "volumes")

    result = {}

    for period in periods:
        vol_ma_values = []
        for i in range(len(volumes)):
            if i < period - 1:
                vol_ma_values.append(None)
            else:
                window = volumes[i - period + 1:i + 1]
                vol_ma_values.append(sum(window) / period)

        result[f'vol_ma{period}'] = vol_ma_values

    logger.debug(f"Calculated VOL_MA for periods: {periods}")
    return result


# ============================================================================
# 稳定性类指标 (Stability Indicators)
# ============================================================================

def calculate_volatility(prices: List[float], period: int = 20) -> Optional[float]:
    """
    计算年化波动率 (Annualized Volatility)

    算法:
        1. 计算日收益率: r[i] = ln(P[i] / P[i-1])
        2. 计算收益率标准差: σ
        3. 年化: σ_annual = σ × √252

    Args:
        prices: 收盘价序列
        period: 计算周期，默认20（可选，使用全部数据）

    Returns:
        年化波动率（百分比）

    Note:
        波动率越高，风险越大
        一般 < 15% 低波动，15-30% 中等，> 30% 高波动

    Example:
        >>> prices = [100, 102, 101, 103, ...]
        >>> vol = calculate_volatility(prices, 20)
        >>> print(f"年化波动率: {vol:.2f}%")
    """
    _validate_data(prices, 2, "prices")

    # 使用最近period个数据
    if period and len(prices) > period:
        prices = prices[-period:]

    # 计算对数收益率
    returns = []
    for i in range(1, len(prices)):
        if prices[i] > 0 and prices[i - 1] > 0:
            returns.append(math.log(prices[i] / prices[i - 1]))

    if not returns:
        return None

    # 计算标准差
    mean_return = sum(returns) / len(returns)
    variance = sum((r - mean_return) ** 2 for r in returns) / len(returns)
    std_dev = math.sqrt(variance)

    # 年化（假设252个交易日）
    annual_volatility = std_dev * math.sqrt(252) * 100

    logger.debug(f"Calculated volatility: {annual_volatility:.2f}% (period={period})")
    return annual_volatility


def calculate_max_drawdown(prices: List[float]) -> Dict[str, Any]:
    """
    计算最大回撤 (Maximum Drawdown)

    算法:
        回撤 = (峰值 - 当前值) / 峰值
        最大回撤 = max(回撤)

    Args:
        prices: 收盘价序列

    Returns:
        {
            'max_drawdown': 最大回撤百分比,
            'peak_value': 峰值价格,
            'trough_value': 谷底价格,
            'peak_index': 峰值索引,
            'trough_index': 谷底索引
        }

    Note:
        最大回撤用于衡量最坏情况下的损失
        一般 < 10% 低风险，10-20% 中等，> 20% 高风险

    Example:
        >>> prices = [100, 110, 105, 90, 95, ...]
        >>> result = calculate_max_drawdown(prices)
        >>> print(f"最大回撤: {result['max_drawdown']:.2f}%")
    """
    _validate_data(prices, 2, "prices")

    max_drawdown = 0.0
    peak_value = prices[0]
    peak_index = 0
    trough_value = prices[0]
    trough_index = 0

    current_peak = prices[0]
    current_peak_index = 0

    for i in range(1, len(prices)):
        if prices[i] > current_peak:
            current_peak = prices[i]
            current_peak_index = i

        drawdown = (current_peak - prices[i]) / current_peak * 100

        if drawdown > max_drawdown:
            max_drawdown = drawdown
            peak_value = current_peak
            peak_index = current_peak_index
            trough_value = prices[i]
            trough_index = i

    logger.debug(f"Calculated max drawdown: {max_drawdown:.2f}%")

    return {
        'max_drawdown': max_drawdown,
        'peak_value': peak_value,
        'trough_value': trough_value,
        'peak_index': peak_index,
        'trough_index': trough_index
    }


# ============================================================================
# 综合分析函数 (Composite Analysis)
# ============================================================================

def analyze_all_indicators(
    opens: Optional[List[float]] = None,
    highs: Optional[List[float]] = None,
    lows: Optional[List[float]] = None,
    closes: Optional[List[float]] = None,
    volumes: Optional[List[float]] = None
) -> Dict[str, Any]:
    """
    计算所有技术指标（一站式分析）

    Args:
        opens: 开盘价序列（可选）
        highs: 最高价序列（可选）
        lows: 最低价序列（可选）
        closes: 收盘价序列（必需）
        volumes: 成交量序列（可选）

    Returns:
        包含所有指标的字典

    Example:
        >>> result = analyze_all_indicators(
        ...     closes=[100, 102, 101, 103, ...],
        ...     volumes=[1000, 1200, 1100, ...]
        ... )
        >>> result['trend']['ma']['ma5']
        >>> result['momentum']['rsi']
    """
    if closes is None:
        raise ValueError("closes is required")

    _validate_data(closes, 60, "closes")

    result = {
        'trend': {},
        'momentum': {},
        'volume': {},
        'stability': {}
    }

    try:
        # 趋势类
        result['trend']['ma'] = calculate_ma(closes, [5, 10, 20, 60])
        result['trend']['macd'] = calculate_macd(closes)
        result['trend']['boll'] = calculate_boll(closes)

        if highs and lows:
            result['trend']['dmi'] = calculate_dmi(highs, lows, closes)

        # 动量类
        result['momentum']['rsi'] = calculate_rsi(closes)

        if highs and lows:
            result['momentum']['kdj'] = calculate_kdj(highs, lows, closes)
            result['momentum']['cci'] = calculate_cci(highs, lows, closes)
            result['momentum']['wr'] = calculate_wr(highs, lows, closes)

        # 成交量类
        if volumes:
            result['volume']['obv'] = calculate_obv(closes, volumes)
            result['volume']['vol_ma'] = calculate_vol_ma(volumes)

        # 稳定性类
        result['stability']['volatility'] = calculate_volatility(closes)
        result['stability']['max_drawdown'] = calculate_max_drawdown(closes)

        logger.info("Successfully calculated all technical indicators")

    except Exception as e:
        logger.error(f"Error calculating indicators: {e}")
        raise

    return result


# ============================================================================
# 模块导出
# ============================================================================

__all__ = [
    # 趋势类
    'calculate_ma',
    'calculate_ema',
    'calculate_macd',
    'calculate_boll',
    'calculate_dmi',
    # 动量类
    'calculate_rsi',
    'calculate_kdj',
    'calculate_cci',
    'calculate_wr',
    # 成交量类
    'calculate_obv',
    'calculate_vol_ma',
    # 稳定性类
    'calculate_volatility',
    'calculate_max_drawdown',
    # 综合分析
    'analyze_all_indicators',
]
