const scoreElement = document.querySelector('#score');
const messageElement = document.querySelector('#message');
let activeTab;
let currentHostname = '';
let currentState = null;

function render(state) {
  currentState = state;
  const signals = state.signals || {};
  const score = Number(state.score) || 0;
  scoreElement.textContent = String(score);
  document.querySelector('#host').textContent = state.hostname || 'Current tab';
  document.querySelector('#wasm-count').textContent = String(signals.wasmCount || 0);
  document.querySelector('#worker-count').textContent = String(signals.workerCount || 0);
  document.querySelector('#task-count').textContent = String(signals.longTaskCount || 0);
  document.querySelector('#task-time').textContent = `${Math.round(signals.longTaskMs || 0)} ms`;
  document.querySelector('#window-label').textContent = `last ${Math.round((state.windowMs || 60_000) / 1000)} seconds`;
  document.querySelector('#verdict').textContent = score >= 75 ? 'High mining risk' : score >= 35 ? 'Suspicious activity' : 'No mining indicators';
  document.querySelector('#status').textContent = state.allowed ? 'ALLOWLISTED' : 'SCANNING';
  document.querySelector('#allow-note').hidden = !state.allowed;
  document.querySelector('#allow').disabled = state.allowed || !currentHostname;
  const whyToggle = document.querySelector('#why-toggle');
  const whyPanel = document.querySelector('#why-panel');
  const whyList = document.querySelector('#why-list');
  whyToggle.hidden = score <= 50;
  if (score <= 50) {
    whyToggle.setAttribute('aria-expanded', 'false');
    whyPanel.hidden = true;
  }
  whyList.replaceChildren(...(state.explanations || []).map((explanation) => {
    const item = document.createElement('li');
    item.textContent = explanation;
    return item;
  }));
  const historyList = document.querySelector('#history-list');
  historyList.replaceChildren(...(state.history || []).slice(-8).reverse().map((entry) => {
    const item = document.createElement('li');
    const time = document.createElement('time');
    time.dateTime = new Date(entry.at).toISOString();
    time.textContent = new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const text = document.createElement('span');
    const before = Number(entry.scoreBefore) || 0;
    const after = Number(entry.scoreAfter) || 0;
    const change = after - before;
    const scoreText = change === 0 ? `score ${after}` : `${change > 0 ? '+' : ''}${change} points, score ${after}`;
    text.textContent = `${entry.text} (${scoreText})`;
    item.append(time, text);
    return item;
  }));
  document.querySelector('#export-history').disabled = !(state.history || []).length;
  const ring = document.querySelector('#score-ring');
  ring.classList.toggle('medium', score >= 35 && score < 75);
  ring.classList.toggle('high', score >= 75);
}

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  activeTab = tab;
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
    render({ hostname: 'This page cannot be inspected', score: 0, signals: {} });
    document.querySelector('#allow').disabled = true;
    document.querySelector('#kill').disabled = !tab?.id;
    return;
  }
  currentHostname = new URL(tab.url).hostname;
  chrome.runtime.sendMessage({ type: 'get-state', tabId: tab.id }).then(render);
});

document.querySelector('#allow').addEventListener('click', async () => {
  const result = await chrome.runtime.sendMessage({ type: 'allowlist', hostname: currentHostname });
  messageElement.textContent = result?.ok ? `${currentHostname} added to scoring allowlist` : 'Could not update allowlist';
  if (result?.ok) render({ hostname: currentHostname, score: 0, allowed: true, signals: {} });
});

document.querySelector('#kill').addEventListener('click', async () => {
  if (!activeTab?.id) return;
  await chrome.tabs.remove(activeTab.id);
  window.close();
});

document.querySelector('#why-toggle').addEventListener('click', (event) => {
  const panel = document.querySelector('#why-panel');
  const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
  event.currentTarget.setAttribute('aria-expanded', String(!expanded));
  panel.hidden = expanded;
});

document.querySelector('#export-history').addEventListener('click', () => {
  if (!currentState) return;
  const evidence = {
    exportedAt: new Date().toISOString(),
    hostname: currentHostname,
    rollingWindowMs: currentState.windowMs || 60_000,
    score: currentState.score || 0,
    signals: currentState.signals || {},
    explanations: currentState.explanations || [],
    history: currentState.history || []
  };
  const file = new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cryptoguard-${currentHostname.replace(/[^a-z0-9.-]/gi, '_')}-evidence.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});