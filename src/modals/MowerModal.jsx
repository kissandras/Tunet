import { useMemo } from 'react';
import { X, Sprout, Battery, MapPin, Play, Pause, Home, AlertTriangle } from '../icons';
import AccessibleModalShell from '../components/ui/AccessibleModalShell';

const ACTIVE_STATES = ['mowing', 'cleaning'];
const ERROR_STATES = ['error', 'fault', 'problem', 'stuck'];

function getMowerStateLabel(state, battery, t) {
  const normalized = String(state || '').toLowerCase();
  if (!normalized) return t('mower.unknown');
  if (ACTIVE_STATES.includes(normalized)) return t('mower.mowing');
  if (['returning', 'going_home', 'return_to_base'].includes(normalized)) return t('mower.returning');
  if ((normalized === 'charging' || normalized === 'docked') && battery === 100) return t('mower.docked');
  if (normalized === 'docked') return t('mower.charging');
  if (normalized === 'idle' || normalized === 'ready') return t('mower.idle');
  if (normalized === 'paused' || normalized === 'pause') return t('mower.pause');
  if (ERROR_STATES.includes(normalized)) return t('mower.error');
  if (normalized === 'stopped') return t('mower.stopped');
  return state;
}

/**
 * MowerModal - Modal for lawn mower information and controls.
 */
export default function MowerModal({ show, onClose, entities, callService, getA, t, mowerId }) {
  const modalTitleId = `mower-modal-title-${(mowerId || 'mower').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const entity = mowerId ? entities?.[mowerId] : null;

  const battery = useMemo(() => {
    if (!mowerId) return null;
    const value = getA(mowerId, 'battery_level');
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }, [mowerId, getA]);

  if (!show) return null;
  if (!mowerId || !entity) return null;

  const state = entity?.state;
  const normalized = String(state || '').toLowerCase();
  const isActive = ACTIVE_STATES.includes(normalized);
  const isError = ERROR_STATES.includes(normalized);
  const isUnavailable = state === 'unavailable' || state === 'unknown' || !state;
  const zone = getA(mowerId, 'current_zone') || getA(mowerId, 'zone') || getA(mowerId, 'current_room');
  const friendlyName = entity?.attributes?.friendly_name || mowerId;
  const stateLabel = getMowerStateLabel(state, battery, t);

  const statusColor = isError
    ? 'var(--status-error-fg)'
    : isActive
      ? 'var(--status-success-fg)'
      : 'var(--text-secondary)';
  const statusBg = isError
    ? 'var(--status-error-bg)'
    : isActive
      ? 'var(--status-success-bg)'
      : 'var(--glass-bg)';

  const handlePrimary = () => {
    if (isUnavailable) return;
    callService('lawn_mower', isActive ? 'pause' : 'start_mowing', { entity_id: mowerId });
  };
  const handleDock = () => {
    if (isUnavailable) return;
    callService('lawn_mower', 'dock', { entity_id: mowerId });
  };

  const primaryLabel = isActive ? t('mower.pause') : t('mower.start');

  return (
    <AccessibleModalShell
      open={show}
      onClose={onClose}
      titleId={modalTitleId}
      overlayClassName="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
      overlayStyle={{ backdropFilter: 'blur(20px)', backgroundColor: 'rgba(0,0,0,0.3)' }}
      panelClassName="popup-anim relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border p-6 font-sans backdrop-blur-xl md:rounded-[3rem] md:p-10"
      panelStyle={{
        background: 'linear-gradient(135deg, var(--card-bg) 0%, var(--modal-bg) 100%)',
        borderColor: 'var(--glass-border)',
        color: 'var(--text-primary)',
      }}
    >
      {() => (
        <>
          <button
            onClick={onClose}
            className="modal-close absolute top-6 right-6 md:top-8 md:right-8"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div className="mb-6 flex items-center gap-4">
            <div
              className="rounded-2xl p-4 transition-all duration-500"
              style={{ backgroundColor: statusBg, color: statusColor }}
            >
              <Sprout className={`h-8 w-8${isActive ? ' animate-pulse' : ''}`} />
            </div>
            <div className="min-w-0">
              <h3
                id={modalTitleId}
                className="truncate text-2xl leading-none font-light tracking-tight uppercase italic"
                style={{ color: 'var(--text-primary)' }}
              >
                {friendlyName}
              </h3>
              <div
                className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-all duration-500"
                style={{ backgroundColor: statusBg, color: statusColor }}
              >
                {isError && <AlertTriangle className="h-3 w-3" />}
                <p className="text-[10px] font-bold tracking-widest uppercase italic">
                  {t('status.statusLabel')}: {stateLabel}
                </p>
              </div>
            </div>
          </div>

          {/* Controls + status */}
          <div className="popup-surface flex flex-col gap-6 rounded-3xl p-6 md:p-8">
            <div className="flex w-full gap-3">
              <button
                onClick={handlePrimary}
                disabled={isUnavailable}
                aria-label={primaryLabel}
                className="flex flex-1 items-center justify-center gap-3 rounded-2xl py-4 text-sm font-bold tracking-widest uppercase transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                style={
                  isActive
                    ? { backgroundColor: 'var(--glass-bg)', color: 'var(--text-primary)' }
                    : { backgroundColor: 'var(--accent-color)', color: '#fff' }
                }
              >
                {isActive ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                {primaryLabel}
              </button>
              <button
                onClick={handleDock}
                disabled={isUnavailable}
                aria-label={t('mower.dock')}
                className="flex flex-1 items-center justify-center gap-3 rounded-2xl bg-[var(--glass-bg)] py-4 text-sm font-bold tracking-widest text-[var(--text-primary)] uppercase transition-all hover:bg-[var(--glass-bg-hover)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Home className="h-5 w-5" />
                {t('mower.dock')}
              </button>
            </div>

            <div className={`grid gap-4 ${zone ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div
                className="flex flex-col items-center gap-2 rounded-2xl bg-[var(--glass-bg)] p-4"
              >
                <Battery
                  className={`h-6 w-6 ${battery != null && battery < 20 ? 'text-[var(--status-error-fg)]' : 'text-[var(--status-success-fg)]'}`}
                />
                <span className="text-xl font-light text-[var(--text-primary)]">
                  {battery != null ? `${Math.round(battery)}%` : '--'}
                </span>
                <span className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                  {t('mower.battery')}
                </span>
              </div>
              {zone && (
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-[var(--glass-bg)] p-4">
                  <MapPin className="h-6 w-6 text-[var(--accent-color)]" />
                  <span className="max-w-full truncate px-2 text-xl font-light text-[var(--text-primary)]" title={zone}>
                    {zone}
                  </span>
                  <span className="text-[10px] font-bold tracking-widest text-[var(--text-muted)] uppercase">
                    {t('mower.zone')}
                  </span>
                </div>
              )}
            </div>

            <p className="text-center font-mono text-[10px] break-all text-[var(--text-muted)]">
              {mowerId}
            </p>
          </div>
        </>
      )}
    </AccessibleModalShell>
  );
}
