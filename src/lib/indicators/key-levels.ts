/**
 * Key Levels Indicators - 关键点位识别
 * 包括斐波那契回调、黄金分割、关键价格区间等
 */

interface PriceData {
  close: number;
  high: number;
  low: number;
  volume?: number;
  timestamp?: string;
}

/**
 * 斐波那契回调位
 */
export interface FibonacciLevels {
  trend: 'uptrend' | 'downtrend';
  highest: number;
  lowest: number;
  levels: {
    ratio: number;
    price: number;
    label: string;
  }[];
}

export function calculateFibonacciRetracement(
  data: PriceData[],
  lookbackPeriod: number = 60
): FibonacciLevels | null {
  if (data.length < lookbackPeriod) return null;

  const recentData = data.slice(-lookbackPeriod);
  const highest = Math.max(...recentData.map((d) => d.high));
  const lowest = Math.min(...recentData.map((d) => d.low));

  // 判断趋势
  const firstPrice = recentData[0].close;
  const lastPrice = recentData[recentData.length - 1].close;
  const trend = lastPrice > firstPrice ? 'uptrend' : 'downtrend';

  // 斐波那契比率
  const ratios = [
    { ratio: 0, label: '0% (最高点)' },
    { ratio: 0.236, label: '23.6%' },
    { ratio: 0.382, label: '38.2%' },
    { ratio: 0.5, label: '50%' },
    { ratio: 0.618, label: '61.8% (黄金分割)' },
    { ratio: 0.786, label: '78.6%' },
    { ratio: 1, label: '100% (最低点)' },
  ];

  const range = highest - lowest;
  const levels = ratios.map((r) => ({
    ratio: r.ratio,
    price:
      trend === 'downtrend'
        ? highest - range * r.ratio
        : lowest + range * (1 - r.ratio),
    label: r.label,
  }));

  return {
    trend,
    highest,
    lowest,
    levels,
  };
}

/**
 * 关键价格区间
 */
export interface PriceZone {
  type: 'support' | 'resistance' | 'consolidation';
  upper: number;
  lower: number;
  strength: number; // 强度 (0-1)
  touchCount: number; // 触及次数
  lastTouch?: string; // 最后触及时间
}

export function identifyKeyPriceZones(
  data: PriceData[],
  lookbackPeriod: number = 90,
  zoneThreshold: number = 0.015 // 1.5%的区间宽度
): PriceZone[] {
  if (data.length < lookbackPeriod) return [];

  const recentData = data.slice(-lookbackPeriod);
  const currentPrice = recentData[recentData.length - 1].close;

  // 收集所有价格触及点
  const pricePoints: { price: number; timestamp: string; type: 'high' | 'low' }[] = [];

  recentData.forEach((d) => {
    pricePoints.push({
      price: d.high,
      timestamp: d.timestamp || '',
      type: 'high',
    });
    pricePoints.push({
      price: d.low,
      timestamp: d.timestamp || '',
      type: 'low',
    });
  });

  // 按价格排序
  pricePoints.sort((a, b) => a.price - b.price);

  // 识别价格聚集区
  const zones: PriceZone[] = [];
  let i = 0;

  while (i < pricePoints.length) {
    const basePrice = pricePoints[i].price;
    const zonePoints: typeof pricePoints = [pricePoints[i]];

    // 收集在阈值范围内的所有点
    let j = i + 1;
    while (j < pricePoints.length) {
      if (
        Math.abs(pricePoints[j].price - basePrice) / basePrice <=
        zoneThreshold
      ) {
        zonePoints.push(pricePoints[j]);
        j++;
      } else {
        break;
      }
    }

    // 如果有足够多的触及点，认为是关键区间
    if (zonePoints.length >= 3) {
      const prices = zonePoints.map((p) => p.price);
      const upper = Math.max(...prices);
      const lower = Math.min(...prices);
      const avgPrice = (upper + lower) / 2;

      // 判断区间类型
      let type: 'support' | 'resistance' | 'consolidation';
      if (avgPrice < currentPrice * 0.95) {
        type = 'support';
      } else if (avgPrice > currentPrice * 1.05) {
        type = 'resistance';
      } else {
        type = 'consolidation';
      }

      // 计算强度（基于触及次数和最近性）
      const touchCount = zonePoints.length;
      const recentTouches = zonePoints.filter((p, idx) => {
        const dataIdx = recentData.findIndex((d) => d.timestamp === p.timestamp);
        return dataIdx >= recentData.length - 30; // 最近30个交易日
      }).length;

      const strength = Math.min(
        (touchCount * 0.5 + recentTouches * 0.5) / 10,
        1
      );

      const lastTouch = zonePoints[zonePoints.length - 1].timestamp;

      zones.push({
        type,
        upper,
        lower,
        strength,
        touchCount,
        lastTouch,
      });
    }

    i = j;
  }

  return zones;
}

/**
 * 成交量加权平均价格 (VWAP) - 基于PriceData数组
 */
export function calculateVWAPFromPriceData(data: PriceData[]): number | null {
  if (data.length === 0) return null;

  let sumPriceVolume = 0;
  let sumVolume = 0;

  data.forEach((d) => {
    const volume = d.volume || 0;
    const typicalPrice = (d.high + d.low + d.close) / 3;
    sumPriceVolume += typicalPrice * volume;
    sumVolume += volume;
  });

  return sumVolume > 0 ? sumPriceVolume / sumVolume : null;
}

/**
 * 枢轴点 (Pivot Points)
 */
export interface PivotPoints {
  pivot: number; // 枢轴点
  r1: number; // 阻力位1
  r2: number; // 阻力位2
  r3: number; // 阻力位3
  s1: number; // 支撑位1
  s2: number; // 支撑位2
  s3: number; // 支撑位3
}

export function calculatePivotPoints(prevDay: PriceData): PivotPoints {
  const { high, low, close } = prevDay;

  const pivot = (high + low + close) / 3;
  const r1 = 2 * pivot - low;
  const r2 = pivot + (high - low);
  const r3 = high + 2 * (pivot - low);
  const s1 = 2 * pivot - high;
  const s2 = pivot - (high - low);
  const s3 = low - 2 * (high - pivot);

  return { pivot, r1, r2, r3, s1, s2, s3 };
}

/**
 * 关键点位综合分析
 */
export interface KeyLevelsAnalysis {
  currentPrice: number;
  fibonacci: FibonacciLevels | null;
  priceZones: PriceZone[];
  vwap: number | null;
  pivotPoints: PivotPoints | null;
  nearestKeyLevels: {
    support: number | null;
    resistance: number | null;
  };
  recommendations: string[];
}

export function analyzeKeyLevels(
  data: PriceData[],
  lookbackPeriod: number = 60
): KeyLevelsAnalysis {
  if (data.length === 0) {
    return {
      currentPrice: 0,
      fibonacci: null,
      priceZones: [],
      vwap: null,
      pivotPoints: null,
      nearestKeyLevels: { support: null, resistance: null },
      recommendations: [],
    };
  }

  const currentPrice = data[data.length - 1].close;
  const fibonacci = calculateFibonacciRetracement(data, lookbackPeriod);
  const priceZones = identifyKeyPriceZones(data, lookbackPeriod);
  const vwap = calculateVWAPFromPriceData(data.slice(-20)); // 20日VWAP
  const pivotPoints =
    data.length >= 2 ? calculatePivotPoints(data[data.length - 2]) : null;

  const recommendations: string[] = [];

  // 找到最近的关键支撑位和压力位
  let nearestSupport: number | null = null;
  let nearestResistance: number | null = null;

  // 从价格区间中提取
  const supportZones = priceZones.filter(
    (z) => z.type === 'support' && z.upper < currentPrice
  );
  const resistanceZones = priceZones.filter(
    (z) => z.type === 'resistance' && z.lower > currentPrice
  );

  if (supportZones.length > 0) {
    nearestSupport = Math.max(...supportZones.map((z) => z.upper));
    const zone = supportZones.find((z) => z.upper === nearestSupport);
    if (zone) {
      recommendations.push(
        `下方支撑位: ${nearestSupport.toFixed(2)} (强度: ${(zone.strength * 100).toFixed(0)}%)`
      );
    }
  }

  if (resistanceZones.length > 0) {
    nearestResistance = Math.min(...resistanceZones.map((z) => z.lower));
    const zone = resistanceZones.find((z) => z.lower === nearestResistance);
    if (zone) {
      recommendations.push(
        `上方压力位: ${nearestResistance.toFixed(2)} (强度: ${(zone.strength * 100).toFixed(0)}%)`
      );
    }
  }

  // 斐波那契分析
  if (fibonacci) {
    const nearestFibLevel = fibonacci.levels.reduce((nearest, level) => {
      const currentDist = Math.abs(level.price - currentPrice);
      const nearestDist = Math.abs(nearest.price - currentPrice);
      return currentDist < nearestDist ? level : nearest;
    });

    const distPercent =
      ((nearestFibLevel.price - currentPrice) / currentPrice) * 100;

    if (Math.abs(distPercent) < 2) {
      recommendations.push(
        `接近斐波那契${nearestFibLevel.label}位 (${nearestFibLevel.price.toFixed(2)})`
      );
    }
  }

  // VWAP分析
  if (vwap) {
    const vwapDiff = ((currentPrice - vwap) / vwap) * 100;
    if (Math.abs(vwapDiff) < 1) {
      recommendations.push('价格在VWAP附近，市场均衡');
    } else if (vwapDiff > 3) {
      recommendations.push('价格明显高于VWAP，可能存在回调压力');
    } else if (vwapDiff < -3) {
      recommendations.push('价格明显低于VWAP，可能存在反弹机会');
    }
  }

  // 枢轴点分析
  if (pivotPoints) {
    if (currentPrice > pivotPoints.pivot) {
      recommendations.push(
        `价格位于枢轴点上方，关注压力位 R1: ${pivotPoints.r1.toFixed(2)}`
      );
    } else {
      recommendations.push(
        `价格位于枢轴点下方，关注支撑位 S1: ${pivotPoints.s1.toFixed(2)}`
      );
    }
  }

  return {
    currentPrice,
    fibonacci,
    priceZones,
    vwap,
    pivotPoints,
    nearestKeyLevels: {
      support: nearestSupport,
      resistance: nearestResistance,
    },
    recommendations,
  };
}
