"use client";

import { clearMonthShiftsCache } from "@/lib/client-cache/month-shifts-cache";
import {
  clearPayrollDetailsMonthlyCache,
  clearPayrollDetailsYearlyCache,
} from "@/lib/client-cache/payroll-details-cache";
import { clearSummaryCache } from "@/lib/client-cache/summary-cache";
import { clearNextPaymentCache } from "@/lib/client-cache/next-payment-cache";

export function clearShiftDerivedCaches(): void {
  clearMonthShiftsCache();
  clearNextPaymentCache();
  clearSummaryCache();
  clearPayrollDetailsMonthlyCache();
  clearPayrollDetailsYearlyCache();
}
