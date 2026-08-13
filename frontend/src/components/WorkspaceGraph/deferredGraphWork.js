const GRAPH_WORK_IDLE_TIMEOUT_MS = 250;

function getGlobalScheduler(name) {
  if (typeof globalThis === "undefined") return null;
  const scheduler = globalThis[name];
  return typeof scheduler === "function" ? scheduler.bind(globalThis) : null;
}

export function scheduleDeferredGraphWork(
  work,
  {
    timeout = GRAPH_WORK_IDLE_TIMEOUT_MS,
    requestAnimationFrameFn = getGlobalScheduler("requestAnimationFrame"),
    cancelAnimationFrameFn = getGlobalScheduler("cancelAnimationFrame"),
    requestIdleCallbackFn = getGlobalScheduler("requestIdleCallback"),
    cancelIdleCallbackFn = getGlobalScheduler("cancelIdleCallback"),
    setTimeoutFn = getGlobalScheduler("setTimeout") || setTimeout,
    clearTimeoutFn = getGlobalScheduler("clearTimeout") || clearTimeout,
  } = {}
) {
  let cancelled = false;
  let frameId = null;
  let idleId = null;
  let timeoutId = null;

  const runWork = () => {
    if (cancelled) return;
    work();
  };

  const scheduleIdle = () => {
    if (cancelled) return;
    if (typeof requestIdleCallbackFn === "function") {
      idleId = requestIdleCallbackFn(runWork, { timeout });
      return;
    }
    if (typeof requestAnimationFrameFn === "function") {
      frameId = requestAnimationFrameFn(runWork);
      return;
    }
    timeoutId = setTimeoutFn(runWork, 0);
  };

  if (typeof requestAnimationFrameFn === "function") {
    frameId = requestAnimationFrameFn(scheduleIdle);
  } else {
    timeoutId = setTimeoutFn(scheduleIdle, 0);
  }

  return () => {
    cancelled = true;
    if (frameId !== null && typeof cancelAnimationFrameFn === "function") {
      cancelAnimationFrameFn(frameId);
    }
    if (idleId !== null && typeof cancelIdleCallbackFn === "function") {
      cancelIdleCallbackFn(idleId);
    }
    if (timeoutId !== null && typeof clearTimeoutFn === "function") {
      clearTimeoutFn(timeoutId);
    }
  };
}

export function toGraphInput(data) {
  return {
    nodes: data?.nodes ?? [],
    links: (data?.links ?? []).map((link) => ({
      source: link.source,
      target: link.target,
      relation: link.relation || link.type,
      weight: link.weight,
    })),
  };
}

export function scheduleDeferredGraphTransform({
  data,
  transform,
  onComplete,
  onError,
  schedulerOptions,
}) {
  return scheduleDeferredGraphWork(() => {
    try {
      const graph = transform(toGraphInput(data));
      onComplete?.({
        graph,
        stats: data?.stats ?? null,
        nodeIds: (data?.nodes ?? []).map((node) => node.id),
      });
    } catch (error) {
      onError?.(error);
    }
  }, schedulerOptions);
}
