"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  readNextPaymentCache,
  writeNextPaymentCache,
} from "@/lib/client-cache/next-payment-cache";
import { clearShiftDerivedCaches } from "@/lib/client-cache/shift-derived-cache";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { ShiftListModal } from "@/components/calendar/ShiftListModal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SpinnerPanel } from "@/components/ui/spinner";
import {
  addMonths,
  dateFromDateKey,
  dateKeyFromApiDate,
  fromMonthInputValue,
  startOfMonth,
  toMonthInputValue,
  toDateKey,
} from "@/lib/calendar/date";
import {
  parseGoogleSyncFailureFromPayload,
  readGoogleSyncFailureFromErrorResponse,
} from "@/lib/google-calendar/clientSync";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { messages } from "@/lib/messages";
import { useGoogleTokenExpiredSignOut } from "@/hooks/use-google-token-expired-signout";
import {
  type MonthShift,
  summarizeShifts,
  useMonthShifts,
} from "@/hooks/use-month-shifts";

type DashboardPageClientProps = {
  currentUserId: string;
  initialMonthShifts: MonthShift[];
  initialMonthStartDate: string;
  initialMonthEndDate: string;
  initialUnconfirmedShiftCount: number;
  nextMonthPaymentAmount: number | null;
};

const NEXT_PAYMENT_CACHE_TTL_MS = 5 * 60 * 1000;
const GOOGLE_TOKEN_EXPIRED_DESCRIPTION =
  "3秒後にログアウトします。再度Googleアカウントでログインしてください。";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCalendarMonthLabel(month: Date): string {
  const now = new Date();
  const isSameYear = month.getFullYear() === now.getFullYear();
  const monthLabel = `${month.getMonth() + 1}月`;
  return isSameYear ? monthLabel : `${month.getFullYear()}年${monthLabel}`;
}

function formatSummaryPeriodLabel(month: Date): string {
  const now = new Date();
  const isSameYear = month.getFullYear() === now.getFullYear();
  const isCurrentMonth = isSameYear && month.getMonth() === now.getMonth();

  if (isCurrentMonth) {
    return "今月";
  }

  const monthLabel = `${month.getMonth() + 1}月`;
  return isSameYear ? monthLabel : `${month.getFullYear()}年${monthLabel}`;
}

function toNextPaymentCacheKey(userKey: string, paymentMonth: string): string {
  return `${userKey}:${paymentMonth}`;
}

function isPayrollSummaryResponse(
  value: unknown,
): value is { totalWage: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { totalWage?: unknown }).totalWage === "number"
  );
}

export function DashboardPageLoadingSkeleton() {
  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <div>
          <h2 className="text-xl font-semibold">ダッシュボード</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            当月のシフト状況と概算値を確認できます。
          </p>
        </div>
      </header>
      <SpinnerPanel
        className="min-h-[360px]"
        label="ダッシュボードを読み込み中..."
      />
    </section>
  );
}

export function DashboardPageClient({
  currentUserId,
  initialMonthShifts,
  initialMonthStartDate,
  initialMonthEndDate,
  initialUnconfirmedShiftCount,
  nextMonthPaymentAmount,
}: DashboardPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(() => {
    const initialMonthDate = dateFromDateKey(initialMonthStartDate);
    return startOfMonth(initialMonthDate ?? new Date());
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [nextPaymentAmount, setNextPaymentAmount] = useState(
    nextMonthPaymentAmount,
  );
  const [isNextPaymentLoading, setIsNextPaymentLoading] = useState(false);
  const now = new Date();
  const isCurrentMonth =
    month.getFullYear() === now.getFullYear() &&
    month.getMonth() === now.getMonth();

  const { shifts, isLoading, errorMessage, reload } = useMonthShifts(month, {
    cacheUserKey: currentUserId,
    initialShifts: initialMonthShifts,
    initialStartDate: initialMonthStartDate,
    initialEndDate: initialMonthEndDate,
    deferEstimate: true,
  });

  const shiftsByDate = useMemo(() => {
    const grouped = new Map<string, typeof shifts>();
    for (const shift of shifts) {
      const key = dateKeyFromApiDate(shift.date);
      const existing = grouped.get(key) ?? [];
      existing.push(shift);
      grouped.set(key, existing);
    }
    return grouped;
  }, [shifts]);

  const summary = useMemo(() => summarizeShifts(shifts), [shifts]);
  const summaryPeriodLabel = useMemo(
    () => formatSummaryPeriodLabel(month),
    [month],
  );
  const nextPaymentMonthValue = useMemo(
    () => toMonthInputValue(addMonths(month, 1)),
    [month],
  );
  const nextPaymentMonthDate = useMemo(() => addMonths(month, 1), [month]);
  const selectedDateKey = toDateKey(selectedDate);
  const selectedDateShifts = shiftsByDate.get(selectedDateKey) ?? [];
  const failedShiftIds = useMemo(() => {
    return shifts
      .filter((shift) => shift.googleSyncStatus === "FAILED")
      .map((shift) => shift.id);
  }, [shifts]);
  const failedShiftCount = failedShiftIds.length;
  const [isBulkRetrying, setIsBulkRetrying] = useState(false);
  const { isSignOutScheduled, scheduleSignOut } =
    useGoogleTokenExpiredSignOut();
  const monthFromQuery = useMemo(() => {
    const rawMonth = searchParams.get("month");
    if (!rawMonth) {
      return null;
    }

    const parsed = fromMonthInputValue(rawMonth);
    return parsed ? startOfMonth(parsed) : null;
  }, [searchParams]);

  useEffect(() => {
    const nextMonth = startOfMonth(
      dateFromDateKey(initialMonthStartDate) ?? new Date(),
    );

    setMonth((current) => {
      const isSameMonth =
        current.getFullYear() === nextMonth.getFullYear() &&
        current.getMonth() === nextMonth.getMonth();

      return isSameMonth ? current : nextMonth;
    });
  }, [initialMonthStartDate]);

  useEffect(() => {
    if (!monthFromQuery) {
      return;
    }

    setMonth((current) => {
      const isSameMonth =
        current.getFullYear() === monthFromQuery.getFullYear() &&
        current.getMonth() === monthFromQuery.getMonth();

      return isSameMonth ? current : monthFromQuery;
    });
  }, [monthFromQuery]);

  useEffect(() => {
    const initialMonthDate = startOfMonth(
      dateFromDateKey(initialMonthStartDate) ?? new Date(),
    );
    const isInitialMonth =
      month.getFullYear() === initialMonthDate.getFullYear() &&
      month.getMonth() === initialMonthDate.getMonth();

    const cacheKey = toNextPaymentCacheKey(
      currentUserId,
      nextPaymentMonthValue,
    );
    if (isInitialMonth) {
      if (nextMonthPaymentAmount !== null) {
        writeNextPaymentCache(
          cacheKey,
          nextMonthPaymentAmount,
          NEXT_PAYMENT_CACHE_TTL_MS,
        );
        setNextPaymentAmount(nextMonthPaymentAmount);
        setIsNextPaymentLoading(false);
        return;
      }
    }

    const cachedAmount = readNextPaymentCache(cacheKey);
    if (cachedAmount !== null) {
      setNextPaymentAmount(cachedAmount);
      setIsNextPaymentLoading(false);
      return;
    }

    const abortController = new AbortController();
    async function fetchNextPaymentAmount() {
      setIsNextPaymentLoading(true);

      try {
        const params = new URLSearchParams({
          month: nextPaymentMonthValue,
        });

        const response = await fetch(
          `/api/payroll/summary?${params.toString()}`,
          {
            signal: abortController.signal,
            cache: "no-store",
          },
        );

        if (response.ok === false) {
          throw new Error("PAYROLL_SUMMARY_FETCH_FAILED");
        }

        const payload = (await response.json()) as unknown;
        if (!isPayrollSummaryResponse(payload)) {
          throw new Error("PAYROLL_SUMMARY_RESPONSE_INVALID");
        }

        writeNextPaymentCache(
          cacheKey,
          payload.totalWage,
          NEXT_PAYMENT_CACHE_TTL_MS,
        );
        setNextPaymentAmount(payload.totalWage);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch next payment amount", error);
      } finally {
        if (abortController.signal.aborted === false) {
          setIsNextPaymentLoading(false);
        }
      }
    }

    void fetchNextPaymentAmount();

    return () => {
      abortController.abort();
    };
  }, [
    currentUserId,
    initialMonthStartDate,
    month,
    nextMonthPaymentAmount,
    nextPaymentMonthValue,
  ]);

  const handleCreateShift = (date: Date) => {
    const dateString = toDateKey(date);
    const params = new URLSearchParams({
      date: dateString,
      month: toMonthInputValue(month),
    });
    router.push(`/my/shifts/new?${params.toString()}`);
  };

  const handleBulkRetrySync = async () => {
    if (failedShiftIds.length === 0 || isBulkRetrying || isSignOutScheduled) {
      return;
    }

    setIsBulkRetrying(true);
    try {
      const results = await Promise.allSettled(
        failedShiftIds.map(async (shiftId) => {
          const response = await fetch(`/api/shifts/${shiftId}/retry-sync`, {
            method: "POST",
          });

          if (response.ok) {
            return {
              ok: true as const,
              requiresCalendarSetup: false,
              requiresSignOut: false,
            };
          }

          const apiError = await readGoogleSyncFailureFromErrorResponse(
            response,
            "Google Calendar への再同期に失敗しました",
          );

          return {
            ok: false as const,
            requiresCalendarSetup: apiError.requiresCalendarSetup,
            requiresSignOut: apiError.requiresSignOut,
          };
        }),
      );

      const summary = results.reduce(
        (acc, result) => {
          if (result.status === "fulfilled" && result.value.ok) {
            return {
              ...acc,
              successCount: acc.successCount + 1,
            };
          }

          const requiresSetup =
            result.status === "fulfilled"
              ? result.value.requiresCalendarSetup
              : false;
          const requiresSignOut =
            result.status === "fulfilled"
              ? result.value.requiresSignOut
              : false;

          return {
            ...acc,
            failureCount: acc.failureCount + 1,
            requiresCalendarSetup: acc.requiresCalendarSetup || requiresSetup,
            requiresSignOut: acc.requiresSignOut || requiresSignOut,
          };
        },
        {
          successCount: 0,
          failureCount: 0,
          requiresCalendarSetup: false,
          requiresSignOut: false,
        },
      );

      await reload();

      if (summary.failureCount === 0) {
        toast.success("Google Calendar の一括再同期が完了しました", {
          description: `${summary.successCount}件成功`,
        });
        return;
      }

      toast.error("Google Calendar の一括再同期で一部失敗しました", {
        description: `${summary.successCount}件成功 / ${summary.failureCount}件失敗`,
        duration: 6000,
      });

      if (summary.requiresSignOut) {
        toast.error("Google 連携の有効期限が切れました", {
          description: GOOGLE_TOKEN_EXPIRED_DESCRIPTION,
          duration: 6000,
        });
        scheduleSignOut();
        return;
      }

      if (summary.requiresCalendarSetup) {
        router.push(CALENDAR_SETUP_PATH);
      }
    } finally {
      setIsBulkRetrying(false);
    }
  };

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">ダッシュボード</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            当月のシフト状況と概算値を確認できます。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setMonth(startOfMonth(new Date()))}
            disabled={isCurrentMonth}
          >
            今月に戻る
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleCreateShift(new Date())}
          >
            新規シフト登録
          </Button>
          <Button type="button" onClick={() => router.push("/my/shifts/bulk")}>
            一括登録
          </Button>
        </div>
      </header>

      {isLoading ? (
        <SpinnerPanel
          className="min-h-[360px]"
          label="ダッシュボードを読み込み中..."
        />
      ) : null}

      {!isLoading && initialUnconfirmedShiftCount > 0 ? (
        <Card className="border-amber-300/70 bg-amber-50/70">
          <CardHeader className="gap-3 md:flex sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <CardTitle>シフト確定待ちがあります</CardTitle>
              <CardDescription>
                本日以前の未確定シフトが {initialUnconfirmedShiftCount}{" "}
                件あります。 シフト確定ページで確認してください。
              </CardDescription>
            </div>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => router.push("/my/shifts/confirm")}
            >
              シフト確定ページへ
            </Button>
          </CardHeader>
        </Card>
      ) : null}

      {!isLoading ? (
        <Card
          className={
            failedShiftCount > 0
              ? "border-amber-300/70 bg-amber-50/70"
              : "border-emerald-300/70 bg-emerald-50/70"
          }
        >
          <CardContent className="flex items-center justify-between gap-3 py-1">
            <div className="flex items-center gap-2 text-sm">
              {failedShiftCount > 0 ? (
                <AlertTriangleIcon className="size-4 text-amber-700" />
              ) : (
                <CheckCircle2Icon className="size-4 text-emerald-700" />
              )}
              <p>
                {failedShiftCount > 0
                  ? `${failedShiftCount}件のシフトが Google Calendar に同期できていません`
                  : "すべてのシフトが Google Calendar に正常に同期されています"}
              </p>
            </div>
            {failedShiftCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void handleBulkRetrySync();
                }}
                disabled={isBulkRetrying || isSignOutScheduled}
              >
                <RefreshCwIcon
                  className={`size-4 ${isBulkRetrying ? "animate-spin" : ""}`}
                />
                {isBulkRetrying ? "再同期中..." : "一括して再同期"}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <CardTitle>翌月支給額</CardTitle>
              <CardDescription>
                {formatCalendarMonthLabel(nextPaymentMonthDate)}
                に受け取る見込み額
              </CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {isNextPaymentLoading || nextPaymentAmount === null
                ? "読み込み中..."
                : formatCurrency(nextPaymentAmount)}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>{summaryPeriodLabel}の勤務時間</CardTitle>
              <CardDescription>休憩控除後の合計時間</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {(summary.totalWorkedMinutes / 60).toFixed(1)} 時間
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>{summaryPeriodLabel}のシフト件数</CardTitle>
              <CardDescription>登録済み件数</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {summary.shiftCount} 件
            </CardContent>
          </Card>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {!isLoading ? (
        <MonthCalendar
          month={month}
          shifts={shifts}
          onNavigatePrev={() => setMonth((current) => addMonths(current, -1))}
          onNavigateNext={() => setMonth((current) => addMonths(current, 1))}
          onDateClick={(date) => {
            setSelectedDate(date);
            const dayShifts = shiftsByDate.get(toDateKey(date)) ?? [];
            if (dayShifts.length === 0) {
              handleCreateShift(date);
              return;
            }
            setModalOpen(true);
          }}
        />
      ) : null}

      <ShiftListModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        targetDate={selectedDate}
        shifts={selectedDateShifts}
        onCreateShift={handleCreateShift}
        onEditShift={(shiftId) => {
          const params = new URLSearchParams({
            month: toMonthInputValue(month),
          });
          router.push(`/my/shifts/${shiftId}/edit?${params.toString()}`);
        }}
        onDeleteShift={async (shiftId) => {
          if (isSignOutScheduled) {
            return;
          }

          const response = await fetch(`/api/shifts/${shiftId}`, {
            method: "DELETE",
          });

          if (response.ok === false) {
            const apiError = await readGoogleSyncFailureFromErrorResponse(
              response,
              "シフトの削除に失敗しました",
            );

            if (apiError.requiresSignOut) {
              toast.error("Google 連携の有効期限が切れました", {
                description: GOOGLE_TOKEN_EXPIRED_DESCRIPTION,
                duration: 6000,
              });
              scheduleSignOut();
              return;
            }
            throw new Error(apiError.message);
          }

          const payload = (await response.json()) as unknown;
          const syncFailure = parseGoogleSyncFailureFromPayload(
            payload,
            messages.error.calendarSyncFailed,
          );

          clearShiftDerivedCaches();
          await reload();

          if (syncFailure) {
            if (syncFailure.requiresSignOut) {
              toast.error("Google 連携の有効期限が切れました", {
                description: GOOGLE_TOKEN_EXPIRED_DESCRIPTION,
                duration: 6000,
              });
              scheduleSignOut();
              return;
            }

            toast.error(messages.error.calendarSyncFailed, {
              description: syncFailure.requiresCalendarSetup
                ? syncFailure.message
                : `${syncFailure.message} シフトは削除済みです。`,
              duration: 6000,
            });

            if (syncFailure.requiresCalendarSetup) {
              queueMicrotask(() => {
                router.push(CALENDAR_SETUP_PATH);
              });
            }
            return;
          }

          toast.success(messages.success.shiftDeleted);
        }}
        onRetrySync={async (shiftId) => {
          if (isSignOutScheduled) {
            return;
          }

          const response = await fetch(`/api/shifts/${shiftId}/retry-sync`, {
            method: "POST",
          });

          if (response.ok === false) {
            const apiError = await readGoogleSyncFailureFromErrorResponse(
              response,
              "Google Calendar への再同期に失敗しました",
            );

            if (apiError.requiresSignOut) {
              toast.error("Google 連携の有効期限が切れました", {
                description: GOOGLE_TOKEN_EXPIRED_DESCRIPTION,
                duration: 6000,
              });
              scheduleSignOut();
              return;
            }

            if (apiError.requiresCalendarSetup) {
              router.push(CALENDAR_SETUP_PATH);
            }

            throw new Error(apiError.message);
          }

          await reload();
          toast.success(messages.success.calendarSyncRetried);
        }}
      />
    </section>
  );
}
