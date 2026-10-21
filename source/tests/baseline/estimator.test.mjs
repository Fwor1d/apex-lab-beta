import test from 'node:test';
import assert from 'node:assert/strict';
import { geometryMetrics, compareGeometry, sampleCurvature, estimateCorner, compareCornerEstimates, validateEstimationInputs } from '../../app/educational-estimator.js';
import { createLine, sampleLine, moveHandle } from '../../app/line-geometry.js';
const params = Object.freeze({ roadWidthM: 12.8, entrySpeedMps: 10, lateralAccelerationMps2: 9, brakingMps2: 6, accelerationMps2: 3, maxSpeedMps: 10, exitMode: 'free' });
const straight = Array.from({ length: 101 }, (_, i) => ({ x: i * 10, y: 0 }));
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≠ ${b}`);

test('straight constant speed matches length/speed analytically', () => {
  const result = estimateCorner(straight, params);
  assert.equal(result.available, true); close(result.lengthM, 100); close(result.timeS, 10); assert.ok(result.speedsMps.every(v => v === 10));
});
test('width converts SVG units to metres without altering original geometry', () => {
  const original = geometryMetrics(straight); const narrow = estimateCorner(straight, params), wide = estimateCorner(straight, { ...params, roadWidthM: 25.6 });
  close(narrow.metresPerSvgUnit, 0.1); close(wide.lengthM, narrow.lengthM * 2); close(wide.timeS, narrow.timeS * 2); close(original.lengthSvg, 1000);
});
test('three-point circle curvature matches reciprocal metric radius', () => {
  const circle = Array.from({ length: 101 }, (_, i) => ({ x: 100 * Math.cos(i * Math.PI / 200), y: 100 * Math.sin(i * Math.PI / 200) }));
  for (const k of sampleCurvature(circle, 0.1)) close(k, 0.1, 1e-10);
  const result = estimateCorner(circle, { ...params, entrySpeedMps: Math.sqrt(90), maxSpeedMps: Math.sqrt(90) });
  assert.equal(result.available, true); close(result.timeS, result.lengthM / Math.sqrt(90), 1e-10);
});
test('missing essentials, Infinity, NaN, out-of-range and unknown exit condition stay unavailable', () => {
  for (const key of ['roadWidthM','entrySpeedMps','lateralAccelerationMps2','brakingMps2','accelerationMps2','maxSpeedMps']) {
    for (const value of [undefined, null, '', NaN, Infinity, -1, 1e9]) assert.equal(estimateCorner(straight, { ...params, [key]: value }).available, false, `${key}: ${value}`);
  }
  assert.equal(validateEstimationInputs({ ...params, exitMode: 'anything' }).valid, false);
  assert.equal(estimateCorner(straight, { ...params, exitMode: 'fixed' }).available, false);
});
test('invalid points, duplicate points, huge coordinates and invalid scale fail safely', () => {
  for (const points of [[], [{x:0,y:0}], [{x:0,y:0},{x:0,y:0}], [{x:0,y:0},{x:Infinity,y:0}], [{x:0,y:0},{x:1e7,y:0}]]) assert.equal(estimateCorner(points, params).available, false);
  assert.throws(() => sampleCurvature(straight, 0)); assert.throws(() => sampleCurvature(straight, NaN));
});
test('fixed entry/exit infeasibility is explicit, never silently changed', () => {
  const short = [{x:0,y:0},{x:1,y:0}];
  assert.equal(estimateCorner(short, { ...params, exitMode:'fixed', exitSpeedMps:0 }).available, false);
  assert.equal(estimateCorner(short, { ...params, entrySpeedMps:0, exitMode:'fixed', exitSpeedMps:10 }).available, false);
  assert.equal(estimateCorner(straight, { ...params, entrySpeedMps:11 }).available, false);
  const result = estimateCorner(straight, { ...params, exitMode:'fixed', exitSpeedMps:5 });
  assert.equal(result.available, true); close(result.speedsMps[0], 10); close(result.speedsMps.at(-1), 5);
});
test('forward/backward speeds obey sampled lateral, acceleration and braking bounds', () => {
  const result = estimateCorner(sampleLine(createLine()), { ...params, entrySpeedMps:55/3.6, maxSpeedMps:150/3.6 });
  assert.equal(result.available, true, result.reason); assert.ok(result.timeS > 0 && Number.isFinite(result.timeS));
  for (let i = 0; i < result.speedsMps.length; i += 1) {
    assert.ok(result.speedsMps[i] ** 2 * result.curvaturePerM[i] <= params.lateralAccelerationMps2 + 1e-7);
    if (!i) continue;
    const change = result.speedsMps[i] ** 2 - result.speedsMps[i-1] ** 2, ds = result.segmentLengthsM[i-1];
    assert.ok(change <= 2 * params.accelerationMps2 * ds + 1e-7); assert.ok(-change <= 2 * params.brakingMps2 * ds + 1e-7);
  }
});
test('baseline equals itself, deterministic repeatability and edits affect geometry', () => {
  const handles = createLine(), comparison = compareGeometry(handles);
  close(comparison.changeSvg, 0); close(comparison.changePercent, 0);
  const first = compareCornerEstimates(handles, params), second = compareCornerEstimates(handles, params);
  assert.equal(first.available, true); close(first.differenceS, 0); assert.deepEqual(first, second);
  const edited = moveHandle(handles, 'apex', {s:580,n:20}); assert.notEqual(compareGeometry(edited).changeSvg, 0); assert.deepEqual(handles, createLine());
});
test('controlled lateral limit affects curved paths; max speed affects straight paths', () => {
  const line = sampleLine(createLine());
  const slow = estimateCorner(line, {...params, lateralAccelerationMps2:4});
  const fast = estimateCorner(line, {...params, lateralAccelerationMps2:16});
  assert.equal(slow.available, true, slow.reason); assert.equal(fast.available, true); assert.ok(slow.timeS > fast.timeS);
  const low = estimateCorner(straight, {...params, entrySpeedMps:5,maxSpeedMps:5}); assert.ok(low.timeS > estimateCorner(straight,params).timeS);
});
test('starting at rest with nonzero acceleration integrates positive finite time', () => {
  const result = estimateCorner(straight, {...params, entrySpeedMps:0}); assert.equal(result.available,true); assert.ok(result.timeS > 10 && Number.isFinite(result.timeS));
});
