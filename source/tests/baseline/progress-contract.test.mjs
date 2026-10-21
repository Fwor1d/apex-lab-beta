import test from 'node:test';
import assert from 'node:assert/strict';
import { progressSnapshot, manualDemoProgress, OPERATION_STAGES } from '../../app/progress-contract.js';

test('unknown total remains indeterminate at every operation stage', () => {
  for (const { id } of OPERATION_STAGES) {
    const value = progressSnapshot({ status: 'running', stage: id });
    assert.equal(value.percent, null);
    assert.equal(value.mode, 'indeterminate');
  }
});
test('bytes have their own denominator and never imply overall progress', () => {
  const value = progressSnapshot({ status: 'running', stage: 'bytes-read', bytes: { completed: 25, total: 100 } });
  assert.equal(value.bytesPercent, 25);
  assert.equal(value.percent, null);
});
test('overall counters require an explicit source, kind, and whole-operation basis', () => {
  const overall = { basis: 'all-operation-work', completed: 64, total: 100 };
  assert.equal(progressSnapshot({ overall }).percent, null);
  assert.equal(progressSnapshot({ overall, source: 'Worker', kind: 'measured', status: 'running' }).percent, 64);
  assert.equal(progressSnapshot({ overall: { ...overall, basis: 'bytes' }, source: 'Worker', kind: 'measured' }).percent, null);
});
test('invalid counters and absent values are unknown, never zero', () => {
  for (const total of [0, -1, Infinity, null, NaN]) assert.equal(progressSnapshot({ bytes: { total, completed: 0 } }).bytesPercent, null);
  for (const completed of [-1, 101, null, NaN]) assert.equal(progressSnapshot({ bytes: { total: 100, completed } }).bytesPercent, null);
  assert.equal(progressSnapshot().percent, null);
  assert.equal(progressSnapshot({ status: 'complete', stage: 'complete' }).percent, null);
});
test('100 requires explicit completion; ready view and full byte read are insufficient', () => {
  const input = { status: 'running', stage: 'view-ready', source: 'Worker', kind: 'measured', overall: { basis: 'all-operation-work', completed: 100, total: 100 } };
  const pending = progressSnapshot(input);
  assert.equal(pending.percent, null);
  assert.equal(pending.pendingCompletion, true);
  assert.equal(progressSnapshot({ ...input, status: 'complete' }).percent, null);
  assert.equal(progressSnapshot({ ...input, status: 'complete', stage: 'complete' }).percent, 100);
});
test('manual demo preserves exact reported values and labels explicit 100 completion', () => {
  for (let value = 0; value < 100; value++) {
    const snapshot = manualDemoProgress(value);
    assert.equal(snapshot.percent, value);
    assert.equal(snapshot.kind, 'manual-demo');
    assert.equal(snapshot.complete, false);
  }
  assert.equal(manualDemoProgress(100).complete, true);
  assert.equal(manualDemoProgress(100).percent, 100);
  for (const value of [-1, 101, 0.5, '1', null]) assert.throws(() => manualDemoProgress(value), RangeError);
});
test('error and cancel do not become completion or keep an active percentage', () => {
  for (const status of ['error', 'cancelled']) {
    const snapshot = manualDemoProgress(100, status);
    assert.equal(snapshot.complete, false);
    assert.equal(snapshot.percent, null);
    assert.equal(snapshot.mode, 'indeterminate');
  }
});
