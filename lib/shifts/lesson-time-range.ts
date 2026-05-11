export type LessonRangeInput = {
  startPeriod: number;
  endPeriod: number;
};

export type LessonTimetableRow = {
  period: number;
  startTime: Date;
  endTime: Date;
};

export type LessonTimeRange = {
  startTime: Date;
  endTime: Date;
  breakMinutes: number;
};

type CreateError = (message: string) => Error;

function timeToMinutes(value: Date): number {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

function defaultCreateError(message: string): Error {
  return new Error(message);
}

export function resolveLessonTimeRangeFromRows(
  lessonRange: LessonRangeInput,
  timetables: LessonTimetableRow[],
  createError: CreateError = defaultCreateError,
): LessonTimeRange {
  const expectedCount = lessonRange.endPeriod - lessonRange.startPeriod + 1;
  if (timetables.length !== expectedCount) {
    throw createError("指定コマ範囲の時間割が不足しています");
  }

  for (let index = 0; index < timetables.length; index += 1) {
    const expectedPeriod = lessonRange.startPeriod + index;
    if (timetables[index]?.period !== expectedPeriod) {
      throw createError("コマ範囲に連続した時間割が存在しません");
    }
  }

  const first = timetables[0];
  const last = timetables[timetables.length - 1];

  if (!first || !last) {
    throw createError("指定コマ範囲の時間割が見つかりません");
  }

  if (first.startTime.getTime() === last.endTime.getTime()) {
    throw createError("コマ範囲から算出された時刻が不正です");
  }

  let breakMinutes = 0;
  let previousEndAbsoluteMinutes: number | null = null;

  for (const timetable of timetables) {
    let startAbsoluteMinutes = timeToMinutes(timetable.startTime);
    let endAbsoluteMinutes = timeToMinutes(timetable.endTime);

    if (endAbsoluteMinutes <= startAbsoluteMinutes) {
      endAbsoluteMinutes += 24 * 60;
    }

    if (previousEndAbsoluteMinutes !== null) {
      while (startAbsoluteMinutes < previousEndAbsoluteMinutes) {
        startAbsoluteMinutes += 24 * 60;
        endAbsoluteMinutes += 24 * 60;
      }

      breakMinutes += Math.max(
        0,
        startAbsoluteMinutes - previousEndAbsoluteMinutes,
      );
    }

    previousEndAbsoluteMinutes = endAbsoluteMinutes;
  }

  return {
    startTime: first.startTime,
    endTime: last.endTime,
    breakMinutes,
  };
}
