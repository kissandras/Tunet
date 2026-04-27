import { useMemo } from 'react';

const SERIES_COLORS = [
  'var(--accent-color)',
  'var(--status-info-fg)',
  'var(--status-warning-fg)',
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

export default function MultiSparkLine({ series = [], height = 96, fade = false }) {
  const idSuffix = useMemo(() => Math.random().toString(36).substr(2, 9), []);
  const maskId = `multiMask-${idSuffix}`;

  const validSeries = series.filter((s) => Array.isArray(s.data) && s.data.length > 0);

  const processed = useMemo(() => {
    if (validSeries.length === 0) return null;

    const width = 300;
    const lineStrokeWidth = 2.5;
    const pointRadius = 3;
    const verticalPadding = Math.max(4, Math.ceil(pointRadius + lineStrokeWidth / 2));
    const chartTop = verticalPadding;
    const chartBottom = height - verticalPadding;
    const chartHeight = Math.max(1, chartBottom - chartTop);

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
    const snapStep = rawRange <= 2 ? 0.5 : rawRange <= 5 ? 1 : rawRange <= 20 ? 2 : 5;
    globalMin = Math.floor(globalMin / snapStep) * snapStep;
    globalMax = Math.ceil(globalMax / snapStep) * snapStep;
    const range = globalMax - globalMin || 1;

    const paths = smoothed.map((s, si) => {
      const color = s.color || SERIES_COLORS[si % SERIES_COLORS.length];
      const values = s.values;
      const points = values.map((v, i) => [
        values.length === 1 ? width / 2 : (i / (values.length - 1)) * width,
        chartBottom - ((v - globalMin) / range) * chartHeight,
      ]);
      const pathData = createBezierPath(points, 0.3);
      const areaData = `${pathData} L ${width},${chartBottom} L 0,${chartBottom} Z`;
      const lastPoint = points[points.length - 1];
      return { color, pathData, areaData, lastPoint, label: s.label };
    });

    return { width, chartBottom, lineStrokeWidth, pointRadius, paths };
  }, [validSeries, height]);

  if (!processed || processed.paths.length === 0) return null;

  const { width, lineStrokeWidth, pointRadius, paths } = processed;

  return (
    <div className="relative mt-1 opacity-80 transition-all duration-700 group-hover:opacity-100">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={maskId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="70%" stopColor="white" stopOpacity="0.5" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          <mask id={`${maskId}-use`}>
            <rect x="0" y="0" width={width} height={height} fill={`url(#${maskId})`} />
          </mask>
        </defs>

        {paths.map((s, i) => (
          <g key={i}>
            <path
              d={s.areaData}
              fill={s.color}
              fillOpacity="0.08"
              mask={`url(#${maskId}-use)`}
            />
            <path
              d={s.pathData}
              fill="none"
              stroke={s.color}
              strokeWidth={lineStrokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity="0.85"
            />
            <circle
              cx={s.lastPoint[0]}
              cy={s.lastPoint[1]}
              r={pointRadius}
              fill={s.color}
              className="animate-pulse"
            />
          </g>
        ))}
      </svg>
      {fade && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--glass-bg)] opacity-60" />
      )}
    </div>
  );
}
