import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, MapPin, Battery } from '../icons';
import { useConfig, useHomeAssistantMeta } from '../contexts';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';
import {
  getEffectiveUnitMode,
  inferUnitKind,
  getDisplayUnitForKind,
  convertValueByKind,
  formatUnitValue,
} from '../utils';
import { getHistory } from '../services/haClient';

export default function PersonModal({
  show,
  onClose,
  personId,
  entity,
  entities,
  customName,
  getEntityImageUrl,
  conn,
  t,
  settings,
}) {
  const { unitsMode } = useConfig();
  const { haConfig } = useHomeAssistantMeta();
  const effectiveUnitMode = getEffectiveUnitMode(unitsMode, haConfig);
  const name = customName || entity?.attributes?.friendly_name || personId;
  const picture = getEntityImageUrl ? getEntityImageUrl(entity?.attributes?.entity_picture) : null;
  const [pictureFailed, setPictureFailed] = useState(false);
  const modalTitleId = `person-modal-title-${(personId || 'person').replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  useEffect(() => {
    setPictureFailed(false);
  }, [picture]);

  // Settings overrides
  const manualTrackerId = settings?.deviceTracker;
  const manualBatteryId = settings?.batteryEntity;

  // Determine best entity for tracking
  let trackedEntityId = personId;
  let currentLat = entity?.attributes?.latitude;
  let currentLon = entity?.attributes?.longitude;

  // 1. Check for manual Device Tracker override
  if (manualTrackerId && entities?.[manualTrackerId]) {
    const tracker = entities[manualTrackerId];
    trackedEntityId = manualTrackerId; // Use this for history
    if (tracker.attributes.latitude && tracker.attributes.longitude) {
      currentLat = tracker.attributes.latitude;
      currentLon = tracker.attributes.longitude;
    }
  }
  // 2. Check for linked Source (e.g. device_tracker from person attributes)
  // This usually provides better GPS history than the person entity itself
  else if (entity?.attributes?.source && entities?.[entity.attributes.source]) {
    trackedEntityId = entity.attributes.source;
    const sourceEntity = entities[entity.attributes.source];
    // Prefer source location if person entity location is missing (rare) or identical
    if (!currentLat) {
      currentLat = sourceEntity.attributes.latitude;
      currentLon = sourceEntity.attributes.longitude;
    }
  }

  // 3. Fallback: Automatic Discovery (if no location yet)
  if ((!currentLat || !currentLon) && entities && trackedEntityId === personId) {
    // ... same fallback logic, but make sure we update trackedEntityId ...
    const personName = entity?.attributes?.friendly_name || '';
    const nameParts = personName.toLowerCase().split(' ');
    const candidate = Object.values(entities).find((e) => {
      if (!e.entity_id.startsWith('device_tracker.')) return false;
      if (!e.attributes.latitude) return false;
      const tName = (e.attributes.friendly_name || '').toLowerCase();
      const tId = e.entity_id.toLowerCase();
      return nameParts.some(
        (part) => part.length > 2 && (tName.includes(part) || tId.includes(part))
      );
    });
    if (candidate) {
      currentLat = candidate.attributes.latitude;
      currentLon = candidate.attributes.longitude;
      trackedEntityId = candidate.entity_id;
    }
  }

  // Resolve Battery
  const currentState = entity?.state;
  let batteryLevel = entity?.attributes?.battery_level;
  const phoneBatteryEntityId = settings?.phoneBatteryEntity || manualBatteryId || null;
  const watchBatteryEntityId = settings?.watchBatteryEntity || null;
  const personExtraSensorIds = Array.isArray(settings?.personExtraSensors)
    ? settings.personExtraSensors.filter((id) => typeof id === 'string')
    : [];

  const getBatteryInfo = (stateObj, fallbackLabel) => {
    if (!stateObj) return null;
    const attrLevel = parseFloat(stateObj?.attributes?.battery_level);
    const stateLevel = parseFloat(stateObj?.state);
    const level = Number.isFinite(attrLevel)
      ? attrLevel
      : Number.isFinite(stateLevel)
        ? stateLevel
        : null;
    if (!Number.isFinite(level)) return null;
    return {
      label: fallbackLabel,
      level,
      batteryState: stateObj?.attributes?.battery_state,
    };
  };

  const phoneBatteryInfo = phoneBatteryEntityId
    ? getBatteryInfo(
        entities?.[phoneBatteryEntityId],
        entities?.[phoneBatteryEntityId]?.attributes?.friendly_name || t('person.phoneBattery')
      )
    : null;

  const watchBatteryInfo = watchBatteryEntityId
    ? getBatteryInfo(
        entities?.[watchBatteryEntityId],
        entities?.[watchBatteryEntityId]?.attributes?.friendly_name || t('person.watchBattery')
      )
    : null;

  const personExtraSensors = personExtraSensorIds
    .map((sensorId) => {
      const sensor = entities?.[sensorId];
      if (!sensor) return null;
      const unit =
        typeof sensor?.attributes?.unit_of_measurement === 'string'
          ? sensor.attributes.unit_of_measurement
          : '';
      const state = sensor?.state;
      const numericState =
        state !== null && state !== undefined && !Number.isNaN(parseFloat(state))
          ? parseFloat(state)
          : null;
      const inferredKind = inferUnitKind(sensor?.attributes?.device_class, unit);
      const convertedNumeric =
        numericState !== null && inferredKind
          ? convertValueByKind(numericState, {
              kind: inferredKind,
              fromUnit: unit,
              unitMode: effectiveUnitMode,
            })
          : numericState;
      const displayUnit =
        numericState !== null && inferredKind
          ? getDisplayUnitForKind(inferredKind, effectiveUnitMode)
          : unit;
      const stateText =
        numericState !== null
          ? `${formatUnitValue(convertedNumeric, { fallback: '--' })}${displayUnit ? ` ${displayUnit}` : ''}`
          : String(state ?? '-');
      return {
        id: sensorId,
        label: sensor?.attributes?.friendly_name || sensorId,
        value: stateText,
      };
    })
    .filter(Boolean);

  const isLightTheme =
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light';
  const tileUrl = isLightTheme
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

  // 1. Manual Override
  if (manualBatteryId && entities?.[manualBatteryId]) {
    const batEntity = entities[manualBatteryId];
    const val = parseInt(batEntity.state);
    if (!isNaN(val)) {
      batteryLevel = val;
    } else if (batEntity.attributes.battery_level !== undefined) {
      batteryLevel = batEntity.attributes.battery_level;
    }
  }
  // 2. Automatic Discovery
  else if (batteryLevel === undefined && entities) {
    const source = entity?.attributes?.source;
    if (source && entities[source]?.attributes?.battery_level !== undefined) {
      batteryLevel = entities[source].attributes.battery_level;
    } else {
      const personName = entity?.attributes?.friendly_name || '';
      const nameParts = personName.toLowerCase().split(' ');
      const candidate = Object.values(entities).find((e) => {
        if (
          e.entity_id.startsWith('sensor.') &&
          e.attributes.device_class === 'battery' &&
          nameParts.some((part) => e.entity_id.includes(part))
        )
          return true;
        if (
          e.attributes.battery_level !== undefined &&
          nameParts.some((part) => e.entity_id.includes(part))
        )
          return true;
        return false;
      });
      if (candidate) {
        if (candidate.entity_id.startsWith('sensor.')) {
          const val = parseInt(candidate.state);
          if (!isNaN(val)) batteryLevel = val;
        } else {
          batteryLevel = candidate.attributes.battery_level;
        }
      }
    }
  }

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markerRef = useRef(null);
  const historyLayerRef = useRef(null);

  // History trail settings
  const showHistory = settings?.showHistory ?? false;
  const historyHours = Math.max(1, Math.min(48, Number(settings?.historyHours) || 8));
  const [historyPoints, setHistoryPoints] = useState([]);
  const [mapReady, setMapReady] = useState(false);

  // Fetch location history
  const fetchHistory = useCallback(async () => {
    if (!show || !showHistory || !conn || !trackedEntityId) return;
    try {
      const end = new Date();
      const start = new Date(end.getTime() - historyHours * 3600000);
      const history = await getHistory(conn, {
        start,
        end,
        entityId: trackedEntityId,
        no_attributes: false,
      });
      const points = history
        .filter((entry) => {
          const lat = parseFloat(entry.attributes?.latitude ?? entry.a?.latitude);
          const lon = parseFloat(entry.attributes?.longitude ?? entry.a?.longitude);
          return Number.isFinite(lat) && Number.isFinite(lon);
        })
        .map((entry) => ({
          lat: parseFloat(entry.attributes?.latitude ?? entry.a?.latitude),
          lon: parseFloat(entry.attributes?.longitude ?? entry.a?.longitude),
          time: new Date(entry.last_changed || entry.lu || entry.last_updated).getTime(),
        }));
      setHistoryPoints(points);
    } catch (err) {
      console.warn('Failed to fetch person location history:', err);
      setHistoryPoints([]);
    }
  }, [show, showHistory, conn, trackedEntityId, historyHours]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Draw history trail on map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !showHistory || historyPoints.length < 2) {
      if (historyLayerRef.current) {
        historyLayerRef.current.clearLayers();
      }
      return;
    }

    if (!historyLayerRef.current) {
      historyLayerRef.current = L.layerGroup().addTo(map);
    } else {
      historyLayerRef.current.clearLayers();
    }

    const minTime = historyPoints[0].time;
    const maxTime = historyPoints[historyPoints.length - 1].time;
    const timeRange = maxTime - minTime || 1;

    for (let i = 0; i < historyPoints.length - 1; i++) {
      const p1 = historyPoints[i];
      const p2 = historyPoints[i + 1];
      const progress = (p1.time - minTime) / timeRange;
      const opacity = 0.15 + progress * 0.7;
      L.polyline([[p1.lat, p1.lon], [p2.lat, p2.lon]], {
        color: '#3b82f6',
        weight: 3,
        opacity,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(historyLayerRef.current);
    }

    // Fit map to show the trail + current position
    const allLats = historyPoints.map((p) => p.lat);
    const allLons = historyPoints.map((p) => p.lon);
    if (currentLat && currentLon) {
      allLats.push(currentLat);
      allLons.push(currentLon);
    }
    const bounds = L.latLngBounds(
      [Math.min(...allLats), Math.min(...allLons)],
      [Math.max(...allLats), Math.max(...allLons)]
    );
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }, [historyPoints, showHistory, currentLat, currentLon, mapReady]);

  // Map Initialization & Updates
  useEffect(() => {
    if (!show || !currentLat || !currentLon) return;

    const timer = setTimeout(() => {
      if (!mapRef.current) return;

      // Init Map
      if (!mapInstanceRef.current) {
        const map = L.map(mapRef.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView([currentLat, currentLon], 14);

        tileLayerRef.current = L.tileLayer(tileUrl, {
          subdomains: 'abcd',
          maxZoom: 19,
        }).addTo(map);

        mapInstanceRef.current = map;
        setMapReady(true);
        // Invalidate size to ensure it fills container
        setTimeout(() => map.invalidateSize(), 100);
      } else {
        const hasDifferentLayer = tileLayerRef.current?._url !== tileUrl;
        if (hasDifferentLayer) {
          tileLayerRef.current?.remove();
          tileLayerRef.current = L.tileLayer(tileUrl, {
            subdomains: 'abcd',
            maxZoom: 19,
          }).addTo(mapInstanceRef.current);
        }
        mapInstanceRef.current.setView([currentLat, currentLon]);
      }

      const map = mapInstanceRef.current;

      // Current Position Marker
      if (markerRef.current) markerRef.current.remove();

      const icon = L.divIcon({
        className: 'custom-person-marker',
        html: `<div style="background-color: #3b82f6; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px rgba(59,130,246,0.6);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      markerRef.current = L.marker([currentLat, currentLon], { icon }).addTo(map);

      map.setView([currentLat, currentLon], 14);
    }, 200); // Slight delay for modal animation

    return () => clearTimeout(timer);
  }, [show, currentLat, currentLon, tileUrl]);

  useEffect(() => {
    if (!show && mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      tileLayerRef.current = null;
      historyLayerRef.current = null;
      setHistoryPoints([]);
      setMapReady(false);
    }
  }, [show]);

  const hasSensors = !!phoneBatteryInfo || !!watchBatteryInfo || personExtraSensors.length > 0;

  if (!show) return null;

  return (
    <AccessibleModalShell
      open={show}
      onClose={onClose}
      titleId={modalTitleId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      panelClassName="popup-anim custom-scrollbar relative max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded-3xl border p-6 font-sans shadow-2xl backdrop-blur-xl md:rounded-[3rem] md:p-12"
      panelStyle={{
        background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
        borderColor: 'var(--glass-border)',
        color: 'var(--text-primary)',
      }}
    >
      {() => (
        <>
          <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
            .dynamic-map { height: min(52vh, 460px); min-height: 260px; }
            @media (min-width: 640px) { .dynamic-map { min-height: 320px; } }
            @media (min-width: 1024px) { .dynamic-map { height: min(58vh, 520px); min-height: 420px; } }
            .leaflet-container { font-family: inherit; }
          `}</style>
        <div className="absolute top-6 right-6 z-20 flex gap-3 md:top-10 md:right-10">
          <button onClick={onClose} className="modal-close" aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Header Section */}
        <div className="mb-6 flex items-center gap-4 font-sans">
          <div className="group relative h-16 w-16 overflow-hidden rounded-full border border-[var(--glass-border)] shadow-lg">
            {picture && !pictureFailed ? (
              <img
                src={picture}
                alt={name}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                onError={() => setPictureFailed(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--glass-bg)] text-[var(--text-secondary)]">
                <span className="text-xl font-bold">{name?.charAt(0)}</span>
              </div>
            )}
          </div>
          <div>
            <h3
              id={modalTitleId}
              className="text-3xl leading-none font-light tracking-tight text-[var(--text-primary)] uppercase italic"
            >
              {name}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div
                className={`inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] px-3 py-1 transition-all duration-500 ${
                  currentState === 'home'
                    ? 'bg-[var(--status-success-bg)] text-[var(--status-success-fg)]'
                    : 'bg-[var(--glass-bg)] text-[var(--text-secondary)]'
                }`}
              >
                <MapPin className="h-3 w-3" />
                <span className="text-[10px] font-bold tracking-widest uppercase italic">
                  {currentState === 'home'
                    ? t('status.home')
                    : currentState === 'not_home'
                      ? t('status.notHome')
                      : currentState}
                </span>
              </div>
              {phoneBatteryInfo && (
                <div
                  className={`inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] px-3 py-1 ${
                    phoneBatteryInfo.level < 20
                      ? 'bg-[var(--status-error-bg)] text-[var(--status-error-fg)]'
                      : 'bg-[var(--glass-bg)] text-[var(--text-muted)]'
                  }`}
                >
                  <Battery className="h-3 w-3" />
                  <span className="text-[10px] font-bold tracking-widest uppercase">
                    {Math.round(phoneBatteryInfo.level)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid h-full grid-cols-1 items-start gap-6 font-sans lg:grid-cols-5">
          {/* Left Column - Map (Span 3) */}
          <div className={`${hasSensors ? 'lg:col-span-3' : 'lg:col-span-5'} h-full min-h-[300px]`}>
            {currentLat && currentLon ? (
              <div className="group relative z-0 h-[clamp(20rem,35vw,30rem)] w-full overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] shadow-inner">
                <div
                  ref={mapRef}
                  className="z-0 h-full w-full opacity-80 transition-opacity duration-500 group-hover:opacity-100"
                />
                <div className="pointer-events-none absolute top-4 left-4 z-[1000] flex items-center gap-2 rounded-xl bg-black/60 px-4 py-2 shadow-lg backdrop-blur-md">
                  <MapPin className="h-3 w-3 text-[var(--accent-color)]" />
                  <span className="text-xs font-bold tracking-widest text-white uppercase">
                    {t('map.lastSeenHere')}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex h-[clamp(20rem,35vw,30rem)] flex-col items-center justify-center rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/50 p-6 text-center">
                <MapPin className="mb-4 h-16 w-16 opacity-20" />
                <span className="text-xs font-bold tracking-widest uppercase opacity-50">
                  {t('map.locationUnknown')}
                </span>
              </div>
            )}
          </div>

          {/* Right Column - Stats (Span 2) */}
          <div className="space-y-4 lg:col-span-2">
            {/* Primary Battery Status */}
            {phoneBatteryInfo && (
              <div className="popup-surface flex flex-col items-center gap-2 rounded-2xl border border-[var(--glass-border)]/50 p-6 transition-all">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[var(--text-muted)] uppercase">
                    {phoneBatteryInfo.label}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-5xl font-light italic ${
                      phoneBatteryInfo.level < 20
                        ? 'text-[var(--status-error-fg)]'
                        : 'text-[var(--text-primary)]'
                    }`}
                  >
                    {Math.round(phoneBatteryInfo.level)}
                  </span>
                  <span className="text-xl font-medium text-[var(--text-muted)]">%</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-700/30">
                  <div
                    className={`h-full rounded-full ${
                      phoneBatteryInfo.level < 20
                        ? 'bg-[var(--status-error-fg)]'
                        : 'bg-[var(--status-success-fg)]'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, phoneBatteryInfo.level))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Secondary Stats Grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {watchBatteryInfo && (
                <div className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--glass-border)]/50 p-4">
                  <div className="mb-1 flex items-center gap-2 opacity-70">
                    <span className="text-[9px] font-bold tracking-[0.15em] text-[var(--text-muted)] uppercase">
                      {watchBatteryInfo.label}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-light text-[var(--text-primary)]">
                      {Math.round(watchBatteryInfo.level)}
                    </span>
                    <span className="text-xs font-bold text-[var(--text-muted)]">%</span>
                  </div>
                </div>
              )}

              {personExtraSensors.map((sensor) => (
                <div
                  key={sensor.id}
                  className="popup-surface flex flex-col items-center justify-center gap-1 rounded-2xl border border-[var(--glass-border)]/50 p-4 text-center"
                >
                  <span className="mb-1 w-full truncate text-[9px] font-bold tracking-[0.15em] text-[var(--text-muted)] uppercase">
                    {sensor.label}
                  </span>
                  <span className="text-xl font-light text-[var(--text-primary)]">
                    {sensor.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        </>
      )}
    </AccessibleModalShell>
  );
}
