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

export const lessonRangeSchema = z
  .object({
    startPeriod: z.coerce.number().int().positive(),
    endPeriod: z.coerce.number().int().positive(),
    lessonType: z.enum(["NORMAL", "INTENSIVE"]),
  })
  .strict();

export const shiftInputSchema = z
  .object({
    workplaceId: z.string().min(1),
    date: z.string().regex(DATE_ONLY_REGEX, "YYYY-MM-DD形式で入力してください"),
    shiftType: z.enum(["NORMAL", "LESSON", "OTHER"]),
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
    shiftType: "NORMAL" | "LESSON" | "OTHER";
  };
  lessonRange: {
    startPeriod: number;
    endPeriod: number;
  } | null;
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

async function resolveLessonTimeRange(
  workplaceId: string,
  lessonRange: z.infer<typeof lessonRangeSchema>,
) {
  const timetables = await prisma.timetable.findMany({
    where: {
      workplaceId,
      type: lessonRange.lessonType,
      period: {
        gte: lessonRange.startPeriod,
        lte: lessonRange.endPeriod,
      },
    },
    orderBy: { period: "asc" },
  });

  const expectedCount = lessonRange.endPeriod - lessonRange.startPeriod + 1;
  if (timetables.length !== expectedCount) {
    throw new ShiftValidationError("指定コマ範囲の時間割が不足しています");
  }

  for (let index = 0; index < timetables.length; index += 1) {
    const expectedPeriod = lessonRange.startPeriod + index;
    if (timetables[index]?.period !== expectedPeriod) {
      throw new ShiftValidationError("コマ範囲に連続した時間割が存在しません");
    }

    if (timetables[index]?.type !== lessonRange.lessonType) {
      throw new ShiftValidationError("lessonType が統一されていません");
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

  return {
    startTime: first.startTime,
    endTime: last.endTime,
  };
}

export async function buildShiftData(
  input: ShiftInput,
  workplaceType: "GENERAL" | "CRAM_SCHOOL",
): Promise<BuiltShiftData> {
  validateShiftInput(input);

  if (workplaceType === "CRAM_SCHOOL" && input.shiftType === "OTHER") {
    throw new ShiftValidationError(
      "CRAM_SCHOOL勤務先では OTHER シフトを登録できません",
    );
  }

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

    const lessonTimes = await resolveLessonTimeRange(
      input.workplaceId,
      lessonRange,
    );

    return {
      shiftData: {
        workplaceId: input.workplaceId,
        date,
        startTime: lessonTimes.startTime,
        endTime: lessonTimes.endTime,
        breakMinutes: input.breakMinutes,
        shiftType: input.shiftType,
      },
      lessonRange: {
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
