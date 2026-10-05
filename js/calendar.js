// 月間カレンダーの生成とフィルター表示。

import { BOOLEAN_FIELDS, FILTERS, WATER_ID, WATER_SLOT_COUNT } from './habits.js';
import { daysInMonth, formatJaShort, toLocalDateKey } from './dates.js';
import { achievedCount, getRecord, isEmptyRecord, waterCount } from './model.js';

const WEEK_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 月曜始まりの週配列。月外は null。month は 1〜12 */
export function buildMonthGrid(year, month) {
  const first = new Date(2000, 0, 1, 12);
  first.setFullYear(year, month - 1, 1);
  const lead = (first.getDay() + 6) % 7; // 月曜=0
  const total = daysInMonth(year, month);
  const cells = new Array(lead).fill(null);
  for (let d = 1; d <= total; d++) cells.push(`${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function shiftMonth(year, month, delta) {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** 全体表示の濃淡段階（0〜4）。達成数 0〜7 を4段階にまとめる */
export function overallLevel(count) {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 6) return 3;
  return 4;
}

/** セルに表示する内容（純粋関数） */
export function cellSummary(data, dateKey, filter) {
  const rec = getRecord(data, dateKey);
  if (filter === 'all') {
    const achieved = achievedCount(rec);
    const water = waterCount(rec);
    return { kind: 'all', empty: isEmptyRecord(rec), achieved, water, level: overallLevel(achieved) };
  }
  if (filter === WATER_ID) {
    const count = waterCount(rec);
    return { kind: 'water', count, level: count };
  }
  return { kind: 'bool', done: rec[filter] === true, level: rec[filter] === true ? 4 : 0 };
}

function filterLabel(filter) {
  return (FILTERS.find((f) => f.id === filter) || FILTERS[0]).label;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** フィルターチップを描画する（1回だけ生成し、状態は updateChips で更新） */
export function renderChips(container, onSelect) {
  container.textContent = '';
  for (const f of FILTERS) {
    const b = el('button', 'chip', f.label);
    b.type = 'button';
    b.dataset.filter = f.id;
    b.setAttribute('aria-pressed', 'false');
    container.appendChild(b);
  }
  container.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-filter]');
    if (b) onSelect(b.dataset.filter);
  });
}

export function updateChips(container, filter) {
  for (const b of container.querySelectorAll('button[data-filter]')) {
    b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
  }
}

/** 月間グリッドを描画する */
export function renderGrid(container, { year, month, data, filter, todayKey, selectedKey }) {
  const grid = el('div', 'cal-grid');
  grid.setAttribute('role', 'group');
  for (const w of WEEK_LABELS) {
    const h = el('div', 'cal-weekday', w);
    h.setAttribute('aria-hidden', 'true');
    grid.appendChild(h);
  }
  for (const week of buildMonthGrid(year, month)) {
    for (const key of week) {
      if (!key) {
        grid.appendChild(el('div', 'cal-cell cal-out'));
        continue;
      }
      const day = Number(key.slice(8));
      const future = key > todayKey;
      const cell = el(future ? 'div' : 'button', 'cal-cell');
      if (!future) {
        cell.type = 'button';
        cell.dataset.date = key;
        cell.setAttribute('aria-pressed', String(key === selectedKey));
      }
      if (key === todayKey) {
        cell.classList.add('is-today');
        cell.setAttribute('aria-current', 'date');
      }
      if (key === selectedKey) cell.classList.add('is-selected');
      cell.appendChild(el('span', 'cal-day', String(day)));
      const labelParts = [formatJaShort(key)];
      if (key === todayKey) labelParts.push('今日');

      if (future) {
        cell.classList.add('is-future');
        labelParts.push('未来の日付');
      } else {
        const s = cellSummary(data, key, filter);
        cell.classList.add(`lv-${s.kind}-${s.level}`);
        if (s.kind === 'all') {
          if (s.empty) {
            cell.appendChild(el('span', 'cal-dash', '—'));
            labelParts.push('記録なし');
          } else {
            cell.appendChild(el('span', 'cal-line', `✓${s.achieved}/${BOOLEAN_FIELDS.length}`));
            cell.appendChild(el('span', 'cal-line', `水${s.water}/${WATER_SLOT_COUNT}`));
            labelParts.push(`${BOOLEAN_FIELDS.length}項目中${s.achieved}項目達成`, `水${s.water}回`);
          }
        } else if (s.kind === 'water') {
          cell.appendChild(el('span', 'cal-line', `${s.count}/${WATER_SLOT_COUNT}`));
          labelParts.push(`水${s.count}回`);
        } else {
          cell.appendChild(el('span', 'cal-mark', s.done ? '✓' : ''));
          labelParts.push(`${filterLabel(filter)}${s.done ? '達成' : '未チェック'}`);
        }
      }
      cell.setAttribute('aria-label', labelParts.join('、'));
      grid.appendChild(cell);
    }
  }
  container.replaceChildren(grid);
}

/** 凡例を描画する */
export function renderLegend(container, filter) {
  container.textContent = '';
  if (filter === 'all') {
    container.appendChild(el('span', '', `✓：${BOOLEAN_FIELDS.length}項目の達成数／水：500mlの回数`));
    container.appendChild(el('span', 'legend-sub', '—：記録なし（未記録または未達成）'));
    return;
  }
  if (filter === WATER_ID) {
    const row = el('span', 'legend-scale');
    for (let i = 0; i <= WATER_SLOT_COUNT; i++) row.appendChild(el('span', `legend-swatch lv-water-${i}`, String(i)));
    container.appendChild(row);
    container.appendChild(el('span', 'legend-sub', '数字：500mlの回数（0〜4回）'));
    return;
  }
  container.appendChild(el('span', '', `✓：${filterLabel(filter)}を記録した日`));
}

export function currentMonthOf(now = new Date()) {
  const key = toLocalDateKey(now);
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
}
