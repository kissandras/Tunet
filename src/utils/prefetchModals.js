const LIKELY_MODAL_IMPORTERS = [
  () => import('../modals/ConfigModal'),
  () => import('../modals/EditCardModal'),
  () => import('../modals/AddCardContent'),
  () => import('../modals/LightModal'),
  () => import('../modals/GenericClimateModal'),
  () => import('../modals/MediaModal'),
  () => import('../modals/SensorModal'),
];

let prefetchScheduled = false;
let prefetchCompleted = false;
let idleHandle = null;

function requestIdleTask(callback) {
  if (typeof window === 'undefined') return null;

  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout: 1500 });
  }

  return window.setTimeout(
    () => callback({ didTimeout: true, timeRemaining: () => 0 }),
    900
  );
}

function cancelIdleTask(handle) {
  if (typeof window === 'undefined' || handle == null) return;

  if (typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(handle);
    return;
  }

  window.clearTimeout(handle);
}

function prefetchLikelyModalChunks() {
  return Promise.allSettled(LIKELY_MODAL_IMPORTERS.map((loadChunk) => loadChunk())).finally(() => {
    prefetchCompleted = true;
    prefetchScheduled = false;
  });
}

export function scheduleLikelyModalPrefetch() {
  if (typeof window === 'undefined' || prefetchCompleted || prefetchScheduled) {
    return () => {};
  }

  prefetchScheduled = true;
  let cancelled = false;

  idleHandle = requestIdleTask(() => {
    idleHandle = null;
    if (cancelled) {
      prefetchScheduled = false;
      return;
    }

    void prefetchLikelyModalChunks();
  });

  return () => {
    cancelled = true;
    cancelIdleTask(idleHandle);
    idleHandle = null;
    if (!prefetchCompleted) {
      prefetchScheduled = false;
    }
  };
}