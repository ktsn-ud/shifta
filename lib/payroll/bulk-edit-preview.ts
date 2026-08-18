import {
  calculateShiftPayrollPreview,
  type PreviewPayrollRule,
  type PreviewShiftInput,
  type PreviewTimetableSet,
  type PreviewWorkplace,
} from "@/lib/payroll/preview";

export type BulkEditPayrollDifference = {
  workplaceId: string;
  paymentMonth: string;
  wage: number;
  transportationAllowance: number;
};

export type BulkEditPayrollMonthDifference = {
  month: string;
  wage: number;
  transportationAllowance: number;
  totalAmount: number;
  changeCount: number;
  unresolvedCount: number;
  messages: string[];
};

export type BulkEditPayrollPreviewResult = {
  months: BulkEditPayrollMonthDifference[];
  differences: BulkEditPayrollDifference[];
  unresolvedCount: number;
};

function addDifference(
  map: Map<string, BulkEditPayrollDifference>,
  value: BulkEditPayrollDifference,
) {
  const key = `${value.workplaceId}:${value.paymentMonth}`;
  const current = map.get(key) ?? {
    workplaceId: value.workplaceId,
    paymentMonth: value.paymentMonth,
    wage: 0,
    transportationAllowance: 0,
  };
  current.wage += value.wage;
  current.transportationAllowance += value.transportationAllowance;
  map.set(key, current);
}

export function calculateBulkEditPayrollPreview(input: {
  beforeShifts: PreviewShiftInput[];
  afterShifts: PreviewShiftInput[];
  workplaces: PreviewWorkplace[];
  payrollRules: PreviewPayrollRule[];
  timetableSets: PreviewTimetableSet[];
}): BulkEditPayrollPreviewResult {
  const before = calculateShiftPayrollPreview({
    shifts: input.beforeShifts,
    workplaces: input.workplaces,
    payrollRules: input.payrollRules,
    timetableSets: input.timetableSets,
  });
  const after = calculateShiftPayrollPreview({
    shifts: input.afterShifts,
    workplaces: input.workplaces,
    payrollRules: input.payrollRules,
    timetableSets: input.timetableSets,
  });
  const beforeById = new Map(
    before.items.map((item) => [item.temporaryId, item]),
  );
  const afterById = new Map(
    after.items.map((item) => [item.temporaryId, item]),
  );
  const months = new Map<string, BulkEditPayrollMonthDifference>();
  const differences = new Map<string, BulkEditPayrollDifference>();
  const messageSets = new Map<string, Set<string>>();
  let unresolvedCount = 0;

  function getMonth(month: string) {
    const current = months.get(month);
    if (current) return current;
    const next: BulkEditPayrollMonthDifference = {
      month,
      wage: 0,
      transportationAllowance: 0,
      totalAmount: 0,
      changeCount: 0,
      unresolvedCount: 0,
      messages: [],
    };
    months.set(month, next);
    return next;
  }

  function addMessage(
    month: string,
    summary: BulkEditPayrollMonthDifference,
    message: string,
  ) {
    const messages = messageSets.get(month) ?? new Set<string>();
    if (messages.has(message)) return;
    messages.add(message);
    messageSets.set(month, messages);
    summary.messages.push(message);
  }

  for (const beforeShift of input.beforeShifts) {
    const id = beforeShift.temporaryId;
    const beforeItem = beforeById.get(id);
    const afterItem = afterById.get(id);
    const workplaceId = beforeShift.workplaceId;
    if (!beforeItem || !afterItem || !workplaceId) continue;

    if (beforeItem.status !== "ready" || afterItem.status !== "ready") {
      unresolvedCount += 1;
      const month = afterItem.paymentMonth ?? beforeItem.paymentMonth;
      if (month) {
        const summary = getMonth(month);
        summary.unresolvedCount += 1;
        const message = afterItem.message ?? beforeItem.message;
        if (message) addMessage(month, summary, message);
      }
      continue;
    }

    const paymentMonths = new Set([
      beforeItem.paymentMonth,
      afterItem.paymentMonth,
    ]);
    for (const paymentMonth of paymentMonths) {
      if (!paymentMonth) continue;
      const summary = getMonth(paymentMonth);
      summary.changeCount += 1;
    }
    const beforeMonth = beforeItem.paymentMonth;
    const afterMonth = afterItem.paymentMonth;
    if (beforeMonth) {
      const summary = getMonth(beforeMonth);
      summary.wage -= beforeItem.wage ?? 0;
      summary.transportationAllowance -= beforeItem.transportationAllowance;
      addDifference(differences, {
        workplaceId,
        paymentMonth: beforeMonth,
        wage: -(beforeItem.wage ?? 0),
        transportationAllowance: -beforeItem.transportationAllowance,
      });
    }
    if (afterMonth) {
      const summary = getMonth(afterMonth);
      summary.wage += afterItem.wage ?? 0;
      summary.transportationAllowance += afterItem.transportationAllowance;
      addDifference(differences, {
        workplaceId,
        paymentMonth: afterMonth,
        wage: afterItem.wage ?? 0,
        transportationAllowance: afterItem.transportationAllowance,
      });
    }
  }

  return {
    months: Array.from(months.values())
      .map((item) => ({
        ...item,
        totalAmount: item.wage + item.transportationAllowance,
      }))
      .sort((left, right) => left.month.localeCompare(right.month)),
    differences: Array.from(differences.values()),
    unresolvedCount,
  };
}
