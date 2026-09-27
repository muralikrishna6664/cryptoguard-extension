const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function eventHook() {
  return {
    listener: null,
    addListener(listener) {
      this.listener = listener;
    }
  };
}

function createServiceWorker() {
  const sessionStore = {};
  const messageEvent = eventHook();
  const tabsRemoved = eventHook();
  const tabsActivated = eventHook();
  const committed = eventHook();
  const historyUpdated = eventHook();
  const alarmEvent = eventHook();
  const installed = eventHook();
  const startup = eventHook();
  const background = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
  const engine = fs.readFileSync(path.join(__dirname, '..', 'risk-engine.js'), 'utf8');

  const chrome = {
    runtime: { onMessage: messageEvent, onInstalled: installed, onStartup: startup },
    storage: {
      session: {
        async get(key) {
          if (typeof key === 'string') return { [key]: sessionStore[key] };
          return { ...sessionStore };
        },
        async set(values) { Object.assign(sessionStore, values); },
        remove(key) { delete sessionStore[key]; }
      },
      local: { async get() { return { allowlist: [] }; } }
    },
    tabs: {
      async get() { return { id: 12, url: 'https://example.test/page' }; },
      async query() { return [{ id: 12, url: 'https://example.test/page' }]; },
      onRemoved: tabsRemoved,
      onActivated: tabsActivated
    },
    webNavigation: { onCommitted: committed, onHistoryStateUpdated: historyUpdated },
    alarms: { create() {}, onAlarm: alarmEvent },
    action: { setBadgeBackgroundColor() {}, setBadgeText() {} },
    notifications: { async create() {} }
  };

  const context = vm.createContext({
    chrome,
    console,
    URL,
    Date,
    Map,
    Promise,
    Number,
    Math,
    Set,
    importScripts() { vm.runInContext(engine, context); }
  });
  vm.runInContext(background, context);
  return { context, messageEvent, committed };
}

function send(messageEvent, message, sender) {
  return new Promise((resolve) => {
    const keepChannelOpen = messageEvent.listener(message, sender, resolve);
    if (!keepChannelOpen) resolve(undefined);
  });
}

test('service worker turns content signals into popup score and history', async () => {
  const { messageEvent } = createServiceWorker();
  const sender = { tab: { id: 12, url: 'https://example.test/page' } };

  for (let index = 0; index < 4; index += 1) {
    await send(messageEvent, {
      type: 'signal', signal: 'worker', detail: { hardwareConcurrency: 4 }
    }, sender);
  }
  for (let index = 0; index < 2; index += 1) {
    await send(messageEvent, { type: 'signal', signal: 'wasm', detail: {} }, sender);
  }

  const state = await send(messageEvent, { type: 'get-state', tabId: 12 }, {});
  assert.equal(state.signals.workerCount, 4);
  assert.equal(state.signals.wasmCount, 2);
  assert.equal(state.score, 62);
  assert.equal(state.history.length, 6);
  assert.equal(state.windowMs, 60_000);
});

test('service worker clears popup score and evidence on navigation', async () => {
  const { messageEvent, committed } = createServiceWorker();
  const sender = { tab: { id: 12, url: 'https://example.test/page' } };
  await send(messageEvent, { type: 'signal', signal: 'wasm', detail: {} }, sender);
  committed.listener({ tabId: 12, frameId: 0 });

  const state = await send(messageEvent, { type: 'get-state', tabId: 12 }, {});
  assert.equal(state.score, 0);
  assert.equal(state.signals.wasmCount, 0);
  assert.equal(state.history[0].kind, 'navigation');
});