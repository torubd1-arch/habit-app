import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from './helpers.js';
import { DATA_KEY, PROBE_KEY, applyToggle, checkWritable, loadData } from '../js/storage.js';
import { createEmptyData, createEmptyRecord, getRecord } from '../js/model.js';
import { shiftDateKey } from '../js/dates.js';

const NOW = new Date('2026-10-05T00:30:00.000Z');

test('保存可否の確認は一時キーを使い、実データキーに触れない', () => {
  const s = new MemoryStorage();
  s.setItem(DATA_KEY, 'keep');
  assert.equal(checkWritable(s), true);
  assert.equal(s.getItem(DATA_KEY), 'keep');
  assert.equal(s.getItem(PROBE_KEY), null);
  s.failSet = () => true;
  assert.equal(checkWritable(s), false);
  assert.equal(checkWritable(null), false);
});

test('キーなしは空の初期状態。閲覧だけでは保存しない', () => {
  const s = new MemoryStorage();
  const res = loadData(s, NOW);
  assert.equal(res.status, 'empty');
  assert.deepEqual(res.data.records, {});
  assert.equal(s.getItem(DATA_KEY), null);
});

test('初回の変更で保存され、revision が 1 ずつ増える', () => {
  const s = new MemoryStorage();
  const r1 = applyToggle(s, '2026-10-05', 'stretch', null, NOW);
  assert.equal(r1.ok, true);
  assert.equal(r1.data.revision, 1);
  const r2 = applyToggle(s, '2026-10-05', 'waterSlots', 1, NOW);
  assert.equal(r2.data.revision, 2);
  const saved = loadData(s, NOW);
  assert.equal(saved.status, 'ok');
  assert.equal(saved.data.records['2026-10-05'].stretch, true);
  assert.deepEqual(saved.data.records['2026-10-05'].waterSlots, [false, true, false, false]);
  assert.equal(saved.data.updatedAt, NOW.toISOString());
});

test('setItem 例外では成功にならず、保存内容も変わらない', () => {
  const s = new MemoryStorage();
  applyToggle(s, '2026-10-05', 'stretch', null, NOW);
  const before = s.getItem(DATA_KEY);
  s.failSet = () => true;
  const res = applyToggle(s, '2026-10-05', 'putting', null, NOW);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'write');
  assert.equal(s.getItem(DATA_KEY), before);
  assert.equal(getRecord(res.data, '2026-10-05').putting, false);
});

test('壊れた JSON・非対応スキーマは初期化せず、元文字列を保持する', () => {
  for (const raw of ['{broken', JSON.stringify({ ...createEmptyData(NOW.toISOString()), schemaVersion: 9 })]) {
    const s = new MemoryStorage();
    s.setItem(DATA_KEY, raw);
    const res = loadData(s, NOW);
    assert.equal(res.status, 'corrupt');
    assert.equal(res.raw, raw);
    const t = applyToggle(s, '2026-10-05', 'stretch', null, NOW);
    assert.equal(t.ok, false);
    assert.equal(t.reason, 'corrupt');
    assert.equal(s.getItem(DATA_KEY), raw);
  }
});

test('読み込み不可（getItem 例外）は unavailable', () => {
  const s = new MemoryStorage();
  s.failGet = true;
  assert.equal(loadData(s, NOW).status, 'unavailable');
  assert.equal(applyToggle(s, '2026-10-05', 'stretch', null, NOW).ok, false);
});

test('競合：別タブの変更後、次の操作が古い他項目を上書きしない', () => {
  const s = new MemoryStorage(); // 2つのタブが共有する localStorage
  applyToggle(s, '2026-10-05', 'stretch', null, NOW); // タブA
  const tabAView = loadData(s, NOW).data; // タブAの画面上のデータ（この後古くなる）
  applyToggle(s, '2026-10-05', 'putting', null, NOW); // タブB
  applyToggle(s, '2026-10-05', 'bike', null, NOW); // タブA（操作前に最新を読む）
  const rec = loadData(s, NOW).data.records['2026-10-05'];
  assert.equal(rec.stretch, true);
  assert.equal(rec.putting, true);
  assert.equal(rec.bike, true);
  assert.equal(getRecord(tabAView, '2026-10-05').putting, false);
});

test('10年分（3,650日）でも1回の保存が実用的な速度', () => {
  const s = new MemoryStorage();
  const data = createEmptyData(NOW.toISOString());
  let key = '2016-10-06';
  for (let i = 0; i < 3650; i++) {
    const rec = createEmptyRecord();
    rec.stretch = i % 2 === 0;
    rec.waterSlots = [true, i % 3 === 0, false, i % 5 === 0];
    data.records[key] = rec;
    key = shiftDateKey(key, 1);
  }
  s.setItem(DATA_KEY, JSON.stringify(data));
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) assert.equal(applyToggle(s, '2026-10-05', 'stretch', null, NOW).ok, true);
  const perTap = (performance.now() - t0) / 10;
  assert.ok(perTap < 100, `1回あたり ${perTap.toFixed(1)}ms`);
});
