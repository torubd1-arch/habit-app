import test from 'node:test';
import assert from 'node:assert/strict';
import {
  achievedCount,
  createEmptyData,
  getRecord,
  isEmptyRecord,
  resolveTargetDate,
  toggleField,
  validateData,
  waterCount,
  waterMl,
} from '../js/model.js';
import { BOOLEAN_FIELDS, RECORD_FIELDS } from '../js/habits.js';

const NOW = '2026-10-05T00:00:00.000Z';

test('8項目：通常6＋水＋睡眠', () => {
  assert.equal(BOOLEAN_FIELDS.length, 7);
  assert.equal(RECORD_FIELDS.length, 8);
  assert.ok(RECORD_FIELDS.includes('waterSlots'));
  assert.ok(RECORD_FIELDS.includes('sleepByMidnight'));
});

test('未存在レコードは全 false として読み、閲覧だけでは作らない', () => {
  const data = createEmptyData(NOW);
  const rec = getRecord(data, '2026-10-05');
  for (const f of BOOLEAN_FIELDS) assert.equal(rec[f], false);
  assert.deepEqual(rec.waterSlots, [false, false, false, false]);
  assert.deepEqual(data.records, {});
  rec.stretch = true; // 返り値を変更してもデータに影響しない
  assert.deepEqual(data.records, {});
});

test('通常項目の反転と取消（元データは変更しない）', () => {
  const d0 = createEmptyData(NOW);
  const d1 = toggleField(d0, '2026-10-05', 'stretch');
  assert.equal(getRecord(d1, '2026-10-05').stretch, true);
  assert.deepEqual(d0.records, {});
  const d2 = toggleField(d1, '2026-10-05', 'stretch');
  assert.equal(getRecord(d2, '2026-10-05').stretch, false);
  assert.ok(Object.hasOwn(d2.records, '2026-10-05')); // 全 false でも残してよい
  assert.ok(isEmptyRecord(getRecord(d2, '2026-10-05')));
});

test('水：4枠それぞれの反転は他の枠に影響しない', () => {
  for (let i = 0; i < 4; i++) {
    const d = toggleField(createEmptyData(NOW), '2026-10-05', 'waterSlots', i);
    const slots = getRecord(d, '2026-10-05').waterSlots;
    assert.deepEqual(slots, [0, 1, 2, 3].map((j) => j === i));
  }
});

test('水：穴あきを含む全16通りで件数・mlが一致', () => {
  for (let mask = 0; mask < 16; mask++) {
    let d = createEmptyData(NOW);
    for (let i = 0; i < 4; i++) if (mask & (1 << i)) d = toggleField(d, '2026-10-05', 'waterSlots', i);
    const rec = getRecord(d, '2026-10-05');
    const expected = [0, 1, 2, 3].filter((i) => mask & (1 << i)).length;
    assert.equal(waterCount(rec), expected);
    assert.equal(waterMl(rec), expected * 500);
    assert.deepEqual(rec.waterSlots, [0, 1, 2, 3].map((i) => Boolean(mask & (1 << i))));
  }
});

test('水：不正な枠は拒否', () => {
  const d = createEmptyData(NOW);
  assert.throws(() => toggleField(d, '2026-10-05', 'waterSlots', 4));
  assert.throws(() => toggleField(d, '2026-10-05', 'waterSlots', null));
  assert.throws(() => toggleField(d, '2026-10-05', 'unknown'));
  assert.throws(() => toggleField(d, '2026-02-30', 'stretch'));
});

test('睡眠：今日画面からは前日、日別編集では指定日。同じ対象日に同じ値', () => {
  assert.equal(resolveTargetDate('today', 'sleepByMidnight', '2026-10-05'), '2026-10-04');
  assert.equal(resolveTargetDate('today', 'stretch', '2026-10-05'), '2026-10-05');
  assert.equal(resolveTargetDate('today', 'waterSlots', '2026-10-05'), '2026-10-05');
  assert.equal(resolveTargetDate('day', 'sleepByMidnight', '2026-10-04'), '2026-10-04');
  assert.equal(resolveTargetDate('day', 'sleepByMidnight', '2026-10-05'), '2026-10-05');
  assert.equal(resolveTargetDate('today', 'sleepByMidnight', '2026-01-01'), '2025-12-31');
  assert.equal(resolveTargetDate('today', 'sleepByMidnight', '2026-03-01'), '2026-02-28');

  // 10/5 の今日画面で押す → 10/4 の日別編集に同じ値が出る
  let d = createEmptyData(NOW);
  d = toggleField(d, resolveTargetDate('today', 'sleepByMidnight', '2026-10-05'), 'sleepByMidnight');
  assert.equal(getRecord(d, '2026-10-04').sleepByMidnight, true);
  assert.equal(getRecord(d, '2026-10-05').sleepByMidnight, false);
  // 10/4 の日別編集で取消 → 今日画面の昨夜欄も取消
  d = toggleField(d, resolveTargetDate('day', 'sleepByMidnight', '2026-10-04'), 'sleepByMidnight');
  assert.equal(getRecord(d, '2026-10-04').sleepByMidnight, false);
});

test('達成数は水以外の7項目（睡眠を含む）', () => {
  let d = createEmptyData(NOW);
  for (const f of ['stretch', 'bike', 'sleepByMidnight']) d = toggleField(d, '2026-10-04', f);
  d = toggleField(d, '2026-10-04', 'waterSlots', 2);
  const rec = getRecord(d, '2026-10-04');
  assert.equal(achievedCount(rec), 3);
  assert.equal(waterCount(rec), 1);
  assert.equal(isEmptyRecord(rec), false);
});

test('validateData：既知フィールドから再構築し、不正を拒否', () => {
  const good = toggleField(createEmptyData(NOW), '2026-10-05', 'putting');
  const res = validateData(JSON.parse(JSON.stringify(good)));
  assert.equal(res.ok, true);
  assert.deepEqual(res.data, good);

  const bad = (mutate) => {
    const v = JSON.parse(JSON.stringify(good));
    mutate(v);
    return validateData(v).ok;
  };
  assert.equal(bad((v) => { v.schemaVersion = 2; }), false);
  assert.equal(bad((v) => { v.appId = 'other'; }), false);
  assert.equal(bad((v) => { v.extra = 1; }), false);
  assert.equal(bad((v) => { v.revision = -1; }), false);
  assert.equal(bad((v) => { v.revision = 1.5; }), false);
  assert.equal(bad((v) => { v.records['2026-10-05'].stretch = 1; }), false);
  assert.equal(bad((v) => { delete v.records['2026-10-05'].bike; }), false);
  assert.equal(bad((v) => { v.records['2026-10-05'].waterSlots = [true]; }), false);
  assert.equal(bad((v) => { v.records['2026-02-30'] = v.records['2026-10-05']; }), false);
  assert.equal(bad((v) => { v.records = []; }), false);
  assert.equal(validateData(JSON.parse('{"__proto__":{"x":1}}')).ok, false);
});
