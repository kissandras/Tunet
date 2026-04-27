import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Activity } from 'lucide-react';
import { getHistory, getStatistics } from '../../services/haClient';
import MultiSparkLine from '../charts/MultiSparkLine';
import { useConfig, useHomeAssistantMeta } from '../../contexts';
import {
  convertValueByKind,
  formatUnitValue,
  getDisplayUnitForKind,
  getEffectiveUnitMode,
  inferUnitKind,
  downsampleTimeSeries,
} from '../../utils';

const SERIES_COLORS = [
  'var(--accent-color)',
  'var(--status-info-fg)',
  'var(--status-warning-fg)',
  'var(--status-error-fg)',
];

const CompareCard = memo(function CompareCard({
  cardId: _cardId,
  entityIds = [],
  entities = {},
  conn,
  settings,
  dragProps,
  cardStyle,
  Icon,
  name,
  editMode,
  controls,
  onOpen,
  onOpenEntity,
  isMobile = false,
  t,
}) {
  const { unitsMode } = useConfig();
  const { haConfig } = useHomeAssistantMeta();
  const effectiveUnitMode = getEffectiveUnitMode(unitsMode, haConfig);
  const isSmall = settings?.size === 'small';

  const resolvedEntities = useMemo(
    () =>
      entityIds
        .map((id) => {
          const entity = entities[id];
          if (!entity) return null;
          const unit = entity.attributes?.unit_of_measurement || '';
          const deviceClass = entity.attributes?.device_class;
          const kind = inferUnitKind(deviceClass, unit);
          const state = parseFloat(entity.state);
          const converted =
            !isNaN(state) && kind
              ? convertValueByKind(state, { kind, fromUnit: unit, unitMode: effectiveUnitMode })
              : state;
          const displayUnit =
            kind ? getDisplayUnitForKind(kind, effectiveUnitMode) : unit;
          return {
            id,
            entity,
            name: entity.attributes?.friendly_name || id,
            numericState: isNaN(state) ? null : converted,
            displayUnit,
          };
        })
        .filter(Boolean),
    [entityIds, entities, effectiveUnitMode]
  );

  const [historySeries, setHistorySeries] = useState([]);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    if (cardRef.current) observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!conn || !isVisible || isSmall || resolvedEntities.length === 0) {
      if (!isSmall) setHistorySeries([]);
      return;
    }

    const fetchAll = async () => {
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

      const results = await Promise.all(
        resolvedEntities.map(async (re, idx) => {
          try {
            let data = await getHistory(conn, {
              entityId: re.id,
              start,
              end,
              minimal_response: true,
            });

            let processed = (data && Array.isArray(data) ? data : [])
              .map((d) => {
                const rawState = d.state !== undefined ? d.state : d.s;
                const val = parseFloat(rawState);
                if (isNaN(val)) return null;
                let time;
                if (d.last_changed) {
                  const t = new Date(d.last_changed);
                  if (isNaN(t.getTime())) return null;
                  time = t;
                } else if (typeof d.lc === 'number') {
                  time = new Date(d.lc * 1000);
                } else {
                  return null;
                }
                return { value: val, time };
              })
              .filter(Boolean);

            if (processed.length === 0) {
              const stats = await getStatistics(conn, {
                statisticId: re.id,
                start,
                end,
                period: 'hour',
              });
              processed = (stats && Array.isArray(stats) ? stats : [])
                .map((d) => ({
                  value:
                    typeof d.mean === 'number'
                      ? d.mean
                      : typeof d.state === 'number'
                        ? d.state
                        : d.sum,
                  time: new Date(d.start),
                }))
                .filter((d) => !isNaN(parseFloat(d.value)));
            }

            if (processed.length === 1) {
              const only = processed[0];
              processed = [
                { value: only.value, time: new Date(only.time.getTime() - 60 * 60 * 1000) },
                only,
              ];
            }

            if (processed.length > 2) {
              processed = downsampleTimeSeries(processed);
            }

            return {
              data: processed,
              color: SERIES_COLORS[idx % SERIES_COLORS.length],
              label: re.name,
            };
          } catch (e) {
            console.error(`Failed to fetch history for ${re.id}`, e);
            return { data: [], color: SERIES_COLORS[idx % SERIES_COLORS.length], label: re.name };
          }
        })
      );

      setHistorySeries(results.filter((r) => r.data.length > 0));
    };

    let idleId;
    let timerId;
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(() => fetchAll(), { timeout: 4000 });
    } else {
      timerId = setTimeout(() => fetchAll(), Math.random() * 500);
    }
    return () => {
      if (idleId) window.cancelIdleCallback(idleId);
      if (timerId) clearTimeout(timerId);
    };
  }, [conn, isVisible, isSmall, resolvedEntities]);

  if (resolvedEntities.length === 0) return null;

  const cardName = name || settings?.name || t('compare.title');

  if (isSmall) {
    return (
      <div
        ref={cardRef}
        {...dragProps}
        data-haptic={editMode ? undefined : 'card'}
        onClick={(e) => {
          if (!editMode) onOpen?.(e);
        }}
        className={`touch-feedback group relative flex h-full items-center overflow-hidden rounded-3xl border font-sans transition-all duration-500 ${isMobile ? 'gap-2.5 p-3 pl-4' : 'gap-3 p-4 pl-5'} ${!editMode ? 'cursor-pointer' : 'cursor-move'}`}
        style={{ ...cardStyle, containerType: 'inline-size' }}
      >
        {controls}
        <div className={`relative flex min-w-0 flex-1 items-center ${isMobile ? 'gap-2.5' : 'gap-3'}`}>
          <div
            className={`flex flex-shrink-0 items-center justify-center ${isMobile ? 'h-9 w-9' : 'h-10 w-10'} rounded-xl bg-[var(--glass-bg)] text-[var(--text-secondary)] transition-all duration-300 group-hover:scale-110`}
          >
            {Icon ? (
              <Icon className={`${isMobile ? 'h-4.5 w-4.5' : 'h-5 w-5'} stroke-[1.5px]`} />
            ) : (
              <Activity className={isMobile ? 'h-4.5 w-4.5' : 'h-5 w-5'} />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <p
              className={`${isMobile ? 'mb-1 text-[10px]' : 'mb-1.5 text-xs'} block max-w-full truncate leading-none font-bold tracking-wide text-[var(--text-secondary)] uppercase opacity-60`}
              title={cardName}
            >
              {cardName}
            </p>
            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
              {resolvedEntities.map((re, idx) => (
                <span key={re.id} className="flex items-baseline gap-0.5">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }}
                  />
                  <span className={`${isMobile ? 'text-[11px]' : 'text-xs'} font-bold text-[var(--text-primary)]`}>
                    {re.numericState !== null
                      ? formatUnitValue(re.numericState, { fallback: '--' })
                      : '--'}
                  </span>
                  {re.displayUnit && (
                    <span className="text-[9px] font-medium text-[var(--text-secondary)] uppercase">
                      {re.displayUnit}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      {...dragProps}
      data-haptic={editMode ? undefined : 'card'}
      onClick={(e) => {
        if (!editMode) onOpen?.(e);
      }}
      className={`touch-feedback group relative flex h-full flex-col overflow-hidden rounded-3xl border font-sans transition-all duration-500 ${isMobile ? 'p-5' : 'p-7'} justify-start ${!editMode ? 'cursor-pointer' : 'cursor-move'}`}
      style={cardStyle}
    >
      {controls}

      <div className="pointer-events-none absolute -right-4 -bottom-4 text-[var(--glass-border)] opacity-[0.03]">
        {Icon && <Icon size={140} />}
      </div>

      {/* Chart as background layer pinned to bottom */}
      {historySeries.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-28">
          <MultiSparkLine series={historySeries} height={112} fade />
        </div>
      )}

      <div className="relative z-10 flex shrink-0 items-start justify-between">
        <div className="flex min-w-0 flex-col items-start">
          <div
            className={`flex items-center justify-center ${isMobile ? 'h-10 w-10 rounded-xl' : 'h-11 w-11 rounded-2xl'} bg-[var(--glass-bg)] text-[var(--text-secondary)] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3`}
          >
            {Icon ? (
              <Icon className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} stroke-[1.5px]`} />
            ) : (
              <Activity className={isMobile ? 'h-4 w-4' : 'h-5 w-5'} />
            )}
          </div>
          <p
            className={`${isMobile ? 'mt-1.5 text-[10px]' : 'mt-2 text-xs'} line-clamp-2 w-full font-bold tracking-wide text-[var(--text-secondary)] uppercase opacity-60`}
            title={cardName}
          >
            {cardName}
          </p>
        </div>

        {/* Entity values — upper right, each clickable */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          {resolvedEntities.map((re, idx) => (
            <div
              key={re.id}
              className="flex cursor-pointer items-baseline gap-1.5 rounded-lg px-1.5 py-0.5 transition-colors hover:bg-[var(--glass-bg)]"
              onClick={(e) => {
                e.stopPropagation();
                if (!editMode && onOpenEntity) onOpenEntity(re.id);
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }}
              />
              <span className="max-w-[5rem] truncate text-[9px] font-bold tracking-wide text-[var(--text-secondary)] uppercase opacity-70">
                {re.name}
              </span>
              <span className={`${isMobile ? 'text-base' : 'text-lg'} leading-none font-thin whitespace-nowrap text-[var(--text-primary)] tabular-nums`}>
                {re.numericState !== null
                  ? formatUnitValue(re.numericState, { fallback: '--' })
                  : re.entity?.state || '--'}
              </span>
              {re.displayUnit && (
                <span className="text-[9px] font-medium tracking-wider text-[var(--text-secondary)] uppercase">
                  {re.displayUnit}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default CompareCard;
