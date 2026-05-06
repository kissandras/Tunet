import { useMemo } from 'react';
import { CHART_STATUS_COLORS } from '../../utils/chartColors';

const SERIES_COLORS = [
  'var(--status-info-fg)',
  'var(--status-warning-fg)',
  'var(--accent-color)',
  'var(--status-error-fg)',
];

const createBezierPath = (points, smoothing = 0.3) => {
  const line = (p1, p2) => {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    return { length: Math.sqrt(dx * dx + dy * dy), angle: Math.atan2(dy, dx) };
  };
  const controlPoint = (current, previous, next, reverse) => {
    const p = previous || current;
    const n = next || current;
    const l = line(p, n);
    const angle = l.angle + (reverse ? Math.PI : 0);
    const length = l.length * smoothing;
    return [current[0] + Math.cos(angle) * length, current[1] + Math.sin(angle) * length];
  };
  return points.reduce((acc, point, i, a) => {
    if (i === 0) return `M ${point[0]},${point[1]}`;
    const [cpsX, cpsY] = controlPoint(a[i - 1], a[i - 2], point, false);
    const [cpeX, cpeY] = controlPoint(point, a[i - 1], a[i + 1], true);
    return `${acc} C ${cpsX.toFixed(2)},${cpsY.toFixed(2)} ${cpeX.toFixed(2)},${cpeY.toFixed(2)} ${point[0].toFixed(2)},${point[1].toFixed(2)}`;
  }, '');
};

export default function MultiSparkLine({
  series = [],
  height = 200,
  fade = false,
  formatXLabel,
  compact = false,
}) {
  const idSuffix = useMemo(() => Math.random().toString(36).substr(2, 9), []);
  const fadeGradientId = `multiFade-${idSuffix}`;
  const maskId = `multiMask-${idSuffix}`;

  const validSeries = series.filter((s) => Array.isArray(s.data) && s.data.length > 0);

  const processed = useMemo(() => {
    if (validSeries.length === 0) return null;

    const width = 600;
    const padding = compact
      ? { top: 4, right: 4, bottom: 4, left: 4 }
      : { top: 20, right: 20, bottom: 30, left: 40 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = Math.max(1, height - padding.top - padding.bottom);

    // Smooth each series and find global min/max
    let globalMin = Infinity;
    let globalMax = -Infinity;

    const smoothed = validSeries.map((s) => {
      const rawValues = s.data.map((d) => d.value);
      const windowSize = Math.max(1, Math.round(rawValues.length / 30));
      const values = rawValues.map((_, i) => {
        const start = Math.max(0, i - Math.floor(windowSize / 2));
        const end = Math.min(rawValues.length, i + Math.ceil(windowSize / 2));
        let sum = 0;
        for (let j = start; j < end; j++) sum += rawValues[j];
        return sum / (end - start);
      });
      const min = Math.min(...values);
      const max = Math.max(...values);
      if (min < globalMin) globalMin = min;
      if (max > globalMax) globalMax = max;
      return { ...s, values };
    });

    if (globalMin === globalMax) {
      globalMin -= 1;
      globalMax += 1;
    }
    const rawRange = globalMax - globalMin;
    const minRange = Math.max(2, Math.abs(globalMax + globalMin) / 2 * 0.1);
    if (rawRange < minRange) {
      const mid = (globalMax + globalMin) / 2;
      globalMin = mid - minRange / 2;
      globalMax = mid + minRange / 2;
    }
    // Snap min/max to nice round numbers (match SensorHistoryGraph behaviour)
    const snapStep = (() => {
      const r = globalMax - globalMin;
      if (r <= 2) return 0.5;
      if (r <= 5) return 1;
      if (r <= 20) return 2;
      if (r <= 50) return 5;
      if (r <= 200) return 10;
      return 50;
    })();
    globalMin = Math.floor(globalMin / snapStep) * snapStep;
    globalMax = Math.ceil(globalMax / snapStep) * snapStep;
    const range = globalMax - globalMin || 1;

    const paths = smoothed.map((s, si) => {
      const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
      const values = s.values;
      const points = values.map((v, i) => [
        padding.left +
          (values.length === 1 ? graphWidth / 2 : (i / (values.length - 1)) * graphWidth),
        padding.top + graphHeight - ((v - globalMin) / range) * graphHeight,
      ]);
      const pathData = createBezierPath(points, 0.3);
      const areaData = `${pathData} L ${padding.left + graphWidth},${height} L ${padding.left},${height} Z`;
      const lastValue = values[values.length - 1];
      const lastNormalized = (lastValue - globalMin) / range;
      const areaId = `multiArea-${idSuffix}-${si}`;
      const lineId = `multiLine-${idSuffix}-${si}`;
      return {
        color,
        pathData,
        areaData,
        lastNormalized,
        label: s.label,
        areaId,
        lineId,
        sourceData: s.data,
      };
    });

    const yLabels = [
      { value: globalMax, y: padding.top },
      { value: (globalMax + globalMin) / 2, y: padding.top + graphHeight / 2 },
      { value: globalMin, y: padding.top + graphHeight },
    ];

    const longestSeries = smoothed.reduce(
      (best, s) => (s.data.length > best.length ? s.data : best),
      []
    );
    const xLabels = [];
    const numLabels = 5;
    for (let i = 0; i < numLabels; i++) {
      const fraction = i / (numLabels - 1);
      const index = Math.round(fraction * (longestSeries.length - 1));
      const point = longestSeries[index];
      if (point && point.time) {
        const x = padding.left + fraction * graphWidth;
        const dt = new Date(point.time);
        const label = formatXLabel
          ? formatXLabel(dt)
          : dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const anchor = i === 0 ? 'start' : i === numLabels - 1 ? 'end' : 'middle';
        xLabels.push({ x, label, anchor });
      }
    }

    return { width, height, padding, graphWidth, paths, yLabels, xLabels };
  }, [validSeries, height, idSuffix, formatXLabel, compact]);

  if (!processed || processed.paths.length === 0) return null;

  const { width, padding, graphWidth, paths, yLabels, xLabels } = processed;
  const isSingleSeries = paths.length === 1;

  return (
    <div className="relative h-full w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full overflow-visible"
        preserveAspectRatio="none"
        height={height}
        width="100%"
      >
        <defs>
          <linearGradient id={fadeGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="80%" stopColor="white" stopOpacity="0.6" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id={maskId}>
            <rect x="0" y="0" width={width} height={height} fill={`url(#${fadeGradientId})`} />
          </mask>
          {paths.map((s) => (
            <linearGradient key={s.areaId} id={s.areaId} x1="0" y1="0" x2="0" y2="1">
              {isSingleSeries ? (
                <>
                  <stop offset="0%" stopColor={CHART_STATUS_COLORS.high} stopOpacity="0.25" />
                  <stop offset="50%" stopColor={CHART_STATUS_COLORS.mid} stopOpacity="0.12" />
                  <stop offset="100%" stopColor={CHART_STATUS_COLORS.low} stopOpacity="0.02" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.22" />
                  <stop offset="50%" stopColor={s.color} stopOpacity="0.1" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
                </>
              )}
            </linearGradient>
          ))}
          {isSingleSeries &&
            paths.map((s) => (
              <linearGradient key={s.lineId} id={s.lineId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_STATUS_COLORS.high} />
                <stop offset="50%" stopColor={CHART_STATUS_COLORS.mid} />
                <stop offset="100%" stopColor={CHART_STATUS_COLORS.low} />
              </linearGradient>
            ))}
        </defs>

        {/* Subtle dashed grid lines */}
        {!compact &&
          yLabels.map((label, i) => (
            <line
              key={`grid-${i}`}
              x1={padding.left}
              y1={label.y}
              x2={padding.left + graphWidth}
              y2={label.y}
              stroke="currentColor"
              strokeOpacity="0.05"
              strokeDasharray="4 4"
            />
          ))}

        {/* Area fills */}
        {paths.map((s, i) => (
          <path
            key={`area-${i}`}
            d={s.areaData}
            fill={`url(#${s.areaId})`}
            mask={`url(#${maskId})`}
          />
        ))}

        {/* Lines */}
        {paths.map((s, i) => (
          <path
            key={`line-${i}`}
            d={s.pathData}
            fill="none"
            stroke={isSingleSeries ? `url(#${s.lineId})` : s.color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
        ))}

        {/* Y-axis labels */}
        {!compact &&
          yLabels.map((label, i) => (
            <text
              key={`y-${i}`}
              x={padding.left - 8}
              y={label.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-current font-mono text-[10px] tracking-tighter opacity-60"
              style={{ fill: 'var(--text-secondary)' }}
            >
              {label.value.toFixed(1)}
            </text>
          ))}

        {/* X-axis labels */}
        {!compact &&
          xLabels.map((l, i) => (
            <text
              key={`x-${i}`}
              x={l.x}
              y={height - 5}
              textAnchor={l.anchor}
              className="fill-current font-mono text-[10px] tracking-tighter opacity-60"
              style={{ fill: 'var(--text-secondary)' }}
            >
              {l.label}
            </text>
          ))}
      </svg>
      {fade && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--glass-bg)] opacity-60" />
      )}
    </div>
  );
}
