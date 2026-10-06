// データモデル：デフォルト値、導出値、検証。DOM や保存処理には依存しない。

import {
  BOOLEAN_FIELDS,
  PREVIOUS_DAY_FIELDS,
  RECORD_FIELDS,
  WATER_ID,
  WATER_SLOT_COUNT,
  WATER_UNIT_ML,
} from './habits.js';
import { getSleepTargetDate, isValidDateKey, isValidIsoUtc } from './dates.js';

export const APP_ID = 'personal-habits';
export const SCHEMA_VERSION = 1;
export const MAX_RECORDS = 10000;

const DATA_FIELDS = ['appId', 'schemaVersion', 'revision', 'createdAt', 'updatedAt', 'records'];

export function createEmptyData(nowIso) {
  return {
    appId: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    createdAt: nowIso,
    updatedAt: nowIso,
    records: {},
  };
}

export function createEmptyRecord() {
  const rec = {};
  for (const f of BOOLEAN_FIELDS) rec[f] = false;
  rec[WATER_ID] = new Array(WATER_SLOT_COUNT).fill(false);
  return rec;
}

/** 指定日のレコードを読む。未存在なら全 false を返し、データには何も作らない */
export function getRecord(data, dateKey) {
  const rec = data && data.records && Object.hasOwn(data.records, dateKey) ? data.records[dateKey] : null;
  if (!rec) return createEmptyRecord();
  return { ...rec, [WATER_ID]: [...rec[WATER_ID]] };
}

export function waterCount(record) {
  return record[WATER_ID].filter(Boolean).length;
}

export function waterMl(record) {
  return waterCount(record) * WATER_UNIT_ML;
}

/** 水以外の boolean 7項目の達成数 */
export function achievedCount(record) {
  return BOOLEAN_FIELDS.filter((f) => record[f] === true).length;
}

/** 全項目 false（未記録と同じ表示にする） */
export function isEmptyRecord(record) {
  return achievedCount(record) === 0 && waterCount(record) === 0;
}

/**
 * 操作の保存先日付を決める。
 * 今日画面の禁酒・睡眠は前日、日別編集ではすべて選択日。
 */
export function resolveTargetDate(mode, field, dateKey) {
  if (mode === 'today' && PREVIOUS_DAY_FIELDS.includes(field)) return getSleepTargetDate(dateKey);
  return dateKey;
}

/**
 * 1項目だけ反転した新しいデータを返す（元データは変更しない）。
 * field が waterSlots のときは slot（0〜3）の枠だけ反転する。
 */
export function toggleField(data, dateKey, field, slot = null) {
  if (!isValidDateKey(dateKey)) throw new RangeError('不正な日付キー');
  const rec = getRecord(data, dateKey);
  if (field === WATER_ID) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= WATER_SLOT_COUNT) throw new RangeError('不正な水の枠');
    rec[WATER_ID][slot] = !rec[WATER_ID][slot];
  } else if (BOOLEAN_FIELDS.includes(field)) {
    rec[field] = !rec[field];
  } else {
    throw new RangeError(`不明な項目: ${field}`);
  }
  return { ...data, records: { ...data.records, [dateKey]: rec } };
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.prototype.toString.call(value) === '[object Object]';
}

function hasExactKeys(obj, keys) {
  const own = Object.keys(obj);
  return own.length === keys.length && keys.every((k) => Object.hasOwn(obj, k));
}

/** 1日分のレコードを検証し、既知フィールドだけで新しいオブジェクトを作る */
function validateRecord(rec) {
  if (!isPlainObject(rec) || !hasExactKeys(rec, RECORD_FIELDS)) return null;
  const out = {};
  for (const f of BOOLEAN_FIELDS) {
    if (typeof rec[f] !== 'boolean') return null;
    out[f] = rec[f];
  }
  const slots = rec[WATER_ID];
  if (!Array.isArray(slots) || slots.length !== WATER_SLOT_COUNT) return null;
  if (!slots.every((v) => typeof v === 'boolean')) return null;
  out[WATER_ID] = [...slots];
  return out;
}

/**
 * 保存データ（schemaVersion 1）を検証する。
 * 成功時は検証済みフィールドから再構築した新しいオブジェクトを返す。
 */
export function validateData(value) {
  if (!isPlainObject(value)) return { ok: false, error: 'データの形式が正しくありません' };
  if (value.appId !== APP_ID) return { ok: false, error: 'このアプリのデータではありません' };
  if (value.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: '対応していないデータのバージョンです' };
  if (!hasExactKeys(value, DATA_FIELDS)) return { ok: false, error: 'データに不明な項目または欠落があります' };
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) return { ok: false, error: 'revision が不正です' };
  if (!isValidIsoUtc(value.createdAt) || !isValidIsoUtc(value.updatedAt)) return { ok: false, error: '日時の形式が不正です' };
  if (!isPlainObject(value.records)) return { ok: false, error: '記録の形式が正しくありません' };
  const keys = Object.keys(value.records);
  if (keys.length > MAX_RECORDS) return { ok: false, error: `記録が${MAX_RECORDS}日を超えています` };
  const records = {};
  for (const key of keys) {
    if (!isValidDateKey(key)) return { ok: false, error: `不正な日付があります: ${key.slice(0, 20)}` };
    const rec = validateRecord(value.records[key]);
    if (!rec) return { ok: false, error: `${key} の記録の形式が正しくありません` };
    records[key] = rec;
  }
  return {
    ok: true,
    data: {
      appId: APP_ID,
      schemaVersion: SCHEMA_VERSION,
      revision: value.revision,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      records,
    },
  };
}
