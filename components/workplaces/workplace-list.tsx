"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { formatWorkplaceType } from "@/lib/enum-labels";
import { messages, toErrorMessage } from "@/lib/messages";
import { resolveUserFacingErrorFromResponse } from "@/lib/user-facing-error";

type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";

type RelatedCounts = {
  shifts: number;
  payrollRules: number;
  timetableSets: number;
};

type Workplace = {
  id: string;
  name: string;
  type: WorkplaceType;
  color: string;
  _count: RelatedCounts;
};

type WorkplaceListResponse = {
  data: Workplace[];
};

type WorkplaceDeleteResponse = {
  data: {
    id: string;
    deleted: boolean;
    relatedCounts: RelatedCounts;
  };
  warning?: string | null;
};

type WorkplaceListProps = {
  initialWorkplaces?: Workplace[];
};

const WORKPLACE_TYPES: WorkplaceType[] = ["GENERAL", "CRAM_SCHOOL"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWorkplaceType(value: unknown): value is WorkplaceType {
  return (
    typeof value === "string" &&
    WORKPLACE_TYPES.includes(value as WorkplaceType)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseRelatedCounts(value: unknown): RelatedCounts | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isNonNegativeInteger(value.shifts) ||
    !isNonNegativeInteger(value.payrollRules) ||
    !isNonNegativeInteger(value.timetableSets)
  ) {
    return null;
  }

  return {
    shifts: value.shifts,
    payrollRules: value.payrollRules,
    timetableSets: value.timetableSets,
  };
}

function parseWorkplace(value: unknown): Workplace | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isWorkplaceType(value.type) ||
    typeof value.color !== "string"
  ) {
    return null;
  }

  const relatedCounts = parseRelatedCounts(value._count);
  if (!relatedCounts) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    type: value.type,
    color: value.color,
    _count: relatedCounts,
  };
}

function parseWorkplaceListResponse(
  value: unknown,
): WorkplaceListResponse | null {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return null;
  }

  const workplaces: Workplace[] = [];
  for (const item of value.data) {
    const workplace = parseWorkplace(item);
    if (!workplace) {
      return null;
    }
    workplaces.push(workplace);
  }

  return { data: workplaces };
}

function parseWorkplaceDeleteResponse(
  value: unknown,
): WorkplaceDeleteResponse | null {
  if (!isRecord(value) || !isRecord(value.data)) {
    return null;
  }

  const relatedCounts = parseRelatedCounts(value.data.relatedCounts);
  if (
    typeof value.data.id !== "string" ||
    typeof value.data.deleted !== "boolean" ||
    !relatedCounts
  ) {
    return null;
  }

  if (
    value.warning !== undefined &&
    value.warning !== null &&
    typeof value.warning !== "string"
  ) {
    return null;
  }

  return {
    data: {
      id: value.data.id,
      deleted: value.data.deleted,
      relatedCounts,
    },
    ...(value.warning !== undefined ? { warning: value.warning } : {}),
  };
}

async function readApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const resolved = await resolveUserFacingErrorFromResponse(response, fallback);
  return resolved.message;
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

        const parsed = parseWorkplaceListResponse(
          (await response.json()) as unknown,
        );
        if (!parsed) {
          throw new Error("勤務先一覧レスポンスの形式が不正です。");
        }

        setWorkplaces(parsed.data);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch workplaces", error);
        setWorkplaces([]);
        setErrorMessage(
          toErrorMessage(error, "勤務先一覧の取得に失敗しました。"),
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

      const parsed = parseWorkplaceDeleteResponse(
        (await response.json()) as unknown,
      );
      if (!parsed) {
        throw new Error("勤務先削除レスポンスの形式が不正です。");
      }

      setWorkplaces((current) =>
        current.filter((workplace) => workplace.id !== deletingTarget.id),
      );

      if (parsed.warning) {
        toast.warning(messages.success.workplaceDeleted, {
          description: parsed.warning,
          duration: 6000,
        });
        setInfoMessage(
          `${deletingTarget.name} を削除しました。${parsed.warning}`,
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
                        {workplace._count.timetableSets}
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
              {deletingTarget._count.timetableSets} 件
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
