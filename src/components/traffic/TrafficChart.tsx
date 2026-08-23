import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart2,
  Zap,
} from 'lucide-react';
import { useTrafficStore } from '../../stores/trafficStore';
import { SecondBucket } from '../../types/traffic';
import {
  formatThroughput,
  formatMessageRate,
} from '../../lib/trafficFormatters';

interface TrafficChartProps {
  className?: string;
}

interface Point {
  x: number;
  inY: number;
  outY: number;
  inVal: number;
  outVal: number;
  bucket: SecondBucket;
  relativeSec: number;
}

const VIEW_HEIGHT = 260;
const LEFT_MARGIN = 70;
const RIGHT_MARGIN = 20;
const TOP_MARGIN = 20;
const BOTTOM_MARGIN = 32;

const CHART_HEIGHT = VIEW_HEIGHT - TOP_MARGIN - BOTTOM_MARGIN;
const BASE_Y = TOP_MARGIN + CHART_HEIGHT;

function computeBezierPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  let path = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return path;
}

function computeAreaPath(points: { x: number; y: number }[], baseY: number): string {
  if (points.length === 0) return '';
  const linePath = computeBezierPath(points);
  const firstX = points[0].x.toFixed(1);
  const lastX = points[points.length - 1].x.toFixed(1);
  return `${linePath} L ${lastX},${baseY} L ${firstX},${baseY} Z`;
}

export const TrafficChart: React.FC<TrafficChartProps> = ({ className = '' }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(800);

  const timeline = useTrafficStore((s) => s.timeline);
  const selectedMetric = useTrafficStore((s) => s.selectedMetric);
  const setSelectedMetric = useTrafficStore((s) => s.setSelectedMetric);

  const currentInboundBps = useTrafficStore((s) => s.currentInboundBps);
  const currentOutboundBps = useTrafficStore((s) => s.currentOutboundBps);
  const currentInboundMps = useTrafficStore((s) => s.currentInboundMps);
  const currentOutboundMps = useTrafficStore((s) => s.currentOutboundMps);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Responsive container width tracking via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        setContainerWidth(rect.width);
      }
    };

    updateWidth();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            setContainerWidth(entry.contentRect.width);
          }
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, []);

  const chartWidth = Math.max(100, containerWidth - LEFT_MARGIN - RIGHT_MARGIN);

  // Normalize rolling 60s timeline
  const fullTimeline = useMemo<SecondBucket[]>(() => {
    const windowSize = 60;
    const raw = timeline.slice(-windowSize);
    const now = Date.now();

    if (raw.length >= windowSize) {
      return raw;
    }

    // Pad leading empty buckets so timeline is always 60 seconds
    const needed = windowSize - raw.length;
    const padded: SecondBucket[] = [];
    for (let i = 0; i < needed; i++) {
      padded.push({
        timestamp: now - (windowSize - i) * 1000,
        inboundBytes: 0,
        outboundBytes: 0,
        inboundMsgs: 0,
        outboundMsgs: 0,
      });
    }
    return [...padded, ...raw];
  }, [timeline]);

  // Compute maximum scale value
  const { maxVal, inVals, outVals } = useMemo(() => {
    const isThroughput = selectedMetric === 'throughput';
    const floor = isThroughput ? 1024 : 10; // Floor: 1 KB/s or 10 msgs/s

    const ins = fullTimeline.map((b) => (isThroughput ? b.inboundBytes : b.inboundMsgs));
    const outs = fullTimeline.map((b) => (isThroughput ? b.outboundBytes : b.outboundMsgs));

    const highest = Math.max(...ins, ...outs, floor);
    // Add 15% headroom for aesthetic spacing
    const headroom = highest * 1.15;

    return { maxVal: headroom, inVals: ins, outVals: outs };
  }, [fullTimeline, selectedMetric]);

  // Generate mapped SVG points
  const points = useMemo<Point[]>(() => {
    const count = fullTimeline.length;
    return fullTimeline.map((bucket, i) => {
      const x = LEFT_MARGIN + (i / (count - 1)) * chartWidth;
      const inVal = inVals[i];
      const outVal = outVals[i];

      const inY = BASE_Y - (inVal / maxVal) * CHART_HEIGHT;
      const outY = BASE_Y - (outVal / maxVal) * CHART_HEIGHT;
      const relativeSec = count - 1 - i;

      return {
        x,
        inY: Math.max(TOP_MARGIN, Math.min(BASE_Y, inY)),
        outY: Math.max(TOP_MARGIN, Math.min(BASE_Y, outY)),
        inVal,
        outVal,
        bucket,
        relativeSec,
      };
    });
  }, [fullTimeline, inVals, outVals, maxVal, chartWidth]);

  // Paths
  const inPoints = useMemo(() => points.map((p) => ({ x: p.x, y: p.inY })), [points]);
  const outPoints = useMemo(() => points.map((p) => ({ x: p.x, y: p.outY })), [points]);

  const inLinePath = useMemo(() => computeBezierPath(inPoints), [inPoints]);
  const inAreaPath = useMemo(() => computeAreaPath(inPoints, BASE_Y), [inPoints]);

  const outLinePath = useMemo(() => computeBezierPath(outPoints), [outPoints]);
  const outAreaPath = useMemo(() => computeAreaPath(outPoints, BASE_Y), [outPoints]);

  // Gridlines & Y-Axis Ticks
  const yTicks = useMemo(() => {
    const ticksCount = 4;
    const ticks: { val: number; y: number; label: string }[] = [];

    for (let i = 0; i <= ticksCount; i++) {
      const fraction = i / ticksCount;
      const val = maxVal * fraction;
      const y = BASE_Y - fraction * CHART_HEIGHT;
      const label =
        selectedMetric === 'throughput'
          ? formatThroughput(val)
          : formatMessageRate(val);
      ticks.push({ val, y, label });
    }
    return ticks;
  }, [maxVal, selectedMetric]);

  // X-Axis Time Ticks (Responsive spacing based on containerWidth)
  const xTicks = useMemo(() => {
    if (containerWidth < 450) {
      return [
        { sec: 60, label: '-60s', x: LEFT_MARGIN },
        { sec: 30, label: '-30s', x: LEFT_MARGIN + chartWidth * 0.5 },
        { sec: 0, label: 'Now', x: LEFT_MARGIN + chartWidth },
      ];
    }
    if (containerWidth < 700) {
      return [
        { sec: 60, label: '-60s', x: LEFT_MARGIN },
        { sec: 40, label: '-40s', x: LEFT_MARGIN + chartWidth * 0.33 },
        { sec: 20, label: '-20s', x: LEFT_MARGIN + chartWidth * 0.67 },
        { sec: 0, label: 'Now', x: LEFT_MARGIN + chartWidth },
      ];
    }
    return [
      { sec: 60, label: '-60s', x: LEFT_MARGIN },
      { sec: 45, label: '-45s', x: LEFT_MARGIN + chartWidth * 0.25 },
      { sec: 30, label: '-30s', x: LEFT_MARGIN + chartWidth * 0.5 },
      { sec: 15, label: '-15s', x: LEFT_MARGIN + chartWidth * 0.75 },
      { sec: 0, label: 'Now', x: LEFT_MARGIN + chartWidth },
    ];
  }, [containerWidth, chartWidth]);

  // Mouse hover event handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || points.length === 0) return;

      const rect = svgRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const scaleX = containerWidth / (rect.width || 1);
      const svgX = clientX * scaleX;

      // Find nearest point
      let closestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(points[i].x - svgX);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = i;
        }
      }

      setHoverIndex(closestIdx);
    },
    [points, containerWidth]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-card border border-border rounded-lg p-3.5 shadow-xs w-full overflow-hidden ${className}`}
    >
      {/* Chart Header: Title, Metric Toggle, and Live Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-md bg-muted text-muted-foreground shrink-0">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Network Telemetry (Rolling 60s)
            </h3>
            <span className="text-[11px] text-muted-foreground">
              Sliding real-time throughput & message rate
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2.5">
          {/* Legend */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-xs" />
              <span className="text-muted-foreground text-[11px]">Inbound:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {selectedMetric === 'throughput'
                  ? formatThroughput(currentInboundBps)
                  : formatMessageRate(currentInboundMps)}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-sky-500 shadow-xs" />
              <span className="text-muted-foreground text-[11px]">Outbound:</span>
              <span className="font-semibold text-sky-600 dark:text-sky-400">
                {selectedMetric === 'throughput'
                  ? formatThroughput(currentOutboundBps)
                  : formatMessageRate(currentOutboundMps)}
              </span>
            </div>
          </div>

          {/* Metric Toggle Segmented Control */}
          <div className="inline-flex rounded-md bg-muted p-0.5 border border-border shrink-0">
            <button
              type="button"
              onClick={() => setSelectedMetric('throughput')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                selectedMetric === 'throughput'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Throughput</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedMetric('messages')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                selectedMetric === 'messages'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BarChart2 className="w-3 h-3" />
              <span>Messages</span>
            </button>
          </div>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative w-full overflow-hidden select-none">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${containerWidth} ${VIEW_HEIGHT}`}
          width="100%"
          height={VIEW_HEIGHT}
          className="w-full h-[260px] overflow-visible cursor-crosshair block"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Emerald Gradient for Inbound */}
            <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="95%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>

            {/* Sky Gradient for Outbound */}
            <linearGradient id="skyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25" />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis Labels */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={LEFT_MARGIN}
                y1={tick.y}
                x2={LEFT_MARGIN + chartWidth}
                y2={tick.y}
                stroke="currentColor"
                className="text-border/60"
                strokeDasharray={i === 0 ? undefined : '3 3'}
                strokeWidth="1"
              />
              <text
                x={LEFT_MARGIN - 8}
                y={tick.y + 3.5}
                textAnchor="end"
                className="fill-muted-foreground text-[10px] font-mono select-none"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Inbound Area & Stroke */}
          <path d={inAreaPath} fill="url(#emeraldGradient)" />
          <path
            d={inLinePath}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Outbound Area & Stroke */}
          <path d={outAreaPath} fill="url(#skyGradient)" />
          <path
            d={outLinePath}
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* X-Axis Time Ticks */}
          {xTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={tick.x}
                y1={BASE_Y}
                x2={tick.x}
                y2={BASE_Y + 5}
                stroke="currentColor"
                className="text-border"
                strokeWidth="1"
              />
              <text
                x={tick.x}
                y={BASE_Y + 18}
                textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                className="fill-muted-foreground text-[10px] font-mono select-none"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Interactive Hover Crosshair */}
          {activePoint && (
            <g className="pointer-events-none">
              {/* Vertical Crosshair Line */}
              <line
                x1={activePoint.x}
                y1={TOP_MARGIN}
                x2={activePoint.x}
                y2={BASE_Y}
                stroke="currentColor"
                className="text-muted-foreground/70"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />

              {/* Inbound Marker Dot */}
              <circle
                cx={activePoint.x}
                cy={activePoint.inY}
                r="4.5"
                className="fill-emerald-500 stroke-card"
                strokeWidth="2"
              />

              {/* Outbound Marker Dot */}
              <circle
                cx={activePoint.x}
                cy={activePoint.outY}
                r="4.5"
                className="fill-sky-500 stroke-card"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Hover Tooltip Overlay */}
        {activePoint && (
          <div
            className="absolute top-2 pointer-events-none z-10 bg-popover/95 backdrop-blur-xs text-popover-foreground border border-border shadow-md rounded-md p-2 text-xs font-mono transition-all duration-75"
            style={{
              left: `${Math.min(
                Math.max((activePoint.x / (containerWidth || 1)) * 100, 15),
                85
              )}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className="flex items-center justify-between gap-4 text-[10px] text-muted-foreground border-b border-border/50 pb-1 mb-1">
              <span>
                {activePoint.relativeSec === 0
                  ? 'Now (Live)'
                  : `-${activePoint.relativeSec}s ago`}
              </span>
              <span>
                {new Date(activePoint.bucket.timestamp).toLocaleTimeString()}
              </span>
            </div>

            <div className="space-y-0.5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <ArrowDownLeft className="w-3 h-3" />
                  <span>Inbound:</span>
                </div>
                <span className="font-semibold text-foreground">
                  {selectedMetric === 'throughput'
                    ? formatThroughput(activePoint.inVal)
                    : formatMessageRate(activePoint.inVal)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400">
                  <ArrowUpRight className="w-3 h-3" />
                  <span>Outbound:</span>
                </div>
                <span className="font-semibold text-foreground">
                  {selectedMetric === 'throughput'
                    ? formatThroughput(activePoint.outVal)
                    : formatMessageRate(activePoint.outVal)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrafficChart;
