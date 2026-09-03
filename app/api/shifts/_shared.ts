import { z } from "zod";
import {
  DATE_ONLY_REGEX,
  TIME_ONLY_REGEX,
  isValidDateOnly,
  parseDateOnly,
  parseTimeOnly,
  toMinutes,
} from "@/lib/api/date-time";
import { prisma } from "@/lib/prisma";
import {
  resolveLessonTimeRangeFromRows as resolveLessonTimeRangeFromRowsShared,
  type LessonRangeInput,
  type LessonTimeRange,
} from "@/lib/shifts/lesson-time-range";
import {
  BREAK_MINUTES_INTEGER_MESSAGE,
  BREAK_MINUTES_RANGE_MESSAGE,
  MAX_BREAK_MINUTES,
  calculateGrossMinutes,
  getBreakMinutesValidationError,
} from "@/lib/shifts/break-validation";
import {
  MAX_TIMETABLE_PERIOD,
  TIMETABLE_PERIOD_LIMIT_MESSAGE,
} from "@/lib/validation/batch-limits";
import { MAX_TRANSPORTATION_ALLOWANCE } from "@/lib/shifts/transportation-allowance";

export class ShiftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiftValidationError";
  }
}

export const lessonRangeSchema = z.strictObject({
  timetableSetId: z.string().min(1),
  startPeriod: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_TIMETABLE_PERIOD, TIMETABLE_PERIOD_LIMIT_MESSAGE),
  endPeriod: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_TIMETABLE_PERIOD, TIMETABLE_PERIOD_LIMIT_MESSAGE),
});

export const shiftCommentSchema = z
  .string()
  .max(100, "コメントは100文字以内で入力してください")
  .refine((value) => !/[\r\n]/.test(value), {
    message: "コメントに改行は使用できません",
  })
  .nullable()
  .optional();

export const transportationAllowanceSchema = z.coerce
  .number()
  .int("交通費は整数円で入力してください")
  .min(0, "交通費は0円以上で入力してください")
  .max(
    MAX_TRANSPORTATION_ALLOWANCE,
    "交通費は2,147,483,647円以下で入力してください",
  )
  .default(0);

export const shiftInputSchema = z.strictObject({
  workplaceId: z.string().min(1),
  date: z
    .string()
    .regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください")
    .refine(isValidDateOnly, "実在する日付を入力してください"),
  shiftType: z.enum(["NORMAL", "LESSON"]),
  comment: shiftCommentSchema,
  startTime: z
    .string()
    .regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください")
    .optional(),
  endTime: z
    .string()
    .regex(TIME_ONLY_REGEX, "HH:MM形式で入力してください")
    .optional(),
  breakMinutes: z.coerce
    .number()
    .int(BREAK_MINUTES_INTEGER_MESSAGE)
    .min(0, BREAK_MINUTES_RANGE_MESSAGE)
    .max(MAX_BREAK_MINUTES, BREAK_MINUTES_RANGE_MESSAGE)
    .default(0),
  transportationAllowance: transportationAllowanceSchema,
  lessonRange: lessonRangeSchema.optional(),
});

export type ShiftInput = z.infer<typeof shiftInputSchema>;

export type BuiltShiftData = {
  shiftData: {
    workplaceId: string;
    date: Date;
    startTime: Date;
    endTime: Date;
    breakMinutes: number;
    transportationAllowance: number;
    shiftType: "NORMAL" | "LESSON";
    comment: string | null;
  };
  lessonRange: {
    timetableSetId: string;
    startPeriod: number;
    endPeriod: number;
  } | null;
};

export type LessonTimeRangeResolver = (
  workplaceId: string,
  lessonRange: z.infer<typeof lessonRangeSchema>,
) => Promise<LessonTimeRange>;

type BulkLessonRangeInput = {
  workplaceId: string;
  lessonRange: z.infer<typeof lessonRangeSchema>;
};

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

function normalizeShiftComment(comment: ShiftInput["comment"]): string | null {
  const trimmed = comment?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveLessonTimeRangeFromRows(
  lessonRange: LessonRangeInput,
  timetables: Array<{
    period: number;
    startTime: Date;
    endTime: Date;
  }>,
): LessonTimeRange {
  return resolveLessonTimeRangeFromRowsShared(
    lessonRange,
    timetables,
    (message) => new ShiftValidationError(message),
  );
}

/**
 * Resolves all lesson ranges in a batch with two reads, regardless of the
 * number of shifts. Callers still use the regular resolver contract so that
 * per-shift validation and error handling remain unchanged.
 */
export async function createBulkLessonTimeRangeResolver(
  inputs: BulkLessonRangeInput[],
): Promise<LessonTimeRangeResolver | undefined> {
  const requestedSets = Array.from(
    new Map(
      inputs.map((input) => [
        `${input.workplaceId}:${input.lessonRange.timetableSetId}`,
        {
          workplaceId: input.workplaceId,
          timetableSetId: input.lessonRange.timetableSetId,
        },
      ]),
    ).values(),
  );

  if (requestedSets.length === 0) {
    return undefined;
  }

  const ownedSets = await prisma.timetableSet.findMany({
    where: {
      OR: requestedSets.map((set) => ({
        id: set.timetableSetId,
        workplaceId: set.workplaceId,
      })),
    },
    select: {
      id: true,
      workplaceId: true,
    },
  });

  const ownedSetKeys = new Set(
    ownedSets.map((set) => `${set.workplaceId}:${set.id}`),
  );
  const ownedSetIds = new Set(ownedSets.map((set) => set.id));
  const timetableRows = await prisma.timetable.findMany({
    where: {
      timetableSetId: {
        in: Array.from(ownedSetIds),
      },
    },
    select: {
      timetableSetId: true,
      period: true,
      startTime: true,
      endTime: true,
    },
    orderBy: [{ timetableSetId: "asc" }, { period: "asc" }],
  });
  const periodMapBySetId = new Map<
    string,
    Map<number, { period: number; startTime: Date; endTime: Date }>
  >();

  for (const row of timetableRows) {
    if (!ownedSetIds.has(row.timetableSetId)) {
      continue;
    }

    const periods = periodMapBySetId.get(row.timetableSetId) ?? new Map();
    periods.set(row.period, {
      period: row.period,
      startTime: row.startTime,
      endTime: row.endTime,
    });
    periodMapBySetId.set(row.timetableSetId, periods);
  }

  return async (workplaceId, lessonRange) => {
    if (!ownedSetKeys.has(`${workplaceId}:${lessonRange.timetableSetId}`)) {
      throw new ShiftValidationError("選択した時間割セットが見つかりません");
    }

    const periodMap = periodMapBySetId.get(lessonRange.timetableSetId);
    if (!periodMap) {
      throw new ShiftValidationError("指定コマ範囲の時間割が不足しています");
    }

    const timetables: Array<{
      period: number;
      startTime: Date;
      endTime: Date;
    }> = [];
    for (
      let period = lessonRange.startPeriod;
      period <= lessonRange.endPeriod;
      period += 1
    ) {
      const row = periodMap.get(period);
      if (!row) {
        throw new ShiftValidationError("指定コマ範囲の時間割が不足しています");
      }
      timetables.push(row);
    }

    return resolveLessonTimeRangeFromRows(lessonRange, timetables);
  };
}

function validateBuiltBreakMinutes(input: {
  startTime: Date;
  endTime: Date;
  breakMinutes: number;
}): void {
  const message = getBreakMinutesValidationError(
    input.breakMinutes,
    calculateGrossMinutes(input.startTime, input.endTime),
  );
  if (message) {
    throw new ShiftValidationError(message);
  }
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
  const comment = normalizeShiftComment(input.comment);

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

    validateBuiltBreakMinutes(lessonTimes);

    return {
      shiftData: {
        workplaceId: input.workplaceId,
        date,
        startTime: lessonTimes.startTime,
        endTime: lessonTimes.endTime,
        breakMinutes: lessonTimes.breakMinutes,
        transportationAllowance: input.transportationAllowance,
        shiftType: input.shiftType,
        comment,
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

  validateBuiltBreakMinutes({
    startTime,
    endTime,
    breakMinutes: input.breakMinutes,
  });

  return {
    shiftData: {
      workplaceId: input.workplaceId,
      date,
      startTime,
      endTime,
      breakMinutes: input.breakMinutes,
      transportationAllowance: input.transportationAllowance,
      shiftType: input.shiftType,
      comment,
    },
    lessonRange: null,
  };
}
