importScripts('risk-engine.js');

const tabStates = new Map();
const signalQueues = new Map();
const threshold = 75;
const riskEngine = globalThis.CryptoGuardRisk;

function blankState() {
  return riskEngine.blankState();
}

async function getTabState(tabId) {
  let state = tabStates.get(tabId);
  if (!state) {
    const key = `tab-${tabId}`;
    const stored = await chrome.storage.session.get(key);
    state = stored[key];
  }
  if (!state || !Array.isArray(state.events) || !Array.isArray(state.history)) {
    state = blankState();
  }
  riskEngine.refreshState(state);
  tabStates.set(tabId, state);
  return state;
}

async function saveTabState(tabId, state) {
  tabStates.set(tabId, state);
  await chrome.storage.session.set({ [`tab-${tabId}`]: state });
}

async function isAllowed(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const { allowlist = [] } = await chrome.storage.local.get('allowlist');
    return allowlist.some((site) => host === site || host.endsWith(`.${site}`));
  } catch {
    return false;
  }
}

function paintBadge(tabId, score) {
  const color = score >= threshold ? '#c62828' : score >= 35 ? '#ef8f00' : '#26834a';
  const text = score >= threshold ? '!' : score >= 35 ? String(score) : '';
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeText({ tabId, text });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get-state') {
    const tabId = Number(message.tabId);
    chrome.tabs.get(tabId).then(async (tab) => {
      const state = await getTabState(tabId);
      const allowed = await isAllowed(tab.url);
      if (allowed) state.score = 0;
      await saveTabState(tabId, state);
      paintBadge(tabId, allowed ? 0 : state.score);
      sendResponse({
        ...state,
        score: allowed ? 0 : state.score,
        allowed,
        hostname: new URL(tab.url).hostname,
        windowMs: riskEngine.WINDOW_MS
      });
    }).catch(() => sendResponse({ ...blankState(), allowed: false, hostname: '' }));
    return true;
  }

  if (message.type === 'allowlist') {
    const site = String(message.hostname || '').toLowerCase();
    chrome.storage.local.get('allowlist').then(({ allowlist = [] }) =>
      chrome.storage.local.set({ allowlist: [...new Set([...allowlist, site])] })
    ).then(async () => {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (!Number.isInteger(tab.id) || !tab.url) continue;
        if (await isAllowed(tab.url)) {
          const state = await getTabState(tab.id);
          state.score = 0;
          await saveTabState(tab.id, state);
          paintBadge(tab.id, 0);
        }
      }
      sendResponse({ ok: true });
    }).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type !== 'signal' || !Number.isInteger(sender.tab?.id)) return;
  if (!['wasm', 'worker', 'longtask'].includes(message.signal)) return;
  const tabId = sender.tab.id;
  const previous = signalQueues.get(tabId) || Promise.resolve();
  const task = previous.then(async () => {
    const state = await getTabState(tabId);
    riskEngine.recordSignal(state, message.signal, message.detail || {});
    const allowed = await isAllowed(sender.tab.url);
    if (allowed) state.score = 0;
    paintBadge(tabId, state.score);
    await saveTabState(tabId, state);
    if (state.score >= threshold && !state.notified) {
      state.notified = true;
      chrome.notifications.create(`cryptoguard-${tabId}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'CryptoGuard detected mining-like activity',
        message: `This tab has a risk score of ${state.score}/100.`
      }).catch((error) => console.error('CryptoGuard could not show a notification:', error));
    }
  });
  const queued = task.catch((error) => console.error('CryptoGuard could not update tab risk:', error));
  signalQueues.set(tabId, queued);
  queued.then(() => sendResponse({ ok: true }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
  signalQueues.delete(tabId);
  chrome.storage.session.remove(`tab-${tabId}`);
});

async function resetTabOnNavigation(tabId) {
  const state = await getTabState(tabId);
  riskEngine.resetForNavigation(state);
  await saveTabState(tabId, state);
  paintBadge(tabId, 0);
}

function queueNavigationReset(details) {
  if (details.frameId !== 0 || !Number.isInteger(details.tabId)) return;
  const previous = signalQueues.get(details.tabId) || Promise.resolve();
  const queued = previous.then(() => resetTabOnNavigation(details.tabId));
  const handled = queued.catch((error) => console.error('CryptoGuard could not reset navigation evidence:', error));
  signalQueues.set(details.tabId, handled);
}

chrome.webNavigation.onCommitted.addListener(queueNavigationReset);
chrome.webNavigation.onHistoryStateUpdated.addListener(queueNavigationReset);

async function refreshExpiredTabStates() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!Number.isInteger(tab.id)) continue;
    const state = await getTabState(tab.id);
    const allowed = await isAllowed(tab.url);
    if (allowed) state.score = 0;
    await saveTabState(tab.id, state);
    paintBadge(tab.id, allowed ? 0 : state.score);
  }
}

function scheduleRiskExpiry() {
  chrome.alarms.create('risk-window-expiry', { periodInMinutes: 0.5 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'risk-window-expiry') {
    refreshExpiredTabStates().catch((error) => console.error('CryptoGuard could not refresh expiring evidence:', error));
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const cached = tabStates.get(tabId);
  if (cached) paintBadge(tabId, cached.score);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
  scheduleRiskExpiry();
});

chrome.runtime.onStartup.addListener(scheduleRiskExpiry);
scheduleRiskExpiry();