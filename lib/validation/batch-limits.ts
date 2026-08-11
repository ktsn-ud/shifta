/**
 * Shared client-safe limits for bounded batch mutations.
 */
export const MAX_BULK_SHIFT_COUNT = 31;
export const MAX_TIMETABLE_ITEMS_PER_SET = 30;
export const MAX_TIMETABLE_PERIOD = MAX_TIMETABLE_ITEMS_PER_SET;
export const MAX_BULK_TIMETABLE_SET_COUNT = 20;

export const BULK_SHIFT_LIMIT_MESSAGE = `一括登録は${MAX_BULK_SHIFT_COUNT}件までです。`;
export const TIMETABLE_ITEMS_PER_SET_LIMIT_MESSAGE = `時間割セットのコマは${MAX_TIMETABLE_ITEMS_PER_SET}件までです。`;
export const TIMETABLE_PERIOD_LIMIT_MESSAGE = `コマ番号は${MAX_TIMETABLE_PERIOD}以下の整数で入力してください。`;
export const BULK_TIMETABLE_SET_COUNT_LIMIT_MESSAGE = `時間割セットの一括作成は${MAX_BULK_TIMETABLE_SET_COUNT}件までです。`;
