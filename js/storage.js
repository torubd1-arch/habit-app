// localStorage への保存。storage 引数を差し替えられるようにしてテスト可能にする。

import { createEmptyData, toggleField, validateData } from './model.js';

export const DATA_KEY = 'personal-habits-v1:data';
export const PRE_IMPORT_KEY = 'personal-habits-v1:pre-import';
export const PROBE_KEY = 'personal-habits-v1:probe';
export const LOCK_NAME = 'personal-habits-v1:write';

/** 一時キーへの書き込み・削除で保存可否を確認する（実データキーは使わない） */
export function checkWritable(storage) {
  try {
    if (!storage) return false;
    storage.setItem(PROBE_KEY, '1');
    const ok = storage.getItem(PROBE_KEY) === '1';
    storage.removeItem(PROBE_KEY);
    return ok;
  } catch {
    return false;
  }
}

/** 文字列を解析・検証する */
export function parseStored(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: '保存データが壊れています' };
  }
  return validateData(parsed);
}

/**
 * 保存データを読み込む。
 * status: 'empty'（キーなし）| 'ok' | 'corrupt'（破損・非対応）| 'unavailable'（読めない）
 * corrupt のときは raw を返し、決して上書きしない。
 */
export function loadData(storage, now = new Date()) {
  let raw;
  try {
    raw = storage.getItem(DATA_KEY);
  } catch {
    return { status: 'unavailable', data: null, raw: null };
  }
  if (raw === null) return { status: 'empty', data: createEmptyData(now.toISOString()), raw: null };
  const res = parseStored(raw);
  if (!res.ok) return { status: 'corrupt', data: null, raw, error: res.error };
  return { status: 'ok', data: res.data, raw };
}

/**
 * 最新データを読み直して mutate を適用し、保存する。
 * 書き込み直前に保存文字列が変わっていないか確認し、変わっていれば読み直してやり直す。
 * 成功時のみ { ok: true, data } を返す。失敗時は保存内容を変えない。
 */
export function updateData(storage, mutate, now = new Date()) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const loaded = loadData(storage, now);
    if (loaded.status === 'corrupt') return { ok: false, reason: 'corrupt', error: loaded.error };
    if (loaded.status === 'unavailable') return { ok: false, reason: 'unavailable' };
    const base = loaded.data;
    const next = mutate(base);
    next.revision = Math.min(base.revision + 1, Number.MAX_SAFE_INTEGER);
    next.updatedAt = now.toISOString();
    const json = JSON.stringify(next);
    let current;
    try {
      current = storage.getItem(DATA_KEY);
    } catch {
      return { ok: false, reason: 'unavailable', data: base };
    }
    if (current !== loaded.raw) continue; // 他タブの書き込みがあった
    try {
      storage.setItem(DATA_KEY, json);
    } catch (error) {
      return { ok: false, reason: 'write', error, data: base };
    }
    return { ok: true, data: next };
  }
  return { ok: false, reason: 'conflict' };
}

/** 1項目を反転して保存する */
export function applyToggle(storage, dateKey, field, slot, now = new Date()) {
  return updateData(storage, (data) => toggleField(data, dateKey, field, slot), now);
}

/** navigator.locks があればアプリ専用ロックで直列化する */
export async function withLock(fn) {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (locks && typeof locks.request === 'function') {
    return locks.request(LOCK_NAME, { mode: 'exclusive' }, () => fn());
  }
  return fn();
}
