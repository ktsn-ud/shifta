"use client";

import Link from "next/link";
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
import { formatWorkplaceType } from "@/lib/enum-labels";
import { messages, toErrorMessage } from "@/lib/messages";

const workplaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["GENERAL", "CRAM_SCHOOL"]),
  color: z.string(),
  _count: z.object({
    shifts: z.number().int().nonnegative(),
    payrollRules: z.number().int().nonnegative(),
    timetables: z.number().int().nonnegative(),
  }),
});

const workplaceListResponseSchema = z.object({
  data: z.array(workplaceSchema),
});

const workplaceDeleteResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    deleted: z.boolean(),
    relatedCounts: z.object({
      shifts: z.number().int().nonnegative(),
      payrollRules: z.number().int().nonnegative(),
      timetables: z.number().int().nonnegative(),
    }),
  }),
  warning: z.string().nullable().optional(),
});

type Workplace = z.infer<typeof workplaceSchema>;
type WorkplaceListProps = {
  initialWorkplaces?: Workplace[];
};

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

export function WorkplaceList({ initialWorkplaces }: WorkplaceListProps) {
  const hasInitialData = initialWorkplaces !== undefined;
  const [workplaces, setWorkplaces] = useState<Workplace[]>(
    () => initialWorkplaces ?? [],
  );
  const [isLoading, setIsLoading] = useState(() => !hasInitialData);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deletingTarget = useMemo(
    () => workplaces.find((workplace) => workplace.id === deletingId) ?? null,
    [deletingId, workplaces],
  );

  useEffect(() => {
    if (hasInitialData) {
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();

    async function fetchWorkplaces() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/workplaces", {
          signal: abortController.signal,
        });

        if (response.ok === false) {
          throw new Error(
            await readApiErrorMessage(
              response,
              "勤務先一覧の取得に失敗しました。",
            ),
          );
        }

        const parsed = workplaceListResponseSchema.safeParse(
          (await response.json()) as unknown,
        );
        if (parsed.success === false) {
          throw new Error("勤務先一覧レスポンスの形式が不正です。");
        }

        setWorkplaces(parsed.data.data);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch workplaces", error);
        setWorkplaces([]);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "勤務先一覧の取得に失敗しました。",
        );
      } finally {
        if (abortController.signal.aborted === false) {
          setIsLoading(false);
        }
      }
    }

    void fetchWorkplaces();

    return () => {
      abortController.abort();
    };
  }, [hasInitialData]);

  const confirmDelete = async () => {
    if (!deletingTarget) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    setInfoMessage(null);

    try {
      const response = await fetch(`/api/workplaces/${deletingTarget.id}`, {
        method: "DELETE",
      });

      if (response.ok === false) {
        throw new Error(
          await readApiErrorMessage(response, "勤務先の削除に失敗しました。"),
        );
      }

      const parsed = workplaceDeleteResponseSchema.safeParse(
        (await response.json()) as unknown,
      );
      if (parsed.success === false) {
        throw new Error("勤務先削除レスポンスの形式が不正です。");
      }

      setWorkplaces((current) =>
        current.filter((workplace) => workplace.id !== deletingTarget.id),
      );

      if (parsed.data.warning) {
        toast.warning(messages.success.workplaceDeleted, {
          description: parsed.data.warning,
          duration: 6000,
        });
        setInfoMessage(
          `${deletingTarget.name} を削除しました。${parsed.data.warning}`,
        );
      } else {
        toast.success(messages.success.workplaceDeleted, {
          description: deletingTarget.name,
        });
        setInfoMessage(`${deletingTarget.name} を削除しました。`);
      }

      setDeletingId(null);
    } catch (error) {
      console.error("failed to delete workplace", error);
      const message = toErrorMessage(error, "勤務先の削除に失敗しました。");
      setDeleteError(message);
      toast.error(messages.error.workplaceDeleteFailed, {
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
          <h2 className="text-xl font-semibold">勤務先管理</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            勤務先の作成・編集・削除を行います。
          </p>
        </div>
        <Link href="/my/workplaces/new" className={buttonVariants({})}>
          新規追加
        </Link>
      </header>

      {infoMessage ? (
        <p className="rounded-md border border-emerald-700/30 bg-emerald-700/5 px-3 py-2 text-sm text-emerald-800">
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
          <CardTitle>勤務先一覧</CardTitle>
          <CardDescription>
            一覧から給与ルール管理・時間割管理へ遷移できます。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableLoadingSkeleton rows={6} columns={5} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>勤務先名</TableHead>
                  <TableHead>タイプ</TableHead>
                  <TableHead>色</TableHead>
                  <TableHead>関連データ</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workplaces.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-16 text-center">
                      勤務先がありません。
                    </TableCell>
                  </TableRow>
                ) : (
                  workplaces.map((workplace) => (
                    <TableRow key={workplace.id}>
                      <TableCell className="font-medium">
                        {workplace.name}
                      </TableCell>
                      <TableCell>
                        {formatWorkplaceType(workplace.type)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block size-4 rounded-full border"
                            style={{ backgroundColor: workplace.color }}
                            aria-label={`カラー ${workplace.color}`}
                          />
                          <span className="text-sm text-muted-foreground">
                            {workplace.color}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        シフト {workplace._count.shifts} / 給与ルール{" "}
                        {workplace._count.payrollRules} / 時間割{" "}
                        {workplace._count.timetables}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            href={`/my/workplaces/${workplace.id}/edit`}
                            className={buttonVariants({
                              size: "sm",
                              variant: "outline",
                            })}
                          >
                            編集
                          </Link>
                          <Link
                            href={`/my/workplaces/${workplace.id}/payroll-rules`}
                            className={buttonVariants({
                              size: "sm",
                              variant: "outline",
                            })}
                          >
                            給与ルール
                          </Link>
                          {workplace.type === "CRAM_SCHOOL" ? (
                            <Link
                              href={`/my/workplaces/${workplace.id}/timetables`}
                              className={buttonVariants({
                                size: "sm",
                                variant: "outline",
                              })}
                            >
                              時間割
                            </Link>
                          ) : (
                            <Button size="sm" variant="outline" disabled>
                              時間割
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setDeleteError(null);
                              setDeletingId(workplace.id);
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
        open={deletingTarget !== null}
        onOpenChange={(open) => {
          if (open === false) {
            setDeletingId(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>勤務先を削除しますか？</DialogTitle>
            <DialogDescription>
              {deletingTarget
                ? `${deletingTarget.name} を削除します。この操作は取り消せません。`
                : "この操作は取り消せません。"}
            </DialogDescription>
          </DialogHeader>

          {deletingTarget ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              関連データ: シフト {deletingTarget._count.shifts} 件 / 給与ルール{" "}
              {deletingTarget._count.payrollRules} 件 / 時間割{" "}
              {deletingTarget._count.timetables} 件
            </div>
          ) : null}

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
                setDeletingId(null);
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
                void confirmDelete();
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
