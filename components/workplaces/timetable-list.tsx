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
import { messages, toErrorMessage } from "@/lib/messages";
import { resolveUserFacingErrorFromResponse } from "@/lib/user-facing-error";

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

type WorkplaceType = "GENERAL" | "CRAM_SCHOOL";

type WorkplaceResponse = {
  data: {
    id: string;
    name: string;
    type: WorkplaceType;
    color: string;
  };
};

type TimetableItem = {
  id: string;
  timetableSetId: string;
  period: number;
  startTime: string;
  endTime: string;
  startTimeLabel?: string;
  endTimeLabel?: string;
};

type TimetableSet = {
  id: string;
  workplaceId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  items: TimetableItem[];
};

type TimetableListResponse = {
  data: TimetableSet[];
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

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function parseWorkplaceResponse(value: unknown): WorkplaceResponse | null {
  if (!isRecord(value) || !isRecord(value.data)) {
    return null;
  }

  if (
    typeof value.data.id !== "string" ||
    typeof value.data.name !== "string" ||
    !isWorkplaceType(value.data.type) ||
    typeof value.data.color !== "string"
  ) {
    return null;
  }

  return {
    data: {
      id: value.data.id,
      name: value.data.name,
      type: value.data.type,
      color: value.data.color,
    },
  };
}

function parseTimetableItem(value: unknown): TimetableItem | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.timetableSetId !== "string" ||
    !isPositiveInteger(value.period) ||
    typeof value.startTime !== "string" ||
    typeof value.endTime !== "string"
  ) {
    return null;
  }

  if (
    value.startTimeLabel !== undefined &&
    typeof value.startTimeLabel !== "string"
  ) {
    return null;
  }

  if (
    value.endTimeLabel !== undefined &&
    typeof value.endTimeLabel !== "string"
  ) {
    return null;
  }

  return {
    id: value.id,
    timetableSetId: value.timetableSetId,
    period: value.period,
    startTime: value.startTime,
    endTime: value.endTime,
    ...(value.startTimeLabel !== undefined
      ? { startTimeLabel: value.startTimeLabel }
      : {}),
    ...(value.endTimeLabel !== undefined
      ? { endTimeLabel: value.endTimeLabel }
      : {}),
  };
}

function parseTimetableSet(value: unknown): TimetableSet | null {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.workplaceId !== "string" ||
    typeof value.name !== "string" ||
    !isInteger(value.sortOrder) ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return null;
  }

  const items: TimetableItem[] = [];
  for (const item of value.items) {
    const parsed = parseTimetableItem(item);
    if (!parsed) {
      return null;
    }
    items.push(parsed);
  }

  return {
    id: value.id,
    workplaceId: value.workplaceId,
    name: value.name,
    sortOrder: value.sortOrder,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    items,
  };
}

function parseTimetableListResponse(
  value: unknown,
): TimetableListResponse | null {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    return null;
  }

  const sets: TimetableSet[] = [];
  for (const item of value.data) {
    const parsed = parseTimetableSet(item);
    if (!parsed) {
      return null;
    }
    sets.push(parsed);
  }

  return { data: sets };
}

async function readApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const resolved = await resolveUserFacingErrorFromResponse(response, fallback);
  return resolved.message;
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
    type: WorkplaceType;
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

        const parsedWorkplace = parseWorkplaceResponse(
          (await workplaceResponse.json()) as unknown,
        );
        if (!parsedWorkplace) {
          throw new Error("勤務先情報レスポンスの形式が不正です。");
        }

        setWorkplace(parsedWorkplace.data);

        if (parsedWorkplace.data.type !== "CRAM_SCHOOL") {
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

        const parsedTimetables = parseTimetableListResponse(
          (await timetableResponse.json()) as unknown,
        );
        if (!parsedTimetables) {
          throw new Error("時間割一覧レスポンスの形式が不正です。");
        }

        setTimetableSets(parsedTimetables.data);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch timetables", error);
        setWorkplace(null);
        setTimetableSets([]);
        setErrorMessage(
          toErrorMessage(error, "時間割一覧の取得に失敗しました。"),
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
