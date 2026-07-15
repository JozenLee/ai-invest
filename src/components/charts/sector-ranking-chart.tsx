'use client';

import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { ChartWrapper } from './chart-wrapper';

export interface SectorData {
  /** Sector name, e.g. '半导体' */
  name: string;
  /** Change percentage, e.g. 3.5 for +3.5% */
  changePercent: number;
  /** Optional: trading volume in 万 */
  volume?: number;
  /** Optional: net capital inflow in 万 */
  netInflow?: number;
}

export interface SectorRankingChartProps {
  /** Array of sector data */
  data: SectorData[];
  /** Chart title */
  title?: string;
  /** Chart height */
  height?: string | number;
  /** Number of top sectors to display, defaults to all */
  topN?: number;
  /** Sort direction: 'desc' for top gainers, 'asc' for top losers */
  sortDirection?: 'asc' | 'desc';
  /** Bar orientation */
  direction?: 'horizontal' | 'vertical';
  /** Additional CSS class */
  className?: string;
}

/**
 * Sector ranking chart displaying performance of different market sectors.
 * Supports horizontal and vertical bar layouts with color-coded changes.
 */
export function SectorRankingChart({
  data,
  title,
  height = '400px',
  topN,
  sortDirection = 'desc',
  direction = 'horizontal',
  className,
}: SectorRankingChartProps) {
  const option = useMemo<EChartsOption>(() => {
    // Sort and slice
    const sorted = [...data].sort((a, b) =>
      sortDirection === 'desc'
        ? b.changePercent - a.changePercent
        : a.changePercent - b.changePercent
    );
    const display = topN ? sorted.slice(0, topN) : sorted;

    // For horizontal bars, reverse so highest is at top
    const chartData =
      direction === 'horizontal' ? [...display].reverse() : display;

    const names = chartData.map((d) => d.name);
    const values = chartData.map((d) => d.changePercent);

    const isHorizontal = direction === 'horizontal';

    return {
      title: title
        ? {
            text: title,
            left: 'center',
            top: 8,
            textStyle: { fontSize: 16, fontWeight: 'bold' },
          }
        : undefined,
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const items = params as Array<{
            name: string;
            value: number;
            marker: string;
          }>;
          if (!Array.isArray(items) || items.length === 0) return '';
          const item = items[0];
          const sector = display.find((d) => d.name === item.name);
          let result = `<b>${item.name}</b><br/>`;
          result += `${item.marker} 涨跌幅: ${item.value > 0 ? '+' : ''}${item.value.toFixed(2)}%<br/>`;
          if (sector?.volume !== undefined) {
            result += `成交量: ${sector.volume.toLocaleString()} 万<br/>`;
          }
          if (sector?.netInflow !== undefined) {
            result += `净流入: ${sector.netInflow.toLocaleString()} 万`;
          }
          return result;
        },
      },
      grid: {
        left: isHorizontal ? '15%' : '10%',
        right: '8%',
        top: title ? '12%' : '8%',
        bottom: '8%',
      },
      xAxis: {
        type: isHorizontal ? 'value' : 'category',
        data: isHorizontal ? undefined : names,
        axisLine: { lineStyle: { color: '#ddd' } },
        axisLabel: {
          color: '#666',
          fontSize: 11,
          rotate: !isHorizontal && names.length > 8 ? 30 : 0,
        },
        axisTick: { show: false },
        splitLine: isHorizontal
          ? { lineStyle: { type: 'dashed', color: '#eee' } }
          : { show: false },
        axisPointer: { type: 'shadow' },
      },
      yAxis: {
        type: isHorizontal ? 'category' : 'value',
        data: isHorizontal ? names : undefined,
        axisLine: { show: !isHorizontal, lineStyle: { color: '#ddd' } },
        axisLabel: {
          color: '#333',
          fontSize: 12,
          fontWeight: 'bold',
        },
        axisTick: { show: false },
        splitLine: isHorizontal
          ? { show: false }
          : { lineStyle: { type: 'dashed', color: '#eee' } },
      },
      series: [
        {
          name: '涨跌幅',
          type: 'bar',
          data: values,
          barMaxWidth: 24,
          itemStyle: {
            color: (params: { value: number }) => {
              const v = params.value;
              if (v > 3) return '#c23531';
              if (v > 1) return '#ef5350';
              if (v > 0) return '#ff8a80';
              if (v === 0) return '#bdbdbd';
              if (v > -1) return '#80cbc4';
              if (v > -3) return '#26a69a';
              return '#2e7d32';
            },
            borderRadius: isHorizontal ? [0, 3, 3, 0] : [3, 3, 0, 0],
          },
          label: {
            show: true,
            position: isHorizontal ? 'right' : 'top',
            formatter: (params: { value: number }) => {
              const v = params.value;
              return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
            },
            fontSize: 11,
            color: '#333',
          },
        },
      ],
    } as EChartsOption;
  }, [data, title, topN, sortDirection, direction]);

  return <ChartWrapper option={option} height={height} className={className} />;
}
