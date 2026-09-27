(() => {
  const marker = '__cryptoguardHooked';
  if (window[marker]) return;
  Object.defineProperty(window, marker, { value: true, configurable: false });

  const report = (type, detail = {}) => {
    window.postMessage({ source: 'cryptoguard-main', type, detail }, '*');
  };

  const wasm = WebAssembly;
  for (const method of ['instantiate', 'instantiateStreaming']) {
    const original = wasm[method];
    if (typeof original !== 'function') continue;
    wasm[method] = function (...args) {
      report('wasm', { method });
      return Reflect.apply(original, this, args);
    };
  }

  if (typeof window.Worker === 'function') {
    const OriginalWorker = window.Worker;
    window.Worker = new Proxy(OriginalWorker, {
      construct(target, args, newTarget) {
        report('worker', {
          url: String(args[0] ?? ''),
          hardwareConcurrency: Number(navigator.hardwareConcurrency) || 1
        });
        return Reflect.construct(target, args, newTarget);
      }
    });
  }
})();