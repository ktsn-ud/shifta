import { z } from "zod";
import {
  DATE_ONLY_REGEX,
  TIME_ONLY_REGEX,
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

export class ShiftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiftValidationError";
  }
}

export const lessonRangeSchema = z
  .object({
    timetableSetId: z.string().min(1),
    startPeriod: z.coerce.number().int().positive(),
    endPeriod: z.coerce.number().int().positive(),
  })
  .strict();

export const shiftCommentSchema = z
  .string()
  .max(100, "コメントは100文字以内で入力してください")
  .refine((value) => !/[\r\n]/.test(value), {
    message: "コメントに改行は使用できません",
  })
  .nullable()
  .optional();

export const shiftInputSchema = z
  .object({
    workplaceId: z.string().min(1),
    date: z.string().regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください"),
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

    return {
      shiftData: {
        workplaceId: input.workplaceId,
        date,
        startTime: lessonTimes.startTime,
        endTime: lessonTimes.endTime,
        breakMinutes: lessonTimes.breakMinutes,
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

  return {
    shiftData: {
      workplaceId: input.workplaceId,
      date,
      startTime,
      endTime,
      breakMinutes: input.breakMinutes,
      shiftType: input.shiftType,
      comment,
    },
    lessonRange: null,
  };
}
