import {
  DATE_ONLY_REGEX,
  TIME_ONLY_REGEX,
  parseDateOnly,
  parseTimeOnly,
} from "@/lib/api/date-time";
import { calculateShiftWage } from "@/lib/payroll/calculateShiftWage";
import { resolvePaymentMonthForShiftDate } from "@/lib/payroll/pay-period";

type ShiftType = "NORMAL" | "LESSON" | "OTHER";
type HolidayType = "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
type PreviewStatus = "ready" | "incomplete" | "missing-rule" | "invalid";

export type PreviewWorkplace = {
  id: string;
  closingDayType: "DAY_OF_MONTH" | "END_OF_MONTH";
  closingDay: number | null;
  payday: number;
};

export type PreviewPayrollRule = {
  workplaceId: string;
  startDate: string | Date;
  endDate: string | Date | null;
  baseHourlyWage: number | string;
  holidayAllowanceHourly?: number | string;
  nightPremiumRate: number | string;
  overtimePremiumRate?: number | string;
  dailyOvertimeThreshold: number | string;
  holidayType: HolidayType;
};

export type PreviewTimetableSet = {
  id: string;
  workplaceId: string;
  items: Array<{
    timetableSetId: string;
    period: number;
    startTime: string;
    endTime: string;
  }>;
};

export type PreviewShiftInput = {
  temporaryId: string;
  workplaceId?: string;
  date?: string;
  shiftType: ShiftType;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  lessonRange?: {
    timetableSetId?: string;
    startPeriod?: number;
    endPeriod?: number;
  };
};

export type ShiftPayrollPreviewItem = {
  temporaryId: string;
  paymentMonth: string | null;
  wage: number | null;
  status: PreviewStatus;
  message?: string;
};

export type ShiftPayrollPreviewMonthSummary = {
  month: string;
  additionalWage: number;
  shiftCount: number;
  unresolvedCount: number;
  messages: string[];
};

export type ShiftPayrollPreviewResult = {
  items: ShiftPayrollPreviewItem[];
  months: ShiftPayrollPreviewMonthSummary[];
  unresolvedCount: number;
};

type NormalizedPreviewPayrollRule = {
  workplaceId: string;
  startDate: Date;
  endDate: Date | null;
  baseHourlyWage: number | string;
  holidayAllowanceHourly?: number | string;
  nightPremiumRate: number | string;
  overtimePremiumRate?: number | string;
  dailyOvertimeThreshold: number | string;
  holidayType: HolidayType;
};

type ResolvedShiftTime = {
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

function toMonthKey(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function isValidDateOnly(value: string): boolean {
  return DATE_ONLY_REGEX.test(value);
}

function parseDateLike(value: string | Date): Date {
  if (value instanceof Date) {
    return value;
  }

  if (DATE_ONLY_REGEX.test(value)) {
    return parseDateOnly(value);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("DATE_FORMAT_INVALID");
  }

  return parsed;
}

function toNormalizedRule(
  rule: PreviewPayrollRule,
): NormalizedPreviewPayrollRule {
  const startDate = parseDateLike(rule.startDate);
  const endDate =
    typeof rule.endDate === "string" || rule.endDate instanceof Date
      ? parseDateLike(rule.endDate)
      : null;

  return {
    workplaceId: rule.workplaceId,
    startDate,
    endDate,
    baseHourlyWage: rule.baseHourlyWage,
    holidayAllowanceHourly: rule.holidayAllowanceHourly,
    nightPremiumRate: rule.nightPremiumRate,
    overtimePremiumRate: rule.overtimePremiumRate,
    dailyOvertimeThreshold: rule.dailyOvertimeThreshold,
    holidayType: rule.holidayType,
  };
}

function groupRulesByWorkplace(
  payrollRules: PreviewPayrollRule[],
): Map<string, NormalizedPreviewPayrollRule[]> {
  const map = new Map<string, NormalizedPreviewPayrollRule[]>();

  for (const rule of payrollRules) {
    const normalized = toNormalizedRule(rule);
    const bucket = map.get(normalized.workplaceId) ?? [];
    bucket.push(normalized);
    map.set(normalized.workplaceId, bucket);
  }

  for (const [workplaceId, rules] of map) {
    map.set(
      workplaceId,
      rules.sort(
        (left, right) => right.startDate.getTime() - left.startDate.getTime(),
      ),
    );
  }

  return map;
}

function findApplicableRule(
  rulesByWorkplace: Map<string, NormalizedPreviewPayrollRule[]>,
  workplaceId: string,
  shiftDate: Date,
): NormalizedPreviewPayrollRule | null {
  const rules = rulesByWorkplace.get(workplaceId) ?? [];
  const shiftTime = shiftDate.getTime();

  for (const rule of rules) {
    const startTime = rule.startDate.getTime();
    const endTime = rule.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (startTime <= shiftTime && shiftTime < endTime) {
      return rule;
    }
  }

  return null;
}

function buildTimetablePeriodMap(
  timetableSets: PreviewTimetableSet[],
): Map<string, { startTime: string; endTime: string }> {
  const map = new Map<string, { startTime: string; endTime: string }>();

  for (const set of timetableSets) {
    for (const item of set.items) {
      map.set(`${set.id}:${item.period}`, {
        startTime: item.startTime,
        endTime: item.endTime,
      });
    }
  }

  return map;
}

function resolveShiftTime(
  shift: PreviewShiftInput,
  timetableByPeriod: Map<string, { startTime: string; endTime: string }>,
): {
  value: ResolvedShiftTime | null;
  status: PreviewStatus;
  message?: string;
} {
  if (shift.shiftType === "LESSON") {
    const timetableSetId = shift.lessonRange?.timetableSetId ?? "";
    const startPeriod = shift.lessonRange?.startPeriod;
    const endPeriod = shift.lessonRange?.endPeriod;

    if (!timetableSetId || !startPeriod || !endPeriod) {
      return {
        value: null,
        status: "incomplete",
        message: "開始時刻と終了時刻を入力すると追加予定額を計算します",
      };
    }

    if (startPeriod > endPeriod) {
      return {
        value: null,
        status: "invalid",
        message: "開始コマは終了コマ以下で指定してください",
      };
    }

    let startTime = "";
    let endTime = "";
    for (let period = startPeriod; period <= endPeriod; period += 1) {
      const key = `${timetableSetId}:${period}`;
      const item = timetableByPeriod.get(key);
      if (!item) {
        return {
          value: null,
          status: "invalid",
          message: "塾の時間割が登録されていません",
        };
      }
      if (period === startPeriod) {
        startTime = item.startTime;
      }
      if (period === endPeriod) {
        endTime = item.endTime;
      }
    }

    if (!TIME_ONLY_REGEX.test(startTime) || !TIME_ONLY_REGEX.test(endTime)) {
      return {
        value: null,
        status: "invalid",
        message: "塾の時間割が登録されていません",
      };
    }

    return {
      value: {
        startTime,
        endTime,
        breakMinutes: 0,
      },
      status: "ready",
    };
  }

  const startTime = shift.startTime ?? "";
  const endTime = shift.endTime ?? "";
  if (!startTime || !endTime) {
    return {
      value: null,
      status: "incomplete",
      message: "開始時刻と終了時刻を入力すると追加予定額を計算します",
    };
  }

  if (!TIME_ONLY_REGEX.test(startTime) || !TIME_ONLY_REGEX.test(endTime)) {
    return {
      value: null,
      status: "invalid",
      message: "開始時刻と終了時刻の入力形式が不正です",
    };
  }

  if (startTime === endTime) {
    return {
      value: null,
      status: "invalid",
      message: "開始時刻と終了時刻は同じ時刻にできません",
    };
  }

  return {
    value: {
      startTime,
      endTime,
      breakMinutes: Number.isFinite(shift.breakMinutes)
        ? shift.breakMinutes!
        : 0,
    },
    status: "ready",
  };
}

export function calculateShiftPayrollPreview(input: {
  shifts: PreviewShiftInput[];
  workplaces: PreviewWorkplace[];
  payrollRules: PreviewPayrollRule[];
  timetableSets: PreviewTimetableSet[];
}): ShiftPayrollPreviewResult {
  const workplacesById = new Map(
    input.workplaces.map((workplace) => [workplace.id, workplace]),
  );
  const rulesByWorkplace = groupRulesByWorkplace(input.payrollRules);
  const timetableByPeriod = buildTimetablePeriodMap(input.timetableSets);

  const items: ShiftPayrollPreviewItem[] = [];
  const monthMap = new Map<string, ShiftPayrollPreviewMonthSummary>();
  let unresolvedCount = 0;

  for (const shift of input.shifts) {
    const workplaceId = shift.workplaceId ?? "";
    if (!workplaceId) {
      unresolvedCount += 1;
      items.push({
        temporaryId: shift.temporaryId,
        paymentMonth: null,
        wage: null,
        status: "incomplete",
        message: "勤務先を選択すると支給額を確認できます",
      });
      continue;
    }

    const workplace = workplacesById.get(workplaceId);
    if (!workplace) {
      unresolvedCount += 1;
      items.push({
        temporaryId: shift.temporaryId,
        paymentMonth: null,
        wage: null,
        status: "invalid",
        message: "勤務先情報の取得に失敗しました",
      });
      continue;
    }

    const shiftDateValue = shift.date ?? "";
    if (!shiftDateValue) {
      unresolvedCount += 1;
      items.push({
        temporaryId: shift.temporaryId,
        paymentMonth: null,
        wage: null,
        status: "incomplete",
        message: "日付を入力すると支給月を判定できます",
      });
      continue;
    }

    if (!isValidDateOnly(shiftDateValue)) {
      unresolvedCount += 1;
      items.push({
        temporaryId: shift.temporaryId,
        paymentMonth: null,
        wage: null,
        status: "invalid",
        message: "日付の入力形式が不正です",
      });
      continue;
    }

    const shiftDate = parseDateOnly(shiftDateValue);
    const paymentMonthDate = resolvePaymentMonthForShiftDate(shiftDate, {
      closingDayType: workplace.closingDayType,
      closingDay: workplace.closingDay,
      payday: workplace.payday,
    });
    const paymentMonth = toMonthKey(paymentMonthDate);

    const resolvedTime = resolveShiftTime(shift, timetableByPeriod);
    if (!resolvedTime.value) {
      unresolvedCount += 1;
      items.push({
        temporaryId: shift.temporaryId,
        paymentMonth,
        wage: null,
        status: resolvedTime.status,
        message: resolvedTime.message,
      });

      const monthSummary = monthMap.get(paymentMonth) ?? {
        month: paymentMonth,
        additionalWage: 0,
        shiftCount: 0,
        unresolvedCount: 0,
        messages: [],
      };
      monthSummary.unresolvedCount += 1;
      if (
        resolvedTime.message &&
        monthSummary.messages.includes(resolvedTime.message) === false
      ) {
        monthSummary.messages.push(resolvedTime.message);
      }
      monthMap.set(paymentMonth, monthSummary);
      continue;
    }

    const rule = findApplicableRule(rulesByWorkplace, workplaceId, shiftDate);
    if (!rule) {
      unresolvedCount += 1;
      const message = "この日付に適用できる給与ルールがありません";
      items.push({
        temporaryId: shift.temporaryId,
        paymentMonth,
        wage: null,
        status: "missing-rule",
        message,
      });

      const monthSummary = monthMap.get(paymentMonth) ?? {
        month: paymentMonth,
        additionalWage: 0,
        shiftCount: 0,
        unresolvedCount: 0,
        messages: [],
      };
      monthSummary.unresolvedCount += 1;
      if (monthSummary.messages.includes(message) === false) {
        monthSummary.messages.push(message);
      }
      monthMap.set(paymentMonth, monthSummary);
      continue;
    }

    const wageResult = calculateShiftWage(
      {
        date: shiftDate,
        startTime: parseTimeOnly(resolvedTime.value.startTime),
        endTime: parseTimeOnly(resolvedTime.value.endTime),
        breakMinutes: resolvedTime.value.breakMinutes,
      },
      {
        baseHourlyWage: rule.baseHourlyWage,
        holidayAllowanceHourly: rule.holidayAllowanceHourly,
        nightPremiumRate: rule.nightPremiumRate,
        overtimePremiumRate: rule.overtimePremiumRate,
        dailyOvertimeThreshold: rule.dailyOvertimeThreshold,
        holidayType: rule.holidayType,
      },
    );

    items.push({
      temporaryId: shift.temporaryId,
      paymentMonth,
      wage: wageResult.totalWage,
      status: "ready",
    });

    const monthSummary = monthMap.get(paymentMonth) ?? {
      month: paymentMonth,
      additionalWage: 0,
      shiftCount: 0,
      unresolvedCount: 0,
      messages: [],
    };
    monthSummary.additionalWage += wageResult.totalWage;
    monthSummary.shiftCount += 1;
    monthMap.set(paymentMonth, monthSummary);
  }

  const months = Array.from(monthMap.values()).sort((left, right) =>
    left.month.localeCompare(right.month),
  );

  return {
    items,
    months,
    unresolvedCount,
  };
}
