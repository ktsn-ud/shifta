import { z } from "zod";
import {
  DATE_ONLY_REGEX,
  TIME_ONLY_REGEX,
  parseDateOnly,
  parseTimeOnly,
  toMinutes,
} from "@/lib/api/date-time";
import { prisma } from "@/lib/prisma";

export class ShiftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiftValidationError";
  }
}

type TimetableRow = {
  period: number;
  startTime: Date;
  endTime: Date;
};

function timeToMinutes(value: Date): number {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

export const lessonRangeSchema = z
  .object({
    timetableSetId: z.string().min(1),
    startPeriod: z.coerce.number().int().positive(),
    endPeriod: z.coerce.number().int().positive(),
  })
  .strict();

export const shiftInputSchema = z
  .object({
    workplaceId: z.string().min(1),
    date: z.string().regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください"),
    shiftType: z.enum(["NORMAL", "LESSON"]),
    startTime: z
      .string()
      .regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください")
      .optional(),
    endTime: z
      .string()
      .regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください")
      .optional(),
    breakMinutes: z.coerce.number().int().min(0).default(0),
    lessonRange: lessonRangeSchema.optional(),
  })
  .strict();

export type ShiftInput = z.infer<typeof shiftInputSchema>;

export type BuiltShiftData = {
  shiftData: {
    workplaceId: string;
    date: Date;
    startTime: Date;
    endTime: Date;
    breakMinutes: number;
    shiftType: "NORMAL" | "LESSON";
  };
  lessonRange: {
    timetableSetId: string;
    startPeriod: number;
    endPeriod: number;
  } | null;
};

export type LessonTimeRange = {
  startTime: Date;
  endTime: Date;
  breakMinutes: number;
};

export type LessonTimeRangeResolver = (
  workplaceId: string,
  lessonRange: z.infer<typeof lessonRangeSchema>,
) => Promise<LessonTimeRange>;

function validateShiftInput(input: ShiftInput) {
  if (input.shiftType === "LESSON") {
    if (!input.lessonRange) {
      throw new ShiftValidationError(
        "shiftType=LESSON の場合 lessonRange は必須です",
      );
    }

    if (input.startTime || input.endTime) {
      throw new ShiftValidationError(
        "shiftType=LESSON では startTime/endTime は指定できません",
      );
    }

    if (input.lessonRange.startPeriod > input.lessonRange.endPeriod) {
      throw new ShiftValidationError(
        "startPeriod は endPeriod 以下で指定してください",
      );
    }

    return;
  }

  if (input.lessonRange) {
    throw new ShiftValidationError(
      "shiftType が LESSON 以外の場合 lessonRange は指定できません",
    );
  }

  if (!input.startTime || !input.endTime) {
    throw new ShiftValidationError(
      "shiftType が LESSON 以外の場合 startTime と endTime は必須です",
    );
  }

  if (toMinutes(input.startTime) === toMinutes(input.endTime)) {
    throw new ShiftValidationError(
      "startTime と endTime は同じ時刻にできません",
    );
  }
}

export function resolveLessonTimeRangeFromRows(
  lessonRange: z.infer<typeof lessonRangeSchema>,
  timetables: TimetableRow[],
): LessonTimeRange {
  const expectedCount = lessonRange.endPeriod - lessonRange.startPeriod + 1;
  if (timetables.length !== expectedCount) {
    throw new ShiftValidationError("指定コマ範囲の時間割が不足しています");
  }

  for (let index = 0; index < timetables.length; index += 1) {
    const expectedPeriod = lessonRange.startPeriod + index;
    if (timetables[index]?.period !== expectedPeriod) {
      throw new ShiftValidationError("コマ範囲に連続した時間割が存在しません");
    }
  }

  const first = timetables[0];
  const last = timetables[timetables.length - 1];

  if (!first || !last) {
    throw new ShiftValidationError("指定コマ範囲の時間割が見つかりません");
  }

  if (first.startTime.getTime() === last.endTime.getTime()) {
    throw new ShiftValidationError("コマ範囲から算出された時刻が不正です");
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

async function resolveLessonTimeRangeFromDatabase(
  workplaceId: string,
  lessonRange: z.infer<typeof lessonRangeSchema>,
): Promise<LessonTimeRange> {
  const set = await prisma.timetableSet.findFirst({
    where: {
      id: lessonRange.timetableSetId,
      workplaceId,
    },
    select: {
      id: true,
    },
  });
  if (!set) {
    throw new ShiftValidationError("選択した時間割セットが見つかりません");
  }

  const timetables = await prisma.timetable.findMany({
    where: {
      timetableSetId: lessonRange.timetableSetId,
      period: {
        gte: lessonRange.startPeriod,
        lte: lessonRange.endPeriod,
      },
    },
    select: {
      period: true,
      startTime: true,
      endTime: true,
    },
    orderBy: {
      period: "asc",
    },
  });

  return resolveLessonTimeRangeFromRows(lessonRange, timetables);
}

export async function buildShiftData(
  input: ShiftInput,
  workplaceType: "GENERAL" | "CRAM_SCHOOL",
  options?: {
    lessonTimeRangeResolver?: LessonTimeRangeResolver;
  },
): Promise<BuiltShiftData> {
  validateShiftInput(input);

  const date = parseDateOnly(input.date);

  if (input.shiftType === "LESSON") {
    if (workplaceType !== "CRAM_SCHOOL") {
      throw new ShiftValidationError(
        "LESSON は CRAM_SCHOOL 勤務先でのみ登録できます",
      );
    }

    const lessonRange = input.lessonRange;
    if (!lessonRange) {
      throw new ShiftValidationError("lessonRange が指定されていません");
    }

    const lessonTimeRangeResolver =
      options?.lessonTimeRangeResolver ?? resolveLessonTimeRangeFromDatabase;
    const lessonTimes = await lessonTimeRangeResolver(
      input.workplaceId,
      lessonRange,
    );

    return {
      shiftData: {
        workplaceId: input.workplaceId,
        date,
        startTime: lessonTimes.startTime,
        endTime: lessonTimes.endTime,
        breakMinutes: lessonTimes.breakMinutes,
        shiftType: input.shiftType,
      },
      lessonRange: {
        timetableSetId: lessonRange.timetableSetId,
        startPeriod: lessonRange.startPeriod,
        endPeriod: lessonRange.endPeriod,
      },
    };
  }

  const startTime = parseTimeOnly(input.startTime ?? "00:00");
  const endTime = parseTimeOnly(input.endTime ?? "00:00");

  return {
    shiftData: {
      workplaceId: input.workplaceId,
      date,
      startTime,
      endTime,
      breakMinutes: input.breakMinutes,
      shiftType: input.shiftType,
    },
    lessonRange: null,
  };
}
