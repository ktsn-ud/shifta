"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TableLoadingSkeleton } from "@/components/ui/loading-skeletons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { invalidateAfterPayrollRuleMutation } from "@/lib/query/invalidation";
import {
  useWorkplaceDetailQuery,
  useWorkplacePayrollRulesQuery,
} from "@/lib/query/queries/workplaces";
import { queryKeys } from "@/lib/query/query-keys";
import { resolveUserFacingErrorFromResponse } from "@/lib/user-facing-error";

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

async function readApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const resolved = await resolveUserFacingErrorFromResponse(response, fallback);
  return resolved.message;
}

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
  const errorMessage = workplaceQuery.error
    ? toErrorMessage(workplaceQuery.error, "勤務先情報の取得に失敗しました。")
    : rulesQuery.error
      ? toErrorMessage(rulesQuery.error, "給与ルール一覧の取得に失敗しました。")
      : null;
  const [infoMessage, setInfoMessage] = useState<string | null>(
    initialInfoMessage ?? null,
  );
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deletingRule = useMemo(
    () => rules.find((rule) => rule.id === deletingRuleId) ?? null,
    [deletingRuleId, rules],
  );

  const handleDelete = async () => {
    if (!deletingRule) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(
        `/api/workplaces/${workplaceId}/payroll-rules/${deletingRule.id}`,
        {
          method: "DELETE",
        },
      );

      if (response.ok === false) {
        throw new Error(
          await readApiErrorMessage(
            response,
            "給与ルールの削除に失敗しました。",
          ),
        );
      }

      await invalidateAfterPayrollRuleMutation(queryClient, workplaceId);
      queryClient.setQueryData<PayrollRule[]>(
        queryKeys.workplaces.payrollRules({ workplaceId }),
        (current) =>
          (current ?? []).filter((rule) => rule.id !== deletingRule.id),
      );
      setDeletingRuleId(null);
      setInfoMessage("給与ルールを削除しました。");
      toast.success(messages.success.payrollRuleDeleted);
    } catch (error) {
      console.error("failed to delete payroll rule", error);
      const message = toErrorMessage(
        error,
        messages.error.payrollRuleDeleteFailed,
      );
      setDeleteError(message);
      toast.error(messages.error.payrollRuleDeleteFailed, {
        description: message,
        duration: 6000,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <div className="space-y-2">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>適用期間</TableHead>
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
                    <TableCell colSpan={6} className="h-16 text-center">
                      給与ルールがありません。
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
                      <TableCell>{formatRate(rule.nightPremiumRate)}</TableCell>
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
                              setDeleteError(null);
                              setDeletingRuleId(rule.id);
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
          )}
        </CardContent>
      </Card>

      <Dialog
        open={deletingRule !== null}
        onOpenChange={(open) => {
          if (open === false) {
            setDeletingRuleId(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>給与ルールを削除しますか？</DialogTitle>
            <DialogDescription>この操作は取り消せません。</DialogDescription>
          </DialogHeader>

          {deleteError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {deleteError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => {
                setDeletingRuleId(null);
                setDeleteError(null);
              }}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => {
                void handleDelete();
              }}
            >
              {isDeleting ? "削除中..." : "削除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
