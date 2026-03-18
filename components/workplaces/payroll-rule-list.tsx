"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const workplaceResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["GENERAL", "CRAM_SCHOOL"]),
    color: z.string(),
  }),
});

const numericValueSchema = z.union([z.number(), z.string()]);

const payrollRuleSchema = z.object({
  id: z.string(),
  workplaceId: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  baseHourlyWage: numericValueSchema,
  perLessonWage: numericValueSchema.nullable(),
  holidayHourlyWage: numericValueSchema.nullable(),
  nightMultiplier: numericValueSchema,
  overtimeMultiplier: numericValueSchema,
  nightStart: z.string(),
  nightEnd: z.string(),
  dailyOvertimeThreshold: numericValueSchema,
  holidayType: z.enum(["NONE", "WEEKEND", "HOLIDAY", "WEEKEND_HOLIDAY"]),
});

const payrollRuleListResponseSchema = z.object({
  data: z.array(payrollRuleSchema),
});

type PayrollRuleListProps = {
  workplaceId: string;
};

type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";
type PayrollRule = z.infer<typeof payrollRuleSchema>;

async function readApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    return fallback;
  }

  return fallback;
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

function formatCurrency(value: string | number | null): string {
  const numeric = toNumber(value);
  if (numeric === null) {
    return "-";
  }

  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 2,
  }).format(numeric);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "現在";
  }

  return dateKeyFromApiDate(value);
}

function formatMultiplier(value: string | number): string {
  const numeric = toNumber(value);
  if (numeric === null) {
    return "-";
  }

  return `${numeric.toFixed(2)}x`;
}

export function PayrollRuleList({ workplaceId }: PayrollRuleListProps) {
  const searchParams = useSearchParams();
  const queryWarning = searchParams.get("warning");

  const [workplace, setWorkplace] = useState<{
    id: string;
    name: string;
    type: WorkplaceType;
    color: string;
  } | null>(null);
  const [rules, setRules] = useState<PayrollRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(queryWarning);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deletingRule = useMemo(
    () => rules.find((rule) => rule.id === deletingRuleId) ?? null,
    [deletingRuleId, rules],
  );

  useEffect(() => {
    setInfoMessage(queryWarning);
  }, [queryWarning]);

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchData() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [workplaceResponse, rulesResponse] = await Promise.all([
          fetch(`/api/workplaces/${workplaceId}`, {
            cache: "no-store",
            signal: abortController.signal,
          }),
          fetch(`/api/workplaces/${workplaceId}/payroll-rules`, {
            cache: "no-store",
            signal: abortController.signal,
          }),
        ]);

        if (workplaceResponse.ok === false) {
          throw new Error(
            await readApiErrorMessage(
              workplaceResponse,
              "勤務先情報の取得に失敗しました。",
            ),
          );
        }

        if (rulesResponse.ok === false) {
          throw new Error(
            await readApiErrorMessage(
              rulesResponse,
              "給与ルール一覧の取得に失敗しました。",
            ),
          );
        }

        const parsedWorkplace = workplaceResponseSchema.safeParse(
          (await workplaceResponse.json()) as unknown,
        );
        if (parsedWorkplace.success === false) {
          throw new Error("勤務先情報レスポンスの形式が不正です。");
        }

        const parsedRules = payrollRuleListResponseSchema.safeParse(
          (await rulesResponse.json()) as unknown,
        );
        if (parsedRules.success === false) {
          throw new Error("給与ルール一覧レスポンスの形式が不正です。");
        }

        setWorkplace(parsedWorkplace.data.data);
        setRules(parsedRules.data.data);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch payroll rules", error);
        setWorkplace(null);
        setRules([]);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "給与ルール一覧の取得に失敗しました。",
        );
      } finally {
        if (abortController.signal.aborted === false) {
          setIsLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      abortController.abort();
    };
  }, [workplaceId]);

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

      setRules((current) =>
        current.filter((rule) => rule.id !== deletingRule.id),
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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">給与ルール</h2>
          <p className="mt-1 text-sm text-muted-foreground">
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
            <p className="text-sm text-muted-foreground">読み込み中です...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>適用期間</TableHead>
                  <TableHead>
                    {workplace?.type === "CRAM_SCHOOL" ? "コマ給" : "基本時給"}
                  </TableHead>
                  {workplace?.type === "GENERAL" ? (
                    <>
                      <TableHead>深夜倍率</TableHead>
                      <TableHead>残業倍率</TableHead>
                    </>
                  ) : null}
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={workplace?.type === "GENERAL" ? 5 : 3}
                      className="h-16 text-center"
                    >
                      給与ルールがありません。
                    </TableCell>
                  </TableRow>
                ) : (
                  rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">
                        {formatDate(rule.startDate)} 〜{" "}
                        {formatDate(rule.endDate)}
                      </TableCell>
                      <TableCell>
                        {workplace?.type === "CRAM_SCHOOL"
                          ? formatCurrency(rule.perLessonWage)
                          : formatCurrency(rule.baseHourlyWage)}
                      </TableCell>
                      {workplace?.type === "GENERAL" ? (
                        <>
                          <TableCell>
                            {formatMultiplier(rule.nightMultiplier)}
                          </TableCell>
                          <TableCell>
                            {formatMultiplier(rule.overtimeMultiplier)}
                          </TableCell>
                        </>
                      ) : null}
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
