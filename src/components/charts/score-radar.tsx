'use client';

import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import { ChartWrapper } from './chart-wrapper';

export interface ScoreDimension {
  /** Dimension name, e.g. '趋势动量' */
  name: string;
  /** Score value 0-100 */
  value: number;
  /** Maximum value for this dimension, defaults to 100 */
  max?: number;
}

export interface ScoreRadarProps {
  /** Array of 7 scoring dimensions */
  dimensions: ScoreDimension[];
  /** Chart title */
  title?: string;
  /** Chart height */
  height?: string | number;
  /** Radar shape: 'polygon' | 'circle' */
  shape?: 'polygon' | 'circle';
  /** Color scheme for the radar area */
  color?: string;
  /** Whether to show the score value labels */
  showLabels?: boolean;
  /** Additional CSS class */
  className?: string;
}

/** Default 7-dimension scoring model for ETF analysis */
export const DEFAULT_DIMENSIONS: string[] = [
  '趋势动量',
  '资金流向',
  '技术形态',
  '行业景气',
  '估值水平',
  '风险控制',
  '综合评分',
];

/**
 * 7-dimension scoring radar chart for ETF analysis.
 * Displays scores across multiple evaluation dimensions in a radar/spider format.
 */
export function ScoreRadar({
  dimensions,
  title,
  height = '400px',
  shape = 'polygon',
  color = '#4a90d9',
  showLabels = true,
  className,
}: ScoreRadarProps) {
  const option = useMemo<EChartsOption>(() => {
    const indicator = dimensions.map((d) => ({
      name: d.name,
      max: d.max ?? 100,
    }));

    const values = dimensions.map((d) => d.value);

    // Compute average score
    const avgScore = dimensions.reduce((sum, d) => sum + d.value, 0) / dimensions.length;

    return {
      title: title
        ? {
            text: title,
            left: 'center',
            top: 8,
            textStyle: { fontSize: 16, fontWeight: 'bold' },
            subtext: `综合评分: ${avgScore.toFixed(1)}`,
            subtextStyle: { fontSize: 13, color: '#666' },
          }
        : undefined,
      tooltip: {
        trigger: 'item',
        formatter: (params: unknown) => {
          const p = params as {
            value?: number[];
            name?: string;
            marker?: string;
          };
          if (!p.value) return '';
          let result = `<b>${p.name || ''}</b><br/>`;
          dimensions.forEach((dim, idx) => {
            result += `${dim.name}: ${p.value![idx]}<br/>`;
          });
          return result;
        },
      },
      radar: {
        indicator,
        shape,
        center: ['50%', title ? '58%' : '50%'],
        radius: '65%',
        axisName: {
          color: '#333',
          fontSize: 13,
          fontWeight: 'bold',
        },
        splitArea: {
          areaStyle: {
            color: [
              'rgba(74, 144, 217, 0.02)',
              'rgba(74, 144, 217, 0.05)',
              'rgba(74, 144, 217, 0.08)',
              'rgba(74, 144, 217, 0.11)',
              'rgba(74, 144, 217, 0.14)',
            ],
          },
        },
        axisLine: {
          lineStyle: { color: 'rgba(0,0,0,0.1)' },
        },
        splitLine: {
          lineStyle: { color: 'rgba(0,0,0,0.1)' },
        },
      },
      series: [
        {
          name: '评分',
          type: 'radar',
          data: [
            {
              value: values,
              name: title || '综合评分',
              areaStyle: {
                color: {
                  type: 'radial',
                  x: 0.5, y: 0.5, r: 0.5,
                  colorStops: [
                    { offset: 0, color: `${color}40` },
                    { offset: 1, color: `${color}10` },
                  ],
                } as unknown as string,
              },
              lineStyle: {
                color,
                width: 2,
              },
              itemStyle: {
                color,
                borderColor: color,
                borderWidth: 1,
              },
              label: showLabels
                ? {
                    show: true,
                    formatter: (params: { value: number }) => `${params.value}`,
                    color: '#333',
                    fontSize: 12,
                    fontWeight: 'bold',
                  }
                : { show: false },
              symbol: 'circle',
              symbolSize: 6,
            },
          ],
        },
      ],
    } as EChartsOption;
  }, [dimensions, title, shape, color, showLabels]);

  return <ChartWrapper option={option} height={height} className={className} />;
}
