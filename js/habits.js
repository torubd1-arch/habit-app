// 習慣の定義。ラベル・順序・アイコンはデータに保存せず、ここで管理する。

/** 今日画面に並ぶ通常の6項目（表示順） */
export const BASIC_HABITS = Object.freeze([
  { id: 'stretch', label: 'ストレッチ', short: 'ストレッチ', icon: '🧘' },
  { id: 'putting', label: 'パター練習', short: 'パター', icon: '⛳' },
  { id: 'alcoholFree', label: '禁酒', short: '禁酒', icon: '🍵' },
  { id: 'appDevelopment', label: 'アプリ開発', short: 'アプリ開発', icon: '💻' },
  { id: 'strength', label: '筋トレ', short: '筋トレ', icon: '💪' },
  { id: 'bike', label: 'エアロバイク', short: 'エアロバイク', icon: '🚴' },
]);

export const SLEEP_ID = 'sleepByMidnight';
export const WATER_ID = 'waterSlots';
export const WATER_SLOT_COUNT = 4;
export const WATER_UNIT_ML = 500;

/** 達成数（✓n/7）の対象となる boolean 7項目 */
export const BOOLEAN_FIELDS = Object.freeze([...BASIC_HABITS.map((h) => h.id), SLEEP_ID]);

/** 1日分のレコードが持つキー（これ以外は受け付けない） */
export const RECORD_FIELDS = Object.freeze([...BOOLEAN_FIELDS, WATER_ID]);

/** カレンダーのフィルターチップ（表示順） */
export const FILTERS = Object.freeze([
  { id: 'all', label: '全体' },
  { id: 'stretch', label: 'ストレッチ' },
  { id: 'putting', label: 'パター' },
  { id: 'alcoholFree', label: '禁酒' },
  { id: 'appDevelopment', label: 'アプリ開発' },
  { id: WATER_ID, label: '水' },
  { id: 'strength', label: '筋トレ' },
  { id: 'bike', label: 'エアロバイク' },
  { id: SLEEP_ID, label: '24時までに寝た' },
]);
