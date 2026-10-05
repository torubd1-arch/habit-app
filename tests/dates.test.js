import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatFileTimestamp,
  formatJaLong,
  formatJaShort,
  getSleepTargetDate,
  isValidDateKey,
  isValidIsoUtc,
  msUntilNextLocalMidnight,
  shiftDateKey,
  toLocalDateKey,
} from '../js/dates.js';

function withTZ(tz, fn) {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  }
}

test('JST の 10/5 00:01 はローカル日付 10/5（UTC 切り出しの 10/4 にならない）', () => {
  withTZ('Asia/Tokyo', () => {
    const d = new Date('2026-10-04T15:01:00.000Z'); // JST 2026-10-05 00:01
    assert.equal(d.toISOString().slice(0, 10), '2026-10-04');
    assert.equal(toLocalDateKey(d), '2026-10-05');
  });
});

test('前日計算：年またぎ・うるう年・平年', () => {
  assert.equal(shiftDateKey('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDateKey('2028-03-01', -1), '2028-02-29');
  assert.equal(shiftDateKey('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDateKey('2026-12-31', 1), '2027-01-01');
  assert.equal(getSleepTargetDate('2026-10-05'), '2026-10-04');
  assert.equal(getSleepTargetDate('2027-01-01'), '2026-12-31');
});

test('日付検証：実在しない日付・形式不正を拒否、うるう年を受理', () => {
  assert.equal(isValidDateKey('2026-02-30'), false);
  assert.equal(isValidDateKey('2026-02-29'), false);
  assert.equal(isValidDateKey('2028-02-29'), true);
  assert.equal(isValidDateKey('2000-02-29'), true);
  assert.equal(isValidDateKey('1900-02-29'), false);
  assert.equal(isValidDateKey('2026-13-01'), false);
  assert.equal(isValidDateKey('2026-00-10'), false);
  assert.equal(isValidDateKey('2026-1-05'), false);
  assert.equal(isValidDateKey('20261005'), false);
  assert.equal(isValidDateKey(' 2026-10-05'), false);
  assert.equal(isValidDateKey('2026-10-05T00:00'), false);
  assert.equal(isValidDateKey(20261005), false);
  assert.equal(isValidDateKey('2026-10-05'), true);
});

test('夏時間のあるタイムゾーンでも暦日の前後が正しい', () => {
  for (const tz of ['America/New_York', 'Europe/London', 'Australia/Sydney']) {
    withTZ(tz, () => {
      // 米国 2026-03-08 / 2026-11-01、英国 2026-03-29 / 2026-10-25、豪州 2026-04-05 / 2026-10-04
      for (const key of ['2026-03-08', '2026-11-01', '2026-03-29', '2026-10-25', '2026-04-05', '2026-10-04']) {
        const next = shiftDateKey(key, 1);
        assert.equal(shiftDateKey(next, -1), key, `${tz} ${key}`);
        assert.notEqual(next, key);
      }
      assert.equal(shiftDateKey('2026-03-09', -1), '2026-03-08');
      assert.equal(shiftDateKey('2026-11-02', -1), '2026-11-01');
      assert.equal(toLocalDateKey(new Date(2026, 2, 8, 23, 30)), '2026-03-08');
      assert.equal(toLocalDateKey(new Date(2026, 10, 1, 0, 30)), '2026-11-01');
    });
  }
});

test('次のローカル0時までの時間（夏時間の日も0時を指す）', () => {
  withTZ('America/New_York', () => {
    const now = new Date(2026, 2, 7, 23, 0); // 3/8 に夏時間開始
    const target = new Date(now.getTime() + msUntilNextLocalMidnight(now));
    assert.equal(toLocalDateKey(target), '2026-03-08');
    assert.equal(target.getHours(), 0);
  });
});

test('表示用の書式', () => {
  assert.equal(formatJaLong('2026-10-05'), '2026年10月5日（月）');
  assert.equal(formatJaShort('2026-10-04'), '10/4（日）');
  assert.equal(formatFileTimestamp(new Date(2026, 9, 5, 9, 40, 0)), '2026-10-05-094000');
});

test('ISO UTC 日時の検証', () => {
  assert.equal(isValidIsoUtc('2026-10-05T00:30:00.000Z'), true);
  assert.equal(isValidIsoUtc('2026-10-05T00:30:00Z'), true);
  assert.equal(isValidIsoUtc('2026-10-05T00:30:00+09:00'), false);
  assert.equal(isValidIsoUtc('2026-02-30T00:00:00.000Z'), false);
  assert.equal(isValidIsoUtc('2026-10-05T24:00:00.000Z'), false);
  assert.equal(isValidIsoUtc('2026-10-05'), false);
  assert.equal(isValidIsoUtc(0), false);
});
