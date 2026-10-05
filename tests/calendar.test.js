import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthGrid, cellSummary, overallLevel, shiftMonth } from '../js/calendar.js';
import { createEmptyData, toggleField } from '../js/model.js';

const NOW = '2026-10-05T00:00:00.000Z';

test('月曜始まりのグリッド：2026年2月（1日が日曜）', () => {
  const weeks = buildMonthGrid(2026, 2);
  assert.equal(weeks[0].filter((c) => c === null).length, 6);
  assert.equal(weeks[0][6], '2026-02-01');
  assert.equal(weeks.flat().filter(Boolean).length, 28);
});

test('6週になる月：2026年8月（1日が土曜・31日）', () => {
  const weeks = buildMonthGrid(2026, 8);
  assert.equal(weeks.length, 6);
  assert.equal(weeks[0][5], '2026-08-01');
  assert.equal(weeks[5][0], '2026-08-31');
});

test('うるう年の2月と月移動', () => {
  assert.equal(buildMonthGrid(2028, 2).flat().filter(Boolean).length, 29);
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
});

test('全体表示：達成数（睡眠を含む7項目）と水を別に数える', () => {
  let d = createEmptyData(NOW);
  assert.deepEqual(cellSummary(d, '2026-10-04', 'all'), { kind: 'all', empty: true, achieved: 0, water: 0, level: 0 });
  d = toggleField(d, '2026-10-04', 'sleepByMidnight');
  d = toggleField(d, '2026-10-04', 'stretch');
  d = toggleField(d, '2026-10-04', 'waterSlots', 3);
  const s = cellSummary(d, '2026-10-04', 'all');
  assert.equal(s.achieved, 2);
  assert.equal(s.water, 1);
  assert.equal(s.empty, false);
  // 個別フィルターと一致
  assert.equal(cellSummary(d, '2026-10-04', 'sleepByMidnight').done, true);
  assert.equal(cellSummary(d, '2026-10-04', 'putting').done, false);
  assert.equal(cellSummary(d, '2026-10-04', 'waterSlots').count, 1);
});

test('全 false の保存レコードは未記録と同じ表示', () => {
  let d = toggleField(createEmptyData(NOW), '2026-10-04', 'bike');
  d = toggleField(d, '2026-10-04', 'bike');
  assert.equal(cellSummary(d, '2026-10-04', 'all').empty, true);
});

test('濃淡は 0〜7 を段階にまとめる', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(overallLevel), [0, 1, 1, 2, 2, 3, 3, 4]);
});
