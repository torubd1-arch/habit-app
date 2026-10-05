// 今日画面と日別編集で共通の入力コンポーネント。
// DOM は1回だけ生成し、クリックは container への委譲で1つだけ登録する。

import { BASIC_HABITS, SLEEP_ID, WATER_ID, WATER_SLOT_COUNT, WATER_UNIT_ML } from './habits.js';
import { waterCount } from './model.js';

const MAX_WATER_ML = WATER_SLOT_COUNT * WATER_UNIT_ML;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatMl(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function habitButton(field, icon, label) {
  const b = el('button', 'habit-row');
  b.type = 'button';
  b.dataset.field = field;
  b.setAttribute('aria-pressed', 'false');
  const mark = el('span', 'mark', '○');
  mark.setAttribute('aria-hidden', 'true');
  const ic = el('span', 'icon', icon);
  ic.setAttribute('aria-hidden', 'true');
  const text = el('span', 'habit-text');
  text.appendChild(el('span', 'habit-label', label));
  b.append(ic, text, mark);
  return b;
}

/**
 * mode: 'today'（睡眠は昨夜＝前日）| 'day'（すべて選択日）
 * onToggle(field, slot) を呼ぶ。保存先の決定は呼び出し側で行う。
 */
export function createRecordView(mode, onToggle) {
  const root = el('div', 'record-view');

  const list = el('div', 'habit-list');
  for (const h of BASIC_HABITS) list.appendChild(habitButton(h.id, h.icon, h.label));

  // 水
  const water = el('section', 'water-box');
  const waterHead = el('div', 'water-head');
  const waterTitle = el('h3', 'section-title');
  const wIcon = el('span', 'icon', '💧');
  wIcon.setAttribute('aria-hidden', 'true');
  waterTitle.append(wIcon, document.createTextNode('水'));
  const waterAmount = el('p', 'water-amount');
  waterAmount.setAttribute('aria-live', 'polite');
  waterHead.append(waterTitle, waterAmount);
  const slots = el('div', 'water-slots');
  for (let i = 0; i < WATER_SLOT_COUNT; i++) {
    const b = el('button', 'water-slot', '○');
    b.type = 'button';
    b.dataset.field = WATER_ID;
    b.dataset.slot = String(i);
    b.setAttribute('aria-label', `500mlの記録${i + 1}`);
    b.setAttribute('aria-pressed', 'false');
    slots.appendChild(b);
  }
  water.append(waterHead, slots, el('p', 'hint', `1回${WATER_UNIT_ML}ml`));

  // 睡眠
  const sleep = el('section', 'sleep-box');
  const sleepBtn = habitButton(
    SLEEP_ID,
    '🌙',
    mode === 'today' ? '昨夜24時までに寝た' : 'この日の夜、24時までに寝た',
  );
  const sleepTarget = el('span', 'habit-sub');
  sleepBtn.querySelector('.habit-text').appendChild(sleepTarget);
  sleep.appendChild(sleepBtn);

  // 保存失敗のインラインエラー
  const error = el('div', 'inline-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const errorText = el('p', '', '保存できませんでした。記録は変更されていません。');
  const retry = el('button', 'btn', '再試行');
  retry.type = 'button';
  error.append(errorText, retry);

  root.append(error, list, water, sleep);

  let retryAction = null;
  retry.addEventListener('click', () => {
    const action = retryAction;
    if (action) action();
  });

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-field]');
    if (!b || !root.contains(b) || b.getAttribute('aria-disabled') === 'true') return;
    const slot = b.dataset.slot !== undefined ? Number(b.dataset.slot) : null;
    onToggle(b.dataset.field, slot);
  });

  function setPressed(b, on) {
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('is-on', on);
    const mark = b.classList.contains('water-slot') ? b : b.querySelector('.mark');
    mark.textContent = on ? '✓' : '○';
  }

  return {
    el: root,
    /**
     * record: 通常6項目・水の対象日のレコード
     * sleepRecord: 睡眠の対象日のレコード
     */
    update({ record, sleepRecord, sleepLabel, disabled }) {
      for (const h of BASIC_HABITS) {
        setPressed(list.querySelector(`[data-field="${h.id}"]`), record[h.id] === true);
      }
      slots.querySelectorAll('button').forEach((b, i) => setPressed(b, record[WATER_ID][i] === true));
      const ml = waterCount(record) * WATER_UNIT_ML;
      waterAmount.textContent = `${formatMl(ml)} / ${formatMl(MAX_WATER_ML)} ml`;
      setPressed(sleepBtn, sleepRecord[SLEEP_ID] === true);
      sleepTarget.textContent = `記録先：${sleepLabel}`;
      for (const b of root.querySelectorAll('button[data-field]')) {
        b.setAttribute('aria-disabled', String(Boolean(disabled)));
      }
    },
    showError(onRetry) {
      retryAction = onRetry;
      error.hidden = false;
    },
    clearError() {
      retryAction = null;
      error.hidden = true;
    },
  };
}
