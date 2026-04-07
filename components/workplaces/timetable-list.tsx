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
import { messages, toErrorMessage } from "@/lib/messages";

const workplaceResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["GENERAL", "CRAM_SCHOOL"]),
    color: z.string(),
  }),
});

const timetableItemSchema = z.object({
  id: z.string(),
  timetableSetId: z.string(),
  period: z.number().int().positive(),
  startTime: z.string(),
  endTime: z.string(),
  startTimeLabel: z.string().optional(),
  endTimeLabel: z.string().optional(),
});

const timetableSetSchema = z.object({
  id: z.string(),
  workplaceId: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(timetableItemSchema),
});

const timetableListResponseSchema = z.object({
  data: z.array(timetableSetSchema),
});

type TimetableListProps = {
  workplaceId: string;
  initialWorkplace?: {
    id: string;
    name: string;
    type: "GENERAL" | "CRAM_SCHOOL";
    color: string;
  } | null;
  initialTimetables?: TimetableSet[];
};

type TimetableSet = z.infer<typeof timetableSetSchema>;

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

function toTimeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

export function TimetableList({
  workplaceId,
  initialWorkplace,
  initialTimetables,
}: TimetableListProps) {
  const hasInitialData =
    initialWorkplace !== undefined && initialTimetables !== undefined;
  const [workplace, setWorkplace] = useState<{
    id: string;
    name: string;
    type: "GENERAL" | "CRAM_SCHOOL";
    color: string;
  } | null>(() => initialWorkplace ?? null);
  const [timetableSets, setTimetableSets] = useState<TimetableSet[]>(
    () => initialTimetables ?? [],
  );
  const [isLoading, setIsLoading] = useState(() => !hasInitialData);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deletingTarget = useMemo(
    () => timetableSets.find((set) => set.id === deletingId) ?? null,
    [deletingId, timetableSets],
  );

  useEffect(() => {
    if (hasInitialData) {
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();

    async function fetchData() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const workplaceResponse = await fetch(
          `/api/workplaces/${workplaceId}`,
          {
            signal: abortController.signal,
          },
        );
        if (workplaceResponse.ok === false) {
          throw new Error(
            await readApiErrorMessage(
              workplaceResponse,
              "勤務先情報の取得に失敗しました。",
            ),
          );
        }

        const parsedWorkplace = workplaceResponseSchema.safeParse(
          (await workplaceResponse.json()) as unknown,
        );
        if (parsedWorkplace.success === false) {
          throw new Error("勤務先情報レスポンスの形式が不正です。");
        }

        setWorkplace(parsedWorkplace.data.data);

        if (parsedWorkplace.data.data.type !== "CRAM_SCHOOL") {
          setTimetableSets([]);
          return;
        }

        const timetableResponse = await fetch(
          `/api/workplaces/${workplaceId}/timetables`,
          {
            signal: abortController.signal,
          },
        );
        if (timetableResponse.ok === false) {
          throw new Error(
            await readApiErrorMessage(
              timetableResponse,
              "時間割一覧の取得に失敗しました。",
            ),
          );
        }

        const parsedTimetables = timetableListResponseSchema.safeParse(
          (await timetableResponse.json()) as unknown,
        );
        if (parsedTimetables.success === false) {
          throw new Error("時間割一覧レスポンスの形式が不正です。");
        }

        setTimetableSets(parsedTimetables.data.data);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch timetables", error);
        setWorkplace(null);
        setTimetableSets([]);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "時間割一覧の取得に失敗しました。",
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
  }, [hasInitialData, workplaceId]);

  const handleDelete = async () => {
    if (!deletingTarget) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(
        `/api/workplaces/${workplaceId}/timetables/${deletingTarget.id}`,
        {
          method: "DELETE",
        },
      );
      if (response.ok === false) {
        throw new Error(
          await readApiErrorMessage(
            response,
            "時間割セットの削除に失敗しました。",
          ),
        );
      }

      setTimetableSets((current) =>
        current.filter((set) => set.id !== deletingTarget.id),
      );
      setDeletingId(null);
      setInfoMessage("時間割セットを削除しました。");
      toast.success(messages.success.timetableDeleted);
    } catch (error) {
      console.error("failed to delete timetable set", error);
      const message = toErrorMessage(
        error,
        messages.error.timetableDeleteFailed,
      );
      setDeleteError(message);
      toast.error(messages.error.timetableDeleteFailed, {
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
          <h2 className="text-xl font-semibold">時間割</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {workplace
              ? `${workplace.name} の時間割セットを管理します。`
              : "勤務先ごとの時間割セットを管理します。"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/my/workplaces"
            className={buttonVariants({ variant: "outline" })}
          >
            勤務先一覧へ
          </Link>
          {workplace?.type === "CRAM_SCHOOL" ? (
            <Link
              href={`/my/workplaces/${workplaceId}/timetables/new`}
              className={buttonVariants({})}
            >
              新規時間割セット追加
            </Link>
          ) : (
            <Button disabled>新規時間割セット追加</Button>
          )}
        </div>
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

      {isLoading ? (
        <TableLoadingSkeleton rows={5} columns={4} />
      ) : workplace?.type !== "CRAM_SCHOOL" ? (
        <Card>
          <CardHeader>
            <CardTitle>操作対象外の勤務先です</CardTitle>
            <CardDescription>
              時間割は塾タイプの勤務先でのみ操作できます。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : timetableSets.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>時間割セットがありません</CardTitle>
            <CardDescription>
              「新規時間割セット追加」から作成してください。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {timetableSets.map((set) => (
            <Card key={set.id}>
              <CardHeader>
                <CardTitle>{set.name}</CardTitle>
                <CardDescription>コマ数: {set.items.length}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>コマ番号</TableHead>
                      <TableHead>開始時刻</TableHead>
                      <TableHead>終了時刻</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {set.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="h-14 text-center">
                          登録がありません。
                        </TableCell>
                      </TableRow>
                    ) : (
                      set.items
                        .slice()
                        .sort((left, right) => left.period - right.period)
                        .map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.period}限
                            </TableCell>
                            <TableCell>
                              {item.startTimeLabel ??
                                toTimeOnly(item.startTime)}
                            </TableCell>
                            <TableCell>
                              {item.endTimeLabel ?? toTimeOnly(item.endTime)}
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>

                <div className="flex justify-end gap-2">
                  <Link
                    href={`/my/workplaces/${workplaceId}/timetables/${set.id}/edit`}
                    className={buttonVariants({
                      size: "sm",
                      variant: "outline",
                    })}
                  >
                    編集
                  </Link>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setDeleteError(null);
                      setDeletingId(set.id);
                    }}
                  >
                    削除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
            <DialogTitle>時間割セットを削除しますか？</DialogTitle>
            <DialogDescription>
              {deletingTarget
                ? `${deletingTarget.name} を削除します。この操作は取り消せません。`
                : "この操作は取り消せません。"}
            </DialogDescription>
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
