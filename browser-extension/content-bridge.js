(() => {
  const key = 'cryptoguard-main';
  let contextInvalidated = false;
  let longTaskObserver;

  function sendSignal(message) {
    if (contextInvalidated) return;
    try {
      if (!chrome.runtime?.id) {
        contextInvalidated = true;
        longTaskObserver?.disconnect();
        return;
      }
      const response = chrome.runtime.sendMessage(message);
      response?.catch(() => {});
    } catch {
      contextInvalidated = true;
      longTaskObserver?.disconnect();
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== key) return;
    if (!['wasm', 'worker'].includes(event.data.type)) return;
    sendSignal({
      type: 'signal',
      signal: event.data.type,
      detail: event.data.detail || {}
    });
  });

  if (typeof PerformanceObserver !== 'function') return;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        sendSignal({
          type: 'signal',
          signal: 'longtask',
          detail: { duration: Math.max(0, Number(entry.duration) || 0) }
        });
      }
    });
    longTaskObserver.observe({ type: 'longtask', buffered: true });
  } catch {
    // Long-task observation is optional on unsupported pages/browsers.
  }
})();