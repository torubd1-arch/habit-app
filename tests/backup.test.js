import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from './helpers.js';
import {
  MAX_BACKUP_BYTES,
  backupFileName,
  backupToText,
  checkFileSize,
  inspectPreImport,
  performImport,
  revertImport,
  summarizeData,
  validateBackupText,
} from '../js/backup.js';
import { createEmptyData, createEmptyRecord, toggleField } from '../js/model.js';
import { DATA_KEY, PRE_IMPORT_KEY, applyToggle, loadData } from '../js/storage.js';
import { shiftDateKey } from '../js/dates.js';

const NOW = new Date('2026-10-05T00:40:00.000Z');

function sampleData() {
  let d = createEmptyData('2026-10-01T00:00:00.000Z');
  d = toggleField(d, '2026-10-04', 'alcoholFree');
  d = toggleField(d, '2026-10-04', 'sleepByMidnight');
  d = toggleField(d, '2026-10-05', 'waterSlots', 0);
  d = toggleField(d, '2026-10-05', 'waterSlots', 2);
  return { ...d, revision: 12 };
}

function mutated(fn) {
  const obj = JSON.parse(backupToText(sampleData(), NOW));
  fn(obj);
  return validateBackupText(JSON.stringify(obj));
}

test('書き出し → 読み込みで往復一致', () => {
  const data = sampleData();
  const text = backupToText(data, NOW);
  const obj = JSON.parse(text);
  assert.equal(obj.backupFormat, 'personal-habits-backup');
  assert.equal(obj.backupVersion, 1);
  assert.equal(obj.exportedAt, NOW.toISOString());
  assert.ok(text.includes('\n  ')); // 整形 JSON
  const res = validateBackupText(text);
  assert.equal(res.ok, true);
  assert.deepEqual(res.data, data);
});

test('ファイル名は端末ローカルの日付時刻', () => {
  assert.equal(backupFileName(new Date(2026, 9, 5, 9, 40, 0)), 'habits-backup-2026-10-05-094000.json');
});

test('不正なバックアップを拒否', () => {
  assert.equal(validateBackupText('not json').ok, false);
  assert.equal(validateBackupText('[]').ok, false);
  assert.equal(mutated((o) => { o.backupFormat = 'x'; }).ok, false);
  assert.equal(mutated((o) => { o.backupVersion = 2; }).ok, false);
  assert.equal(mutated((o) => { o.data.schemaVersion = 2; }).ok, false);
  assert.equal(mutated((o) => { o.data.appId = 'x'; }).ok, false);
  assert.equal(mutated((o) => { o.extra = true; }).ok, false);
  assert.equal(mutated((o) => { delete o.exportedAt; }).ok, false);
  assert.equal(mutated((o) => { o.exportedAt = '2026-10-05 09:40'; }).ok, false);
  assert.equal(mutated((o) => { o.data.records = []; }).ok, false);
  assert.equal(mutated((o) => { o.data = []; }).ok, false);
  assert.equal(mutated((o) => { o.data.revision = '12'; }).ok, false);
  assert.equal(mutated((o) => { o.data.updatedAt = 'yesterday'; }).ok, false);
  assert.equal(mutated((o) => { o.data.records['2026-10-04'].stretch = 'true'; }).ok, false); // 型違い
  assert.equal(mutated((o) => { delete o.data.records['2026-10-04'].putting; }).ok, false); // 欠落
  assert.equal(mutated((o) => { o.data.records['2026-10-04'].memo = 'x'; }).ok, false); // 余計なキー
  assert.equal(mutated((o) => { o.data.records['2026-10-04'].waterSlots = [true, true, true]; }).ok, false);
  assert.equal(mutated((o) => { o.data.records['2026-10-04'].waterSlots = [1, 0, 0, 0]; }).ok, false);
  assert.equal(mutated((o) => { o.data.records['2026-2-4'] = o.data.records['2026-10-04']; }).ok, false);
  assert.equal(mutated((o) => { o.data.records['12026-01-01'] = o.data.records['2026-10-04']; }).ok, false);
});

test('__proto__ などのキーを受け付けない', () => {
  const text = backupToText(sampleData(), NOW).replace('"records": {', '"records": {\n "__proto__": {"polluted": true},');
  assert.equal(validateBackupText(text).ok, false);
  const text2 = backupToText(sampleData(), NOW).replace('"appId"', '"__proto__": {}, "appId"');
  assert.equal(validateBackupText(text2).ok, false);
  assert.equal({}.polluted, undefined);
});

test('空記録・未来日のバックアップを受け入れる', () => {
  const empty = validateBackupText(backupToText(createEmptyData(NOW.toISOString()), NOW));
  assert.equal(empty.ok, true);
  assert.deepEqual(summarizeData(empty.data), { days: 0, oldest: null, newest: null });

  const future = toggleField(createEmptyData(NOW.toISOString()), '2030-01-01', 'bike');
  const res = validateBackupText(backupToText(future, NOW));
  assert.equal(res.ok, true);
  assert.equal(res.data.records['2030-01-01'].bike, true);
});

test('記録日数の上限 10,000 日とサイズ上限', () => {
  const data = createEmptyData(NOW.toISOString());
  let key = '1990-01-01';
  for (let i = 0; i < 10000; i++) {
    data.records[key] = createEmptyRecord();
    key = shiftDateKey(key, 1);
  }
  const ok = validateBackupText(JSON.stringify({
    backupFormat: 'personal-habits-backup', backupVersion: 1, exportedAt: NOW.toISOString(), data,
  }));
  assert.equal(ok.ok, true);
  assert.equal(summarizeData(ok.data).days, 10000);

  data.records[key] = createEmptyRecord();
  const over = validateBackupText(JSON.stringify({
    backupFormat: 'personal-habits-backup', backupVersion: 1, exportedAt: NOW.toISOString(), data,
  }));
  assert.equal(over.ok, false);

  assert.equal(checkFileSize(MAX_BACKUP_BYTES), true);
  assert.equal(checkFileSize(MAX_BACKUP_BYTES + 1), false);
  assert.equal(validateBackupText(' '.repeat(MAX_BACKUP_BYTES + 1)).ok, false);
});

test('置換読み込み：現在の元文字列を退避し、revision を引き継ぐ', () => {
  const s = new MemoryStorage();
  for (let i = 0; i < 20; i++) applyToggle(s, '2026-10-05', 'stretch', null, NOW); // revision 20
  const before = s.getItem(DATA_KEY);
  const imported = validateBackupText(backupToText(sampleData(), NOW)).data; // revision 12
  const res = performImport(s, imported, NOW);
  assert.equal(res.ok, true);
  assert.equal(s.getItem(PRE_IMPORT_KEY), before);
  const loaded = loadData(s, NOW).data;
  assert.equal(loaded.revision, 21);
  assert.equal(loaded.updatedAt, NOW.toISOString());
  assert.deepEqual(loaded.records, sampleData().records);
});

test('退避に失敗したら主キーを変えない', () => {
  const s = new MemoryStorage();
  applyToggle(s, '2026-10-05', 'stretch', null, NOW);
  const before = s.getItem(DATA_KEY);
  s.failSet = (key) => key === PRE_IMPORT_KEY;
  const res = performImport(s, sampleData(), NOW);
  assert.equal(res.ok, false);
  assert.equal(s.getItem(DATA_KEY), before);
});

test('主キーの保存に失敗したら現データを維持し、退避キーも元に戻す', () => {
  const s = new MemoryStorage();
  applyToggle(s, '2026-10-05', 'stretch', null, NOW);
  s.setItem(PRE_IMPORT_KEY, 'old-copy');
  const before = s.getItem(DATA_KEY);
  s.failSet = (key) => key === DATA_KEY;
  const res = performImport(s, sampleData(), NOW);
  assert.equal(res.ok, false);
  assert.equal(s.getItem(DATA_KEY), before);
  assert.equal(s.getItem(PRE_IMPORT_KEY), 'old-copy');
});

test('主キーがない場合は退避不要（古い復元前コピーも残さない）', () => {
  const s = new MemoryStorage();
  s.setItem(PRE_IMPORT_KEY, 'stale');
  const res = performImport(s, sampleData(), NOW);
  assert.equal(res.ok, true);
  assert.equal(s.getItem(PRE_IMPORT_KEY), null);
  assert.equal(inspectPreImport(s).state, 'none');
});

test('破損データは置換読み込みで復旧でき、退避コピーは破損扱いで戻せない', () => {
  const s = new MemoryStorage();
  s.setItem(DATA_KEY, '{broken');
  assert.equal(loadData(s, NOW).status, 'corrupt');
  const res = performImport(s, sampleData(), NOW);
  assert.equal(res.ok, true);
  assert.equal(loadData(s, NOW).status, 'ok');
  assert.equal(s.getItem(PRE_IMPORT_KEY), '{broken');
  assert.equal(inspectPreImport(s).state, 'corrupt');
  assert.equal(revertImport(s, NOW).ok, false);
});

test('読み込み前に戻す：1回分のみ、戻した後に退避キーを削除', () => {
  const s = new MemoryStorage();
  applyToggle(s, '2026-10-05', 'strength', null, NOW);
  performImport(s, sampleData(), NOW);
  assert.equal(inspectPreImport(s).state, 'valid');
  const res = revertImport(s, NOW);
  assert.equal(res.ok, true);
  const loaded = loadData(s, NOW).data;
  assert.equal(loaded.records['2026-10-05'].strength, true);
  assert.equal(loaded.records['2026-10-04'], undefined);
  assert.ok(loaded.revision > 13);
  assert.equal(s.getItem(PRE_IMPORT_KEY), null);
  assert.equal(revertImport(s, NOW).ok, false);
});
