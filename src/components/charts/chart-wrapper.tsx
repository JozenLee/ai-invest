'use client';

import dynamic from 'next/dynamic';
import { type EChartsOption } from 'echarts';
import type { CSSProperties } from 'react';

// Dynamic import to avoid SSR issues
const ReactECharts = dynamic(
  () => import('echarts-for-react'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full min-h-[300px]">
        <div className="text-muted-foreground text-sm">图表加载中...</div>
      </div>
    ),
  }
);

export interface ChartWrapperProps {
  /** ECharts option object */
  option: EChartsOption;
  /** Chart width, defaults to '100%' */
  width?: string | number;
  /** Chart height, defaults to '400px' */
  height?: string | number;
  /** Additional CSS class */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
  /** Whether the chart should auto-resize on container change */
  autoResize?: boolean;
  /** Theme name for ECharts */
  theme?: string;
  /** Callback when chart is ready */
  onChartReady?: (instance: unknown) => void;
  /** Merge option instead of replacing on update */
  notMerge?: boolean;
  /** Lazy update - only update when option changes */
  lazyUpdate?: boolean;
}

/**
 * Generic ECharts wrapper component with dynamic import to avoid SSR issues.
 * All chart components should build their EChartsOption and pass it to this wrapper.
 */
export function ChartWrapper({
  option,
  width = '100%',
  height = '400px',
  className = '',
  style,
  autoResize = true,
  theme,
  onChartReady,
  notMerge = true,
  lazyUpdate = false,
}: ChartWrapperProps) {
  return (
    <div className={className} style={{ width, height, ...style }}>
      <ReactECharts
        option={option}
        style={{ width: '100%', height: '100%' }}
        opts={{ renderer: 'canvas' }}
        autoResize={autoResize}
        theme={theme}
        onChartReady={onChartReady as () => void}
        notMerge={notMerge}
        lazyUpdate={lazyUpdate}
      />
    </div>
  );
}
