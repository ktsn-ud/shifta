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
import { parseGoogleSyncStateFromPayload } from "@/lib/google-calendar/clientSync";
import { messages, toErrorMessage } from "@/lib/messages";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { buildMutationSuccessDescription } from "@/lib/query/mutation-toast";
import { invalidateAfterTimetableMutation } from "@/lib/query/invalidation";
import {
  useWorkplaceDetailQuery,
  useWorkplaceTimetablesQuery,
} from "@/lib/query/queries/workplaces";
import { queryKeys } from "@/lib/query/query-keys";
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
  const queryClient = getBrowserQueryClient();
  const workplaceQuery = useWorkplaceDetailQuery({
    workplaceId,
    initialData: initialWorkplace ?? null,
  });
  const workplace = workplaceQuery.data ?? null;
  const timetablesQuery = useWorkplaceTimetablesQuery({
    workplaceId,
    enabled: workplace?.type === "CRAM_SCHOOL",
    initialData: workplace?.type === "CRAM_SCHOOL" ? initialTimetables : [],
  });
  const timetableSets = useMemo(
    () => timetablesQuery.data ?? [],
    [timetablesQuery.data],
  );
  const isLoading = workplaceQuery.isLoading || timetablesQuery.isLoading;
  const errorMessage = workplaceQuery.error
    ? toErrorMessage(workplaceQuery.error, "勤務先情報の取得に失敗しました。")
    : timetablesQuery.error
      ? toErrorMessage(
          timetablesQuery.error,
          "時間割一覧の取得に失敗しました。",
        )
      : null;
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deletingTarget = useMemo(
    () => timetableSets.find((set) => set.id === deletingId) ?? null,
    [deletingId, timetableSets],
  );

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

      const responsePayload = (await response.json()) as unknown;
      const syncState = parseGoogleSyncStateFromPayload(
        responsePayload,
        messages.error.calendarSyncFailed,
      );

      await invalidateAfterTimetableMutation(queryClient, workplaceId);
      queryClient.setQueryData<TimetableSet[]>(
        queryKeys.workplaces.timetables({ workplaceId }),
        (current) =>
          (current ?? []).filter((set) => set.id !== deletingTarget.id),
      );
      setDeletingId(null);
      setInfoMessage("時間割セットを削除しました。");
      toast.success(messages.success.timetableDeleted, {
        description: buildMutationSuccessDescription({
          syncPending: syncState.pending,
        }),
      });
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
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border/80 bg-card/95 p-5 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Timetable
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">時間割</h2>
          <p className="text-sm text-muted-foreground">
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
