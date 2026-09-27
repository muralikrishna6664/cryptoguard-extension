(() => {
  const WINDOW_MS = 60_000;
  const HISTORY_LIMIT = 30;
  const EVENT_LIMIT = 2_000;

  function blankSignals() {
    return { wasmCount: 0, workerCount: 0, longTaskCount: 0, longTaskMs: 0 };
  }

  function blankState(now = Date.now()) {
    return {
      score: 0,
      signals: blankSignals(),
      events: [],
      history: [],
      explanations: [],
      notified: false,
      updatedAt: now
    };
  }

  function calculateSignals(events) {
    const signals = blankSignals();
    for (const event of events) {
      if (event.signal === 'wasm') signals.wasmCount += 1;
      if (event.signal === 'worker') {
        signals.workerCount += 1;
        signals.hardwareConcurrency = Math.max(
          signals.hardwareConcurrency || 0,
          Number(event.detail.hardwareConcurrency) || 4
        );
      }
      if (event.signal === 'longtask') {
        signals.longTaskCount += 1;
        signals.longTaskMs += Math.max(0, Number(event.detail.duration) || 0);
      }
    }
    return signals;
  }

  function scoreSignals(signals) {
    const wasmScore = Math.min(24, signals.wasmCount * 12);
    const workers = signals.workerCount;
    const cores = Math.max(1, signals.hardwareConcurrency || 4);
    const workerScore = workers >= Math.max(2, Math.ceil(cores * 0.75))
      ? Math.min(38, 18 + workers * 2)
      : Math.min(14, workers * 4);
    const taskScore = signals.longTaskCount >= 5 && signals.longTaskMs >= 900
      ? Math.min(30, 12 + Math.floor(signals.longTaskMs / 500))
      : Math.min(12, Math.floor(signals.longTaskMs / 250));
    const combined = signals.wasmCount > 0 && workers >= 2 ? 12 : 0;
    return Math.min(100, wasmScore + workerScore + taskScore + combined);
  }

  function explainSignals(signals) {
    const explanations = [];
    const wasmCount = signals.wasmCount || 0;
    const workerCount = signals.workerCount || 0;
    const longTaskCount = signals.longTaskCount || 0;
    const longTaskMs = Math.round(signals.longTaskMs || 0);
    const cores = Math.max(1, signals.hardwareConcurrency || 4);
    const workerThreshold = Math.max(2, Math.ceil(cores * 0.75));
    const wasmScore = Math.min(24, wasmCount * 12);
    const workerScore = workerCount >= workerThreshold
      ? Math.min(38, 18 + workerCount * 2)
      : Math.min(14, workerCount * 4);
    const taskScore = longTaskCount >= 5 && longTaskMs >= 900
      ? Math.min(30, 12 + Math.floor(longTaskMs / 500))
      : Math.min(12, Math.floor(longTaskMs / 250));

    if (wasmCount > 0) {
      explanations.push(`WebAssembly was initialized ${wasmCount} time(s): +${wasmScore} points. Mining scripts can use it for fast hashing, though WASM alone is not proof of mining.`);
    }
    if (workerCount > 0) {
      explanations.push(`${workerCount} worker(s) were created: +${workerScore} points. ${workerThreshold}+ workers is the high fan-out threshold for this device (${cores} reported CPU cores).`);
    }
    if (longTaskCount > 0) {
      explanations.push(`${longTaskCount} long task(s) blocked the main thread for ${longTaskMs} ms: +${taskScore} points. Repeated blocking can indicate sustained computation.`);
    }
    if (wasmCount > 0 && workerCount >= 2) {
      explanations.push('WebAssembly together with at least two workers: +12 points for a common parallel-computation pattern.');
    }
    return explanations;
  }

  function appendHistory(state, entry) {
    state.history.push(entry);
    if (state.history.length > HISTORY_LIMIT) {
      state.history.splice(0, state.history.length - HISTORY_LIMIT);
    }
  }

  function refreshState(state, now = Date.now()) {
    const previousScore = Number(state.score) || 0;
    const previousLength = state.events.length;
    state.events = state.events.filter((event) => event.at > now - WINDOW_MS && event.at <= now);
    state.signals = calculateSignals(state.events);
    state.score = scoreSignals(state.signals);
    state.explanations = explainSignals(state.signals);
    state.updatedAt = now;

    const expiredCount = previousLength - state.events.length;
    if (expiredCount > 0 && previousScore !== state.score) {
      appendHistory(state, {
        at: now,
        kind: 'decay',
        scoreBefore: previousScore,
        scoreAfter: state.score,
        text: `Evidence expired from the 60-second window; score changed from ${previousScore} to ${state.score}.`
      });
    }
    return { expiredCount, scoreChanged: previousScore !== state.score };
  }

  function recordSignal(state, signal, detail = {}, now = Date.now()) {
    refreshState(state, now);
    const scoreBefore = state.score;
    const eventDetail = {};
    if (signal === 'worker') {
      eventDetail.hardwareConcurrency = Math.max(1, Number(detail.hardwareConcurrency) || 4);
    }
    if (signal === 'longtask') {
      eventDetail.duration = Math.max(0, Number(detail.duration) || 0);
    }
    state.events.push({ signal, detail: eventDetail, at: now });
    if (state.events.length > EVENT_LIMIT) state.events.shift();
    state.signals = calculateSignals(state.events);
    state.score = scoreSignals(state.signals);
    state.explanations = explainSignals(state.signals);
    state.updatedAt = now;

    const text = signal === 'wasm'
      ? 'WebAssembly initialized.'
      : signal === 'worker'
        ? `Web worker created (${state.signals.workerCount} in the current window).`
        : `Main-thread long task observed (${Math.round(eventDetail.duration)} ms).`;
    appendHistory(state, {
      at: now,
      kind: 'signal',
      signal,
      scoreBefore,
      scoreAfter: state.score,
      text
    });
    return state;
  }

  function resetForNavigation(state, now = Date.now()) {
    const previousScore = Number(state.score) || 0;
    state.score = 0;
    state.signals = blankSignals();
    state.events = [];
    state.explanations = [];
    state.notified = false;
    state.updatedAt = now;
    state.history = [{
      at: now,
      kind: 'navigation',
      scoreBefore: previousScore,
      scoreAfter: 0,
      text: 'Page navigation cleared the recent evidence window and reset the score.'
    }];
    return state;
  }

  globalThis.CryptoGuardRisk = {
    WINDOW_MS,
    HISTORY_LIMIT,
    blankState,
    scoreSignals,
    explainSignals,
    refreshState,
    recordSignal,
    resetForNavigation
  };
})();