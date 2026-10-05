// 初期化、タブ切り替え、復帰・日付変更、イベント処理。

import {
  formatJaLong,
  formatJaShort,
  formatLocalDateTime,
  getSleepTargetDate,
  msUntilNextLocalMidnight,
  toLocalDateKey,
} from './dates.js';
import { createEmptyData, getRecord, resolveTargetDate } from './model.js';
import { DATA_KEY, PRE_IMPORT_KEY, applyToggle, checkWritable, loadData, withLock } from './storage.js';
import {
  backupFileName,
  backupToText,
  checkFileSize,
  downloadBlob,
  inspectPreImport,
  performImport,
  rawFileName,
  revertImport,
  saveFile,
  summarizeData,
  validateBackupText,
} from './backup.js';
import {
  currentMonthOf,
  renderChips,
  renderGrid,
  renderLegend,
  shiftMonth,
  updateChips,
} from './calendar.js';
import { createRecordView } from './record-view.js';

const $ = (id) => document.getElementById(id);

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = getStorage();

const state = {
  status: 'empty', // empty | ok | corrupt | unavailable
  data: createEmptyData(new Date().toISOString()),
  raw: null,
  writable: false,
  tab: 'today',
  todayKey: toLocalDateKey(new Date()),
  calYear: 0,
  calMonth: 0,
  filter: 'all',
  selectedKey: null,
  busy: false,
  pendingImport: null,
  swState: 'pending', // pending | ready | failed | unsupported
};

let todayView;
let dayView;
let noticeTimer = null;
let midnightTimer = null;
let wasHidden = false;

// ---------- データ読み込み ----------

function reload() {
  if (!storage) {
    state.status = 'unavailable';
    return;
  }
  const res = loadData(storage);
  state.status = res.status;
  state.raw = res.raw;
  state.data = res.data || createEmptyData(new Date().toISOString());
}

function inputsEnabled() {
  return state.writable && (state.status === 'ok' || state.status === 'empty');
}

// ---------- 描画 ----------

function renderBanner() {
  const banner = $('banner');
  let msg = '';
  if (state.status === 'corrupt') {
    msg = '保存データを読み込めないため、入力を停止しています。設定から「保存データをそのまま書き出す」で退避し、正常なバックアップを読み込んで復旧してください。';
  } else if (!state.writable || state.status === 'unavailable') {
    msg = '保存できません。通常のブラウザで開くか、空き容量・ブラウザ設定を確認してください。';
  }
  banner.textContent = msg;
  banner.hidden = msg === '';
}

function renderToday() {
  $('today-title').textContent = formatJaLong(state.todayKey);
  const sleepKey = getSleepTargetDate(state.todayKey);
  todayView.update({
    record: getRecord(state.data, state.todayKey),
    sleepRecord: getRecord(state.data, sleepKey),
    sleepLabel: formatJaShort(sleepKey),
    disabled: !inputsEnabled(),
  });
}

function renderCalendarGrid() {
  renderGrid($('cal-grid'), {
    year: state.calYear,
    month: state.calMonth,
    data: state.data,
    filter: state.filter,
    todayKey: state.todayKey,
    selectedKey: state.selectedKey,
  });
}

function renderCalendar() {
  $('cal-title').textContent = `${state.calYear}年${state.calMonth}月`;
  updateChips($('cal-filters'), state.filter);
  renderCalendarGrid();
  renderLegend($('cal-legend'), state.filter);
  renderDayEdit();
}

function renderDayEdit() {
  const panel = $('day-edit');
  const key = state.selectedKey;
  if (!key) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $('day-edit-title').textContent = `${formatJaLong(key)}の記録`;
  const rec = getRecord(state.data, key);
  dayView.update({
    record: rec,
    sleepRecord: rec,
    sleepLabel: formatJaShort(key),
    disabled: !inputsEnabled() || key > state.todayKey,
  });
}

function renderSettings() {
  const hasData = state.status === 'ok' || state.status === 'empty';
  $('export-btn').disabled = !hasData;
  $('raw-export-area').hidden = state.status !== 'corrupt';
  $('import-btn').disabled = !state.writable;

  const pre = storage ? inspectPreImport(storage) : { state: 'none' };
  const area = $('revert-area');
  area.hidden = pre.state === 'none';
  $('revert-btn').disabled = pre.state !== 'valid' || !state.writable;
  $('revert-note').textContent = pre.state === 'corrupt' ? '読み込み前のコピーが壊れているため戻せません。' : '前回の読み込み前の記録に1回だけ戻せます。';
  if (pre.state !== 'valid') $('revert-confirm').hidden = true;

  const offline = $('offline-status');
  offline.textContent = state.swState === 'ready'
    ? 'オフラインでも使えます。'
    : state.swState === 'pending' ? 'オフライン利用を準備しています…' : 'オフライン利用の準備ができていません。';
}

function renderAll() {
  renderBanner();
  renderToday();
  renderCalendar();
  renderSettings();
}

function showTab(tab) {
  state.tab = tab;
  for (const name of ['today', 'calendar', 'settings']) {
    $(`view-${name}`).hidden = name !== tab;
  }
  for (const b of document.querySelectorAll('.tabbar button')) {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}

function showTodayNotice(text) {
  const n = $('today-notice');
  n.textContent = text;
  n.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { n.hidden = true; }, 5000);
}

// ---------- 今日の再計算 ----------

/** 現在の今日を再計算する。変わっていれば true */
function refreshTodayKey() {
  const now = toLocalDateKey(new Date());
  if (now === state.todayKey) return false;
  state.todayKey = now;
  return true;
}

function scheduleMidnight() {
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(() => {
    if (refreshTodayKey()) {
      renderToday();
      renderCalendar();
    }
    scheduleMidnight();
  }, msUntilNextLocalMidnight(new Date()) + 500);
}

function returnToToday() {
  reload();
  refreshTodayKey();
  state.selectedKey = null;
  todayView.clearError();
  dayView.clearError();
  renderAll();
  showTab('today');
  scheduleMidnight();
}

// ---------- 入力 ----------

async function handleToggle(mode, field, slot) {
  if (state.busy || !inputsEnabled()) return;
  const view = mode === 'today' ? todayView : dayView;
  let baseKey;
  if (mode === 'today') {
    // 表示中の今日と操作直前の今日が違う場合は保存しない
    if (refreshTodayKey()) {
      renderToday();
      renderCalendar();
      showTodayNotice('日付が変わりました。もう一度タップしてください');
      return;
    }
    baseKey = state.todayKey;
  } else {
    if (refreshTodayKey()) renderCalendar();
    baseKey = state.selectedKey;
    if (!baseKey || baseKey > state.todayKey) return; // 未来日は編集不可
  }
  const target = resolveTargetDate(mode, field, baseKey);

  state.busy = true;
  document.body.classList.add('is-busy');
  let result;
  try {
    result = await withLock(() => applyToggle(storage, target, field, slot, new Date()));
  } catch {
    result = { ok: false, reason: 'write' };
  } finally {
    state.busy = false;
    document.body.classList.remove('is-busy');
  }

  if (result.ok) {
    state.data = result.data;
    state.status = 'ok';
    view.clearError();
  } else if (result.reason === 'corrupt') {
    reload();
    renderBanner();
  } else {
    // 失敗時は保存済みの最新状態を表示し、成功状態を残さない
    reload();
    view.showError(() => {
      view.clearError();
      handleToggle(mode, field, slot);
    });
  }
  renderToday();
  renderCalendarGrid();
  renderDayEdit();
}

// ---------- カレンダー ----------

function selectDay(key) {
  if (key > state.todayKey) return;
  state.selectedKey = key;
  dayView.clearError();
  renderCalendarGrid();
  renderDayEdit();
  // 見出しと最初の入力が見えない位置にあるときだけ瞬時にスクロールする
  const head = $('day-edit-title');
  const rect = head.getBoundingClientRect();
  const navHeight = document.querySelector('.tabbar').offsetHeight;
  if (rect.top < 0 || rect.bottom > window.innerHeight - navHeight - 120) {
    head.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

function moveMonth(delta) {
  const m = shiftMonth(state.calYear, state.calMonth, delta);
  state.calYear = m.year;
  state.calMonth = m.month;
  state.selectedKey = null;
  renderCalendar();
}

// ---------- 設定・バックアップ ----------

function setMsg(id, text, isError = false) {
  const m = $(id);
  m.textContent = text;
  m.classList.toggle('is-error', isError);
}

async function exportBackup(forceDownload = false) {
  setMsg('export-msg', '');
  $('export-download-btn').hidden = true;
  // 書き出し直前に最新を読む
  reload();
  if (state.status !== 'ok' && state.status !== 'empty') {
    renderAll();
    setMsg('export-msg', '保存データを読み込めないため書き出せません。', true);
    return;
  }
  const now = new Date();
  const text = backupToText(state.data, now);
  const name = backupFileName(now);
  if (forceDownload) {
    downloadBlob(new Blob([text], { type: 'application/json' }), name);
    setMsg('export-msg', 'ダウンロードを開始しました。保存先を確認してください。');
    return;
  }
  const res = await saveFile(text, name, 'application/json');
  if (res.cancelled) return;
  if (res.failed) {
    setMsg('export-msg', '共有できませんでした。「ダウンロードで書き出す」を試してください。', true);
    $('export-download-btn').hidden = false;
    return;
  }
  setMsg('export-msg', res.method === 'share'
    ? '共有シートで選んだ保存先を確認してください。'
    : 'ダウンロードを開始しました。保存先を確認してください。');
}

async function exportRaw() {
  let raw = null;
  try { raw = storage.getItem(DATA_KEY); } catch { raw = null; }
  if (raw === null) {
    setMsg('raw-export-msg', '保存データが見つかりません。', true);
    return;
  }
  const res = await saveFile(raw, rawFileName(new Date()), 'text/plain');
  if (res.failed) {
    downloadBlob(new Blob([raw], { type: 'text/plain' }), rawFileName(new Date()));
  }
  if (!res.cancelled) setMsg('raw-export-msg', '書き出しを開始しました。保存先を確認してください。');
}

async function onImportFile(e) {
  const input = e.target;
  const file = input.files && input.files[0];
  input.value = ''; // 同じファイルを再選択できるようにする
  hideImportConfirm();
  setMsg('import-msg', '');
  if (!file) return;
  if (!checkFileSize(file.size)) {
    setMsg('import-msg', 'ファイルが大きすぎます（5MiBまで）。', true);
    return;
  }
  let text;
  try {
    text = await file.text();
  } catch {
    setMsg('import-msg', 'ファイルを読み込めませんでした。', true);
    return;
  }
  const res = validateBackupText(text);
  if (!res.ok) {
    setMsg('import-msg', `読み込めません：${res.error}`, true);
    return;
  }
  state.pendingImport = res.data;
  const s = summarizeData(res.data);
  $('ic-days').textContent = s.days === 0 ? '0日（空のバックアップ）' : `${s.days}日`;
  $('ic-oldest').textContent = s.oldest ? formatJaLong(s.oldest) : '—';
  $('ic-newest').textContent = s.newest ? formatJaLong(s.newest) : '—';
  $('ic-exported').textContent = formatLocalDateTime(res.exportedAt);
  $('import-confirm').hidden = false;
  $('import-apply').focus();
}

function hideImportConfirm() {
  state.pendingImport = null;
  $('import-confirm').hidden = true;
}

function applyImport() {
  const data = state.pendingImport;
  if (!data) return;
  const res = performImport(storage, data, new Date());
  hideImportConfirm();
  if (!res.ok) {
    setMsg('import-msg', res.message, true);
    renderSettings();
    return;
  }
  setMsg('import-msg', '');
  returnToToday();
  showTodayNotice('読み込みました');
}

function applyRevert() {
  $('revert-confirm').hidden = true;
  const res = revertImport(storage, new Date());
  if (!res.ok) {
    setMsg('revert-msg', res.message, true);
    renderSettings();
    return;
  }
  setMsg('revert-msg', '');
  returnToToday();
  showTodayNotice('読み込み前の記録に戻しました');
}

// ---------- Service Worker ----------

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    state.swState = 'unsupported';
    return;
  }
  navigator.serviceWorker.register('./sw.js').then(
    () => navigator.serviceWorker.ready.then(() => {
      state.swState = 'ready';
      renderSettings();
    }),
    () => {
      state.swState = 'failed';
      renderSettings();
    },
  );
}

// ---------- 初期化 ----------

function init() {
  state.writable = checkWritable(storage);
  const m = currentMonthOf(new Date());
  state.calYear = m.year;
  state.calMonth = m.month;

  todayView = createRecordView('today', (field, slot) => handleToggle('today', field, slot));
  $('today-record').appendChild(todayView.el);
  dayView = createRecordView('day', (field, slot) => handleToggle('day', field, slot));
  $('day-record').appendChild(dayView.el);

  renderChips($('cal-filters'), (filter) => {
    state.filter = filter;
    updateChips($('cal-filters'), filter);
    renderCalendarGrid();
    renderLegend($('cal-legend'), filter);
  });
  $('cal-grid').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-date]');
    if (b) selectDay(b.dataset.date);
  });
  $('cal-prev').addEventListener('click', () => moveMonth(-1));
  $('cal-next').addEventListener('click', () => moveMonth(1));
  $('cal-this').addEventListener('click', () => {
    refreshTodayKey();
    const cm = currentMonthOf(new Date());
    state.calYear = cm.year;
    state.calMonth = cm.month;
    state.selectedKey = null;
    renderCalendar();
  });
  $('day-edit-close').addEventListener('click', () => {
    const key = state.selectedKey;
    state.selectedKey = null;
    renderCalendarGrid();
    renderDayEdit();
    const cell = key && $('cal-grid').querySelector(`button[data-date="${key}"]`);
    if (cell) cell.focus();
  });

  for (const b of document.querySelectorAll('.tabbar button')) {
    b.addEventListener('click', () => {
      const tab = b.dataset.tab;
      if (tab === 'today') {
        reload();
        refreshTodayKey();
        renderBanner();
        renderToday();
      } else if (tab === 'calendar') {
        refreshTodayKey();
        renderCalendar();
      } else {
        renderSettings();
      }
      showTab(tab);
    });
  }

  $('export-btn').addEventListener('click', () => exportBackup(false));
  $('export-download-btn').addEventListener('click', () => exportBackup(true));
  $('raw-export-btn').addEventListener('click', exportRaw);
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', onImportFile);
  $('import-apply').addEventListener('click', applyImport);
  $('import-cancel').addEventListener('click', () => {
    hideImportConfirm();
    setMsg('import-msg', '読み込みを取り消しました。記録は変更されていません。');
  });
  $('revert-btn').addEventListener('click', () => {
    $('revert-confirm').hidden = false;
    $('revert-apply').focus();
  });
  $('revert-apply').addEventListener('click', applyRevert);
  $('revert-cancel').addEventListener('click', () => { $('revert-confirm').hidden = true; });

  // 復帰：hidden → visible で今日へ戻す
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      wasHidden = true;
    } else if (wasHidden) {
      wasHidden = false;
      returnToToday();
    }
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) returnToToday();
  });
  // フォーカス時は最新を読み直す（表示中の画面は維持）
  window.addEventListener('focus', () => {
    reload();
    refreshTodayKey();
    renderAll();
  });
  // 他タブの変更を反映
  window.addEventListener('storage', (e) => {
    if (e.key === DATA_KEY || e.key === PRE_IMPORT_KEY || e.key === null) {
      reload();
      renderAll();
    }
  });
  // タイマーが止まっていた場合の保険
  setInterval(() => {
    if (refreshTodayKey()) {
      renderToday();
      renderCalendar();
    }
  }, 60 * 1000);

  reload();
  renderAll();
  showTab('today');
  scheduleMidnight();
  registerServiceWorker();
}

init();
