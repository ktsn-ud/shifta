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
import { formatLessonType } from "@/lib/enum-labels";
import { messages, toErrorMessage } from "@/lib/messages";

const workplaceResponseSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["GENERAL", "CRAM_SCHOOL"]),
    color: z.string(),
  }),
});

const timetableSchema = z.object({
  id: z.string(),
  workplaceId: z.string(),
  type: z.enum(["NORMAL", "INTENSIVE"]),
  period: z.number().int().positive(),
  startTime: z.string(),
  endTime: z.string(),
});

const timetableListResponseSchema = z.object({
  data: z.array(timetableSchema),
});

type TimetableListProps = {
  workplaceId: string;
};

type Timetable = z.infer<typeof timetableSchema>;

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

export function TimetableList({ workplaceId }: TimetableListProps) {
  const [workplace, setWorkplace] = useState<{
    id: string;
    name: string;
    type: "GENERAL" | "CRAM_SCHOOL";
    color: string;
  } | null>(null);
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deletingTarget = useMemo(
    () => timetables.find((timetable) => timetable.id === deletingId) ?? null,
    [deletingId, timetables],
  );

  const normalTimetables = useMemo(
    () => timetables.filter((timetable) => timetable.type === "NORMAL"),
    [timetables],
  );
  const intensiveTimetables = useMemo(
    () => timetables.filter((timetable) => timetable.type === "INTENSIVE"),
    [timetables],
  );

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchData() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const workplaceResponse = await fetch(
          `/api/workplaces/${workplaceId}`,
          {
            cache: "no-store",
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
          setTimetables([]);
          return;
        }

        const timetableResponse = await fetch(
          `/api/workplaces/${workplaceId}/timetables`,
          {
            cache: "no-store",
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

        setTimetables(parsedTimetables.data.data);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch timetables", error);
        setWorkplace(null);
        setTimetables([]);
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
  }, [workplaceId]);

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
          await readApiErrorMessage(response, "時間割の削除に失敗しました。"),
        );
      }

      setTimetables((current) =>
        current.filter((timetable) => timetable.id !== deletingTarget.id),
      );
      setDeletingId(null);
      setInfoMessage("時間割を削除しました。");
      toast.success(messages.success.timetableDeleted);
    } catch (error) {
      console.error("failed to delete timetable", error);
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

  const renderTable = (title: string, items: Timetable[]) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{title}のコマ一覧</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>コマ番号</TableHead>
              <TableHead>開始時刻</TableHead>
              <TableHead>終了時刻</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-16 text-center">
                  登録がありません。
                </TableCell>
              </TableRow>
            ) : (
              items.map((timetable) => (
                <TableRow key={timetable.id}>
                  <TableCell className="font-medium">
                    {timetable.period}
                  </TableCell>
                  <TableCell>{toTimeOnly(timetable.startTime)}</TableCell>
                  <TableCell>{toTimeOnly(timetable.endTime)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/my/workplaces/${workplaceId}/timetables/${timetable.id}/edit`}
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
                          setDeletingId(timetable.id);
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
      </CardContent>
    </Card>
  );

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">時間割</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {workplace
              ? `${workplace.name} の塾時間割を管理します。`
              : "勤務先ごとの塾時間割を管理します。"}
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
              新規時間割追加
            </Link>
          ) : (
            <Button disabled>新規時間割追加</Button>
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
        <TableLoadingSkeleton rows={5} columns={3} />
      ) : workplace?.type !== "CRAM_SCHOOL" ? (
        <Card>
          <CardHeader>
            <CardTitle>操作対象外の勤務先です</CardTitle>
            <CardDescription>
              時間割は塾タイプの勤務先でのみ操作できます。
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {renderTable(formatLessonType("NORMAL"), normalTimetables)}
          {renderTable(formatLessonType("INTENSIVE"), intensiveTimetables)}
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
            <DialogTitle>時間割を削除しますか？</DialogTitle>
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
