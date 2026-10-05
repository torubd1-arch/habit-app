// 日付の純粋関数。記録日は端末のローカル暦日を YYYY-MM-DD 文字列で扱う。
// toISOString() による UTC 切り出しや new Date('YYYY-MM-DD') の解釈は使わない。

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

/** Date のローカル年月日から日付キーを作る */
export function toLocalDateKey(now) {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 日付キーを数値に分解する。実在しない日付・形式不正は null */
export function parseDateKey(key) {
  if (typeof key !== 'string') return null;
  const m = KEY_PATTERN.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  if (day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isValidDateKey(key) {
  return parseDateKey(key) !== null;
}

/** 月の日数（month は 1〜12） */
export function daysInMonth(year, month) {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** ローカル正午の Date を作る（夏時間の境界を避けるため正午を使う） */
export function dateKeyToLocalNoon(key) {
  const p = parseDateKey(key);
  if (!p) throw new RangeError(`不正な日付キー: ${key}`);
  const d = new Date(2000, 0, 1, 12, 0, 0, 0);
  d.setFullYear(p.year, p.month - 1, p.day);
  return d;
}

/** 暦日として days 日ずらす（ミリ秒の加減算はしない） */
export function shiftDateKey(key, days) {
  const d = dateKeyToLocalNoon(key);
  d.setDate(d.getDate() + days);
  return toLocalDateKey(d);
}

/** 今日画面の睡眠の記録先（前日） */
export function getSleepTargetDate(todayKey) {
  return shiftDateKey(todayKey, -1);
}

/** 曜日（0=日〜6=土） */
export function weekdayOf(key) {
  return dateKeyToLocalNoon(key).getDay();
}

/** 2026年10月5日（月） */
export function formatJaLong(key) {
  const p = parseDateKey(key);
  return `${p.year}年${p.month}月${p.day}日（${WEEKDAYS[weekdayOf(key)]}）`;
}

/** 10/4（日） */
export function formatJaShort(key) {
  const p = parseDateKey(key);
  return `${p.month}/${p.day}（${WEEKDAYS[weekdayOf(key)]}）`;
}

/** 次のローカル0時までのミリ秒 */
export function msUntilNextLocalMidnight(now) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return next.getTime() - now.getTime();
}

/** バックアップのファイル名用：2026-10-05-094000（端末ローカル） */
export function formatFileTimestamp(now) {
  return `${toLocalDateKey(now)}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

/** ISO UTC 文字列を端末ローカルの「2026年10月5日 9:40」に整形する */
export function formatLocalDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${pad(d.getMinutes())}`;
}

/** UTC の ISO 8601 文字列（末尾 Z）として有効か */
export function isValidIsoUtc(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?Z$/.exec(value);
  if (!m) return false;
  if (!isValidDateKey(`${m[1]}-${m[2]}-${m[3]}`)) return false;
  if (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6]) > 59) return false;
  return !Number.isNaN(Date.parse(value));
}
