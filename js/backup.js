// バックアップの書き出し・検証・置換読み込み・読み込み前に戻す。

import { formatFileTimestamp, isValidIsoUtc } from './dates.js';
import { isPlainObject, validateData } from './model.js';
import { DATA_KEY, PRE_IMPORT_KEY, parseStored } from './storage.js';

export const BACKUP_FORMAT = 'personal-habits-backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

const BACKUP_FIELDS = ['backupFormat', 'backupVersion', 'exportedAt', 'data'];

export function buildBackup(data, now = new Date()) {
  return {
    backupFormat: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data,
  };
}

export function backupToText(data, now = new Date()) {
  return JSON.stringify(buildBackup(data, now), null, 2);
}

export function backupFileName(now = new Date()) {
  return `habits-backup-${formatFileTimestamp(now)}.json`;
}

export function rawFileName(now = new Date()) {
  return `habits-raw-${formatFileTimestamp(now)}.txt`;
}

export function checkFileSize(size) {
  return Number.isFinite(size) && size >= 0 && size <= MAX_BACKUP_BYTES;
}

/** バックアップファイルの文字列を検証する。成功時は検証済みデータを返す */
export function validateBackupText(text) {
  if (typeof text !== 'string') return { ok: false, error: 'ファイルを読み込めませんでした' };
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) {
    return { ok: false, error: 'ファイルが大きすぎます（5MiBまで）' };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSONとして読み込めないファイルです' };
  }
  if (!isPlainObject(parsed)) return { ok: false, error: 'バックアップの形式が正しくありません' };
  if (parsed.backupFormat !== BACKUP_FORMAT) return { ok: false, error: 'このアプリのバックアップではありません' };
  if (parsed.backupVersion !== BACKUP_VERSION) return { ok: false, error: '対応していないバックアップのバージョンです' };
  const keys = Object.keys(parsed);
  if (keys.length !== BACKUP_FIELDS.length || !BACKUP_FIELDS.every((k) => Object.hasOwn(parsed, k))) {
    return { ok: false, error: 'バックアップに不明な項目または欠落があります' };
  }
  if (!isValidIsoUtc(parsed.exportedAt)) return { ok: false, error: '書き出し時刻の形式が不正です' };
  const res = validateData(parsed.data);
  if (!res.ok) return res;
  return { ok: true, data: res.data, exportedAt: parsed.exportedAt };
}

/** 確認画面用の概要 */
export function summarizeData(data) {
  const keys = Object.keys(data.records).sort();
  return {
    days: keys.length,
    oldest: keys[0] ?? null,
    newest: keys[keys.length - 1] ?? null,
  };
}

function currentRevision(storage) {
  try {
    const raw = storage.getItem(DATA_KEY);
    if (raw === null) return { raw: null, revision: 0 };
    const res = parseStored(raw);
    return { raw, revision: res.ok ? res.data.revision : 0 };
  } catch {
    return null;
  }
}

/**
 * 検証済みデータで現在の記録を置き換える。
 * 現在の主キーの元文字列を退避してから保存する。退避に失敗したら置き換えない。
 */
export function performImport(storage, imported, now = new Date()) {
  const cur = currentRevision(storage);
  if (!cur) return { ok: false, reason: 'read', message: '現在の記録を読み込めませんでした' };
  let previousPre = null;
  try {
    previousPre = storage.getItem(PRE_IMPORT_KEY);
  } catch {
    previousPre = null;
  }
  if (cur.raw !== null) {
    try {
      storage.setItem(PRE_IMPORT_KEY, cur.raw);
    } catch {
      return { ok: false, reason: 'backup', message: '現在の記録を退避できなかったため、読み込みを中止しました' };
    }
  }
  const next = {
    ...imported,
    records: { ...imported.records },
    revision: Math.min(Math.max(cur.revision, imported.revision) + 1, Number.MAX_SAFE_INTEGER),
    updatedAt: now.toISOString(),
  };
  try {
    storage.setItem(DATA_KEY, JSON.stringify(next));
  } catch {
    // 退避キーを元に戻す（主キーは変わっていない）
    try {
      if (previousPre === null) storage.removeItem(PRE_IMPORT_KEY);
      else storage.setItem(PRE_IMPORT_KEY, previousPre);
    } catch { /* 退避キーの復旧失敗は主キーに影響しない */ }
    return { ok: false, reason: 'write', message: '保存できませんでした。現在の記録はそのままです' };
  }
  if (cur.raw === null) {
    // 退避不要の場合、古い復元前コピーへ戻せないようにする
    try { storage.removeItem(PRE_IMPORT_KEY); } catch { /* 無視 */ }
  }
  return { ok: true, data: next };
}

/** 復元前コピーの状態：none | valid | corrupt */
export function inspectPreImport(storage) {
  let raw;
  try {
    raw = storage.getItem(PRE_IMPORT_KEY);
  } catch {
    return { state: 'none' };
  }
  if (raw === null) return { state: 'none' };
  const res = parseStored(raw);
  return res.ok ? { state: 'valid', data: res.data } : { state: 'corrupt' };
}

/** 読み込み前に戻す（1回分のみ）。成功後に退避キーを削除する */
export function revertImport(storage, now = new Date()) {
  const pre = inspectPreImport(storage);
  if (pre.state !== 'valid') return { ok: false, message: '戻せる記録がありません' };
  const cur = currentRevision(storage);
  const curRev = cur ? cur.revision : 0;
  const next = {
    ...pre.data,
    revision: Math.min(Math.max(curRev, pre.data.revision) + 1, Number.MAX_SAFE_INTEGER),
    updatedAt: now.toISOString(),
  };
  try {
    storage.setItem(DATA_KEY, JSON.stringify(next));
  } catch {
    return { ok: false, message: '保存できませんでした。現在の記録はそのままです' };
  }
  try { storage.removeItem(PRE_IMPORT_KEY); } catch { /* 無視 */ }
  return { ok: true, data: next };
}

/**
 * ファイルを共有シート（対応時）またはダウンロードで書き出す。
 * 戻り値: { method: 'share'|'download', cancelled?, failed? }
 * ユーザー操作の直後に呼ぶこと（share の前に await しない）。
 */
export async function saveFile(text, name, type) {
  const blob = new Blob([text], { type });
  let file = null;
  try {
    file = new File([blob], name, { type });
  } catch {
    file = null;
  }
  if (file && typeof navigator !== 'undefined' && navigator.canShare && navigator.share) {
    let can = false;
    try { can = navigator.canShare({ files: [file] }); } catch { can = false; }
    if (can) {
      try {
        await navigator.share({ files: [file] });
        return { method: 'share' };
      } catch (e) {
        if (e && e.name === 'AbortError') return { method: 'share', cancelled: true };
        return { method: 'share', failed: true };
      }
    }
  }
  downloadBlob(blob, name);
  return { method: 'download' };
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
