const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'risk-engine.js'), 'utf8');
const context = { Date, globalThis: {} };
vm.runInNewContext(source, context);
const risk = context.globalThis.CryptoGuardRisk;

test('recent signals contribute, then expire after sixty seconds', () => {
  let state = risk.blankState(1_000);
  for (let index = 0; index < 4; index += 1) {
    state = risk.recordSignal(state, 'worker', { hardwareConcurrency: 4 }, 1_000 + index);
  }
  state = risk.recordSignal(state, 'wasm', {}, 1_005);
  state = risk.recordSignal(state, 'wasm', {}, 1_006);

  assert.ok(state.score > 50);
  risk.refreshState(state, 60_999);
  assert.ok(state.score > 0);
  risk.refreshState(state, 61_006);
  assert.equal(state.score, 0);
  assert.equal(state.signals.workerCount, 0);
  assert.equal(state.signals.wasmCount, 0);
  assert.equal(state.history.at(-1).kind, 'decay');
});

test('navigation clears current signals and resets the evidence timeline', () => {
  let state = risk.blankState(5_000);
  state = risk.recordSignal(state, 'wasm', {}, 5_000);
  state = risk.recordSignal(state, 'worker', { hardwareConcurrency: 4 }, 5_001);
  const previousScore = state.score;
  risk.resetForNavigation(state, 5_100);

  assert.equal(state.score, 0);
  assert.equal(state.events.length, 0);
  assert.equal(state.signals.wasmCount, 0);
  assert.equal(state.signals.workerCount, 0);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].kind, 'navigation');
  assert.equal(state.history[0].scoreBefore, previousScore);
  assert.equal(state.history[0].scoreAfter, 0);
});

test('evidence history remains capped', () => {
  let state = risk.blankState(0);
  for (let index = 0; index < 40; index += 1) {
    state = risk.recordSignal(state, 'wasm', {}, index);
  }
  assert.equal(state.history.length, risk.HISTORY_LIMIT);
});