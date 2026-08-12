"use client";

import Link from "next/link";
import { useMemo } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TableLoadingSkeleton } from "@/components/ui/loading-skeletons";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { RefreshStatusFloating } from "@/components/ui/refresh-status-floating";
import { WorkplaceContextBreadcrumb } from "@/components/workplaces/workplace-context-breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dateKeyFromApiDate } from "@/lib/calendar/date";
import { messages, toErrorMessage } from "@/lib/messages";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { useUndoableAction } from "@/hooks/use-undoable-action";
import { invalidateAfterPayrollRuleMutation } from "@/lib/query/invalidation";
import {
  useWorkplaceDetailQuery,
  useWorkplacePayrollRulesQuery,
} from "@/lib/query/queries/workplaces";
import { queryKeys } from "@/lib/query/query-keys";
import { deletePayrollRuleAction } from "@/lib/actions/workplace";

type PayrollRuleListProps = {
  workplaceId: string;
  initialWorkplace?: {
    id: string;
    name: string;
    type: WorkplaceType;
    color: string;
  } | null;
  initialRules?: PayrollRule[];
  initialInfoMessage?: string | null;
};

type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";
type HolidayType = "NONE" | "WEEKEND" | "HOLIDAY" | "WEEKEND_HOLIDAY";
type NumericValue = number | string;

type PayrollRule = {
  id: string;
  workplaceId: string;
  startDate: string;
  endDate: string | null;
  baseHourlyWage: NumericValue;
  holidayAllowanceHourly: NumericValue;
  nightPremiumRate: NumericValue;
  overtimePremiumRate: NumericValue;
  dailyOvertimeThreshold: NumericValue;
  holidayType: HolidayType;
};

function toNumber(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(parsed) === false) {
    return null;
  }

  return parsed;
}

const payrollRuleCurrencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 2,
});

function formatCurrency(value: string | number | null): string {
  const numeric = toNumber(value);
  if (numeric === null) {
    return "-";
  }

  return payrollRuleCurrencyFormatter.format(numeric);
}

function formatDate(value: string | null, shiftDays = 0): string {
  if (!value) {
    return "現在";
  }

  const key = dateKeyFromApiDate(value);
  const [year, month, day] = key.split("-").map((part) => Number(part));
  if (
    Number.isInteger(year) === false ||
    Number.isInteger(month) === false ||
    Number.isInteger(day) === false
  ) {
    return key;
  }

  const shifted = new Date(Date.UTC(year, month - 1, day + shiftDays));
  const shiftedYear = shifted.getUTCFullYear();
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const shiftedDay = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shiftedYear}-${shiftedMonth}-${shiftedDay}`;
}

function formatRate(value: string | number): string {
  const numeric = toNumber(value);
  if (numeric === null) {
    return "-";
  }

  return `${(numeric * 100).toFixed(2)}%`;
}

export function PayrollRuleList({
  workplaceId,
  initialWorkplace,
  initialRules,
  initialInfoMessage,
}: PayrollRuleListProps) {
  const queryClient = getBrowserQueryClient();
  const workplaceQuery = useWorkplaceDetailQuery({
    workplaceId,
    initialData: initialWorkplace ?? null,
  });
  const rulesQuery = useWorkplacePayrollRulesQuery({
    workplaceId,
    initialData: initialRules,
  });
  const workplace = workplaceQuery.data ?? null;
  const rules = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const isLoading = workplaceQuery.isLoading || rulesQuery.isLoading;
  const isRefreshing =
    (workplaceQuery.isFetching && !workplaceQuery.isLoading) ||
    (rulesQuery.isFetching && !rulesQuery.isLoading);
  const errorMessage = workplaceQuery.error
    ? toErrorMessage(workplaceQuery.error, "勤務先情報の取得に失敗しました。")
    : rulesQuery.error
      ? toErrorMessage(rulesQuery.error, "給与ルール一覧の取得に失敗しました。")
      : null;
  const infoMessage = initialInfoMessage ?? null;

  const { schedule: scheduleUndoableAction } = useUndoableAction();

  const handleDelete = async (
    deletingRule: PayrollRule,
    rollback: () => void,
  ) => {
    try {
      const response = await deletePayrollRuleAction(
        workplaceId,
        deletingRule.id,
      );
      if ("error" in response) throw new Error(response.error);

      await invalidateAfterPayrollRuleMutation(queryClient, workplaceId);
      queryClient.setQueryData<PayrollRule[]>(
        queryKeys.workplaces.payrollRules({ workplaceId }),
        (current) =>
          (current ?? []).filter((rule) => rule.id !== deletingRule.id),
      );
    } catch (error) {
      console.error("failed to delete payroll rule", error);
      const message = toErrorMessage(
        error,
        messages.error.payrollRuleDeleteFailed,
      );
      rollback();
      toast.error(messages.error.payrollRuleDeleteFailed, {
        description: message,
        duration: 6000,
      });
    }
  };

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <div className="space-y-2">
          <WorkplaceContextBreadcrumb
            workplaceId={workplaceId}
            workplaceName={workplace?.name}
            currentPage="給与ルール"
          />
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Payroll Rules
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">給与ルール</h2>
          <p className="text-sm text-muted-foreground">
            {workplace
              ? `${workplace.name} の給与ルールを管理します。`
              : "勤務先ごとの給与ルールを管理します。"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/my/workplaces"
            className={buttonVariants({ variant: "outline" })}
          >
            勤務先一覧へ
          </Link>
          <Link
            href={`/my/workplaces/${workplaceId}/payroll-rules/new`}
            className={buttonVariants({})}
          >
            新規ルール追加
          </Link>
        </div>
      </header>

      {infoMessage ? (
        <p className="rounded-md border border-amber-700/30 bg-amber-700/5 px-3 py-2 text-sm text-amber-800">
          {infoMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {isRefreshing ? <RefreshStatusFloating /> : null}

      <Card>
        <CardHeader>
          <CardTitle>給与ルール一覧</CardTitle>
          <CardDescription>
            適用期間の重複は保存可能ですが、警告として表示されます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableLoadingSkeleton rows={5} columns={6} />
          ) : (
            <LoadingOverlay
              isLoading={isRefreshing}
              label="給与ルール一覧を更新中です。表示中の内容は前回取得分です。"
              className="rounded-lg"
            >
              <p className="text-xs text-muted-foreground">
                表は横にスクロールして確認できます。
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>適用期間（終了日を含む）</TableHead>
                    <TableHead>基本時給</TableHead>
                    <TableHead>深夜割増率</TableHead>
                    <TableHead>休日手当(円/時)</TableHead>
                    <TableHead>所定時間外割増率</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center">
                        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                          <p className="font-medium">給与ルールがありません</p>
                          <p className="text-sm text-muted-foreground">
                            給与を計算するには、適用する給与ルールの登録が必要です。
                          </p>
                          <Link
                            href={`/my/workplaces/${workplaceId}/payroll-rules/new`}
                            className={buttonVariants({ size: "sm" })}
                          >
                            給与ルールを追加
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">
                          {formatDate(rule.startDate)} 〜{" "}
                          {formatDate(rule.endDate, -1)}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(rule.baseHourlyWage)}
                        </TableCell>
                        <TableCell>
                          {formatRate(rule.nightPremiumRate)}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(rule.holidayAllowanceHourly)}
                        </TableCell>
                        <TableCell>
                          {formatRate(rule.overtimePremiumRate)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/my/workplaces/${workplaceId}/payroll-rules/${rule.id}/edit`}
                              className={buttonVariants({
                                variant: "outline",
                                size: "sm",
                              })}
                            >
                              編集
                            </Link>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                const previousRules = queryClient.getQueryData<
                                  PayrollRule[]
                                >(
                                  queryKeys.workplaces.payrollRules({
                                    workplaceId,
                                  }),
                                );
                                queryClient.setQueryData<PayrollRule[]>(
                                  queryKeys.workplaces.payrollRules({
                                    workplaceId,
                                  }),
                                  (current) =>
                                    (current ?? []).filter(
                                      (currentRule) =>
                                        currentRule.id !== rule.id,
                                    ),
                                );
                                scheduleUndoableAction({
                                  id: "payroll-rule-" + rule.id,
                                  message: "給与ルールを削除しました。",
                                  onUndo: () =>
                                    queryClient.setQueryData(
                                      queryKeys.workplaces.payrollRules({
                                        workplaceId,
                                      }),
                                      previousRules,
                                    ),
                                  onCommit: () =>
                                    handleDelete(rule, () =>
                                      queryClient.setQueryData(
                                        queryKeys.workplaces.payrollRules({
                                          workplaceId,
                                        }),
                                        previousRules,
                                      ),
                                    ),
                                });
                              }}
                            >
                              削除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </LoadingOverlay>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
