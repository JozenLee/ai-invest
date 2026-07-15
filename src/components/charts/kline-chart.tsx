'use client';

import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { ChartWrapper } from './chart-wrapper';

export interface KlineDataPoint {
  /** Date string, e.g. '2024-01-15' */
  date: string;
  /** Opening price */
  open: number;
  /** Closing price */
  close: number;
  /** Lowest price */
  low: number;
  /** Highest price */
  high: number;
  /** Trading volume */
  volume?: number;
}

export interface KlineChartProps {
  /** Array of OHLCV data points */
  data: KlineDataPoint[];
  /** Chart title */
  title?: string;
  /** Chart height */
  height?: string | number;
  /** Whether to show volume sub-chart */
  showVolume?: boolean;
  /** Whether to show MA (moving average) lines */
  showMA?: boolean;
  /** MA periods to display */
  maPeriods?: number[];
  /** Additional CSS class */
  className?: string;
}

/**
 * Calculate simple moving average for a given period.
 */
function calculateMA(data: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j];
      }
      result.push(parseFloat((sum / period).toFixed(2)));
    }
  }
  return result;
}

/**
 * K-line (candlestick) chart component for displaying stock/index price data.
 * Supports volume sub-chart and moving average lines.
 */
export function KlineChart({
  data,
  title,
  height = '500px',
  showVolume = true,
  showMA = true,
  maPeriods = [5, 10, 20],
  className,
}: KlineChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const dates = data.map((d) => d.date);
    const ohlc = data.map((d) => [d.open, d.close, d.low, d.high]);
    const volumes = data.map((d) => d.volume ?? 0);
    const closePrices = data.map((d) => d.close);

    // Build MA series
    const maSeries: object[] = [];
    const maColors = ['#f5a623', '#4a90d9', '#e74c3c', '#2ecc71', '#9b59b6'];
    if (showMA) {
      maPeriods.forEach((period, idx) => {
        const maData = calculateMA(closePrices, period);
        maSeries.push({
          name: `MA${period}`,
          type: 'line',
          data: maData,
          smooth: true,
          lineStyle: { width: 1 },
          itemStyle: { color: maColors[idx % maColors.length] },
          xAxisIndex: 0,
          yAxisIndex: 0,
        });
      });
    }

    // Grid layout: main chart + volume chart
    const grids: object[] = [
      {
        left: '10%',
        right: '8%',
        top: title ? '12%' : '8%',
        height: showVolume ? '50%' : '75%',
      },
    ];
    const xAxes: object[] = [
      {
        type: 'category',
        data: dates,
        gridIndex: 0,
        axisLine: { lineStyle: { color: '#ddd' } },
        axisLabel: { color: '#666', fontSize: 11 },
        axisTick: { show: false },
        boundaryGap: true,
      },
    ];
    const yAxes: object[] = [
      {
        type: 'value',
        gridIndex: 0,
        scale: true,
        splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
        axisLabel: { color: '#666', fontSize: 11 },
        axisLine: { show: false },
      },
    ];

    if (showVolume) {
      grids.push({
        left: '10%',
        right: '8%',
        top: '72%',
        height: '16%',
      });
      xAxes.push({
        type: 'category',
        data: dates,
        gridIndex: 1,
        axisLabel: { show: false },
        axisLine: { lineStyle: { color: '#ddd' } },
        axisTick: { show: false },
        boundaryGap: true,
      });
      yAxes.push({
        type: 'value',
        gridIndex: 1,
        splitLine: { show: false },
        axisLabel: { show: false },
        axisLine: { show: false },
      });
    }

    // Build dataZoom
    const dataZoom: object[] = [
      {
        type: 'inside',
        xAxisIndex: showVolume ? [0, 1] : [0],
        start: data.length > 60 ? Math.max(0, 100 - (60 / data.length) * 100) : 0,
        end: 100,
      },
      {
        type: 'slider',
        xAxisIndex: showVolume ? [0, 1] : [0],
        top: '92%',
        height: 20,
        borderColor: '#ddd',
        fillerColor: 'rgba(74, 144, 217, 0.1)',
        handleStyle: { color: '#4a90d9' },
      },
    ];

    const series: object[] = [
      {
        name: 'K线',
        type: 'candlestick',
        data: ohlc,
        xAxisIndex: 0,
        yAxisIndex: 0,
        itemStyle: {
          color: '#ef5350',
          color0: '#26a69a',
          borderColor: '#ef5350',
          borderColor0: '#26a69a',
        },
      },
      ...maSeries,
    ];

    if (showVolume) {
      series.push({
        name: '成交量',
        type: 'bar',
        data: volumes,
        xAxisIndex: 1,
        yAxisIndex: 1,
        itemStyle: {
          color: (params: { dataIndex: number }) => {
            const d = data[params.dataIndex];
            return d && d.close >= d.open ? '#ef5350' : '#26a69a';
          },
        },
      });
    }

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
        axisPointer: { type: 'cross' },
        borderWidth: 1,
        borderColor: '#ccc',
      },
      legend: {
        data: showMA ? maPeriods.map((p) => `MA${p}`) : [],
        top: title ? '5%' : 0,
        right: '10%',
        textStyle: { fontSize: 12 },
      },
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      dataZoom,
      series,
    } as EChartsOption;
  }, [data, title, showVolume, showMA, maPeriods]);

  return <ChartWrapper option={option} height={height} className={className} />;
}
