import type {
  PayrollRule,
  Shift,
  ShiftLessonRange,
  Workplace,
} from "@/lib/generated/prisma/client";
import { calculateLessonShiftWage } from "@/lib/payroll/calculateLessonShiftWage";
import {
  calculateOtherShiftWage,
  type PayrollResult,
} from "@/lib/payroll/calculateShiftWage";

export type ShiftWithSummaryRelations = Shift & {
  lessonRange: ShiftLessonRange | null;
  workplace: Pick<Workplace, "id" | "name" | "color">;
};

export type ShiftForPayrollCalculation = Shift & {
  lessonRange: ShiftLessonRange | null;
};

export type PayrollRulesByWorkplace = ReadonlyMap<string, PayrollRule[]>;

export type SummaryByWorkplace = {
  workplaceId: string;
  workplaceName: string;
  workplaceColor: string;
  wage: number;
  workHours: number;
};

export type SummaryResult = {
  totalWage: number;
  totalWorkHours: number;
  totalNightHours: number;
  totalOvertimeHours: number;
  byWorkplace: SummaryByWorkplace[];
};

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function isWithin(date: Date, startDate: Date, endDate: Date): boolean {
  const time = date.getTime();
  return time >= startDate.getTime() && time <= endDate.getTime();
}

export function groupPayrollRulesByWorkplace(
  payrollRules: PayrollRule[],
): Map<string, PayrollRule[]> {
  const grouped = new Map<string, PayrollRule[]>();

  for (const rule of payrollRules) {
    const rules = grouped.get(rule.workplaceId) ?? [];
    rules.push(rule);
    grouped.set(rule.workplaceId, rules);
  }

  for (const [workplaceId, rules] of grouped) {
    grouped.set(
      workplaceId,
      rules.sort(
        (left, right) => right.startDate.getTime() - left.startDate.getTime(),
      ),
    );
  }

  return grouped;
}

export function findApplicablePayrollRule(
  rulesByWorkplace: PayrollRulesByWorkplace,
  workplaceId: string,
  shiftDate: Date,
): PayrollRule | null {
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

export function calculateShiftPayrollResultByRule(
  shift: ShiftForPayrollCalculation,
  rule: PayrollRule,
): PayrollResult {
  if (shift.shiftType === "LESSON") {
    if (!shift.lessonRange) {
      throw new Error(
        `LESSON型のコマ範囲が見つかりません: shiftId=${shift.id}`,
      );
    }
    return calculateLessonShiftWage(shift, shift.lessonRange, rule);
  }

  return calculateOtherShiftWage(shift, rule);
}

export function calculateShiftPayrollResult(
  shift: ShiftForPayrollCalculation,
  rulesByWorkplace: PayrollRulesByWorkplace,
): PayrollResult {
  const rule = findApplicablePayrollRule(
    rulesByWorkplace,
    shift.workplaceId,
    shift.date,
  );
  if (!rule) {
    throw new Error(`該当する給与ルールが見つかりません: shiftId=${shift.id}`);
  }

  return calculateShiftPayrollResultByRule(shift, rule);
}

export function summarizeByPeriod(
  shifts: ShiftWithSummaryRelations[],
  payrollRules: PayrollRule[],
  startDate: Date,
  endDate: Date,
): SummaryResult {
  const rulesByWorkplace = groupPayrollRulesByWorkplace(payrollRules);
  const byWorkplace = new Map<string, SummaryByWorkplace>();

  let totalWage = 0;
  let totalWorkHours = 0;
  let totalNightHours = 0;
  let totalOvertimeHours = 0;

  for (const shift of shifts) {
    if (!isWithin(shift.date, startDate, endDate)) {
      continue;
    }

    const result = calculateShiftPayrollResult(shift, rulesByWorkplace);

    totalWage += result.totalWage;
    totalWorkHours += result.workHours;
    totalNightHours += result.nightHours;
    totalOvertimeHours += result.overtimeHours;

    const current = byWorkplace.get(shift.workplaceId);
    if (current) {
      current.wage += result.totalWage;
      current.workHours += result.workHours;
    } else {
      byWorkplace.set(shift.workplaceId, {
        workplaceId: shift.workplace.id,
        workplaceName: shift.workplace.name,
        workplaceColor: shift.workplace.color,
        wage: result.totalWage,
        workHours: result.workHours,
      });
    }
  }

  return {
    totalWage: Math.round(totalWage),
    totalWorkHours: roundHours(totalWorkHours),
    totalNightHours: roundHours(totalNightHours),
    totalOvertimeHours: roundHours(totalOvertimeHours),
    byWorkplace: Array.from(byWorkplace.values())
      .map((item) => ({
        ...item,
        wage: Math.round(item.wage),
        workHours: roundHours(item.workHours),
      }))
      .sort((left, right) => right.wage - left.wage),
  };
}
