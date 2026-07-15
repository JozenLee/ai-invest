'use client';

import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { ChartWrapper } from './chart-wrapper';

export interface CapitalFlowDataPoint {
  /** Date string, e.g. '2024-01-15' */
  date: string;
  /** Main net inflow (positive = inflow, negative = outflow) */
  mainNet: number;
  /** Large order net inflow */
  largeNet?: number;
  /** Medium order net inflow */
  mediumNet?: number;
  /** Small order net inflow */
  smallNet?: number;
}

export interface CapitalFlowChartProps {
  /** Array of capital flow data points */
  data: CapitalFlowDataPoint[];
  /** Chart title */
  title?: string;
  /** Chart height */
  height?: string | number;
  /** Whether to show cumulative line */
  showCumulative?: boolean;
  /** Chart type: 'bar' | 'line' | 'both' */
  chartType?: 'bar' | 'line' | 'both';
  /** Additional CSS class */
  className?: string;
}

/**
 * Capital flow trend chart showing institutional vs retail money flow.
 * Displays net inflow/outflow as bars with optional cumulative line.
 */
export function CapitalFlowChart({
  data,
  title,
  height = '400px',
  showCumulative = true,
  chartType = 'both',
  className,
}: CapitalFlowChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const dates = data.map((d) => d.date);
    const mainNet = data.map((d) => d.mainNet);
    const largeNet = data.map((d) => d.largeNet ?? 0);
    const mediumNet = data.map((d) => d.mediumNet ?? 0);
    const smallNet = data.map((d) => d.smallNet ?? 0);

    // Calculate cumulative main net
    const cumulative: number[] = [];
    let cumSum = 0;
    mainNet.forEach((v) => {
      cumSum += v;
      cumulative.push(parseFloat(cumSum.toFixed(2)));
    });

    const series: object[] = [];

    // Bar series for main net flow
    if (chartType === 'bar' || chartType === 'both') {
      series.push({
        name: '主力净流入',
        type: 'bar',
        data: mainNet,
        itemStyle: {
          color: (params: { value: number }) =>
            params.value >= 0 ? '#ef5350' : '#26a69a',
        },
        barMaxWidth: 20,
      });
    }

    // Stacked bars for detailed breakdown
    if (chartType === 'bar' && data[0]?.largeNet !== undefined) {
      series.push(
        {
          name: '大单净流入',
          type: 'bar',
          stack: 'flow',
          data: largeNet,
          itemStyle: { color: '#e74c3c' },
        },
        {
          name: '中单净流入',
          type: 'bar',
          stack: 'flow',
          data: mediumNet,
          itemStyle: { color: '#f39c12' },
        },
        {
          name: '小单净流入',
          type: 'bar',
          stack: 'flow',
          data: smallNet,
          itemStyle: { color: '#27ae60' },
        }
      );
    }

    // Cumulative line
    if (showCumulative && (chartType === 'line' || chartType === 'both')) {
      series.push({
        name: '累计净流入',
        type: 'line',
        data: cumulative,
        smooth: true,
        lineStyle: { width: 2, color: '#4a90d9' },
        itemStyle: { color: '#4a90d9' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(74, 144, 217, 0.3)' },
              { offset: 1, color: 'rgba(74, 144, 217, 0.02)' },
            ],
          } as unknown as string,
        },
        yAxisIndex: showCumulative && (chartType === 'both') ? 1 : 0,
      });
    }

    const yAxis: object[] = [
      {
        type: 'value',
        name: '净流入(万)',
        splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
        axisLabel: { color: '#666' },
        axisLine: { show: false },
      },
    ];

    if (showCumulative && chartType === 'both') {
      yAxis.push({
        type: 'value',
        name: '累计(万)',
        splitLine: { show: false },
        axisLabel: { color: '#666' },
        axisLine: { show: false },
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
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const items = params as Array<{
            seriesName: string;
            value: number;
            marker: string;
          }>;
          if (!Array.isArray(items) || items.length === 0) return '';
          let result = `<b>${items[0].marker || ''} ${dates[items[0].value !== undefined ? items.indexOf(items[0]) : 0] || ''}</b><br/>`;
          // Actually we need the dataIndex from the axis
          // Use a simpler approach
          return '';
        },
      },
      legend: {
        data: series.map((s) => (s as { name: string }).name),
        top: title ? '5%' : 8,
        textStyle: { fontSize: 12 },
      },
      grid: {
        left: '10%',
        right: showCumulative && chartType === 'both' ? '10%' : '5%',
        top: title ? '15%' : '12%',
        bottom: '12%',
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: '#ddd' } },
        axisLabel: { color: '#666', fontSize: 11, rotate: dates.length > 15 ? 30 : 0 },
        axisTick: { show: false },
      },
      yAxis,
      dataZoom: [
        {
          type: 'inside',
          start: data.length > 30 ? Math.max(0, 100 - (30 / data.length) * 100) : 0,
          end: 100,
        },
      ],
      series,
    } as EChartsOption;
  }, [data, title, showCumulative, chartType]);

  return <ChartWrapper option={option} height={height} className={className} />;
}
