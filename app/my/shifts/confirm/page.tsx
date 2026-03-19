"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmShiftCard } from "@/components/shifts/ConfirmShiftCard";
import { ConfirmedShiftsList } from "@/components/shifts/ConfirmedShiftsList";
import {
  type ConfirmedShiftWorkplaceGroup,
  type UnconfirmedShiftItem,
} from "@/components/shifts/shift-confirmation-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type UnconfirmedShiftApiResponse = {
  shifts: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    isConfirmed: boolean;
    workplace: {
      id: string;
      name: string;
      color: string;
    };
  }>;
};

type ConfirmedShiftApiResponse = {
  shifts: Array<{
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    breakMinutes: number;
    workDurationHours: number;
    isConfirmed: boolean;
    workplace: {
      id: string;
      name: string;
    };
  }>;
};

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateWithWeekday(dateOnly: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(parseDateOnly(dateOnly));
}

function formatDate(dateOnly: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(parseDateOnly(dateOnly));
}

export default function ShiftConfirmPage() {
  const [unconfirmedShifts, setUnconfirmedShifts] = useState<
    UnconfirmedShiftItem[]
  >([]);
  const [confirmedShiftGroups, setConfirmedShiftGroups] = useState<
    ConfirmedShiftWorkplaceGroup[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadShiftConfirmationData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [unconfirmedResponse, confirmedResponse] = await Promise.all([
        fetch("/api/shifts/unconfirmed", {
          cache: "no-store",
        }),
        fetch("/api/shifts/confirmed-current-month", {
          cache: "no-store",
        }),
      ]);

      if (unconfirmedResponse.ok === false) {
        throw new Error("UNCONFIRMED_SHIFTS_FETCH_FAILED");
      }

      if (confirmedResponse.ok === false) {
        throw new Error("CONFIRMED_SHIFTS_FETCH_FAILED");
      }

      const unconfirmedPayload = (await unconfirmedResponse.json()) as
        | UnconfirmedShiftApiResponse
        | undefined;
      const confirmedPayload = (await confirmedResponse.json()) as
        | ConfirmedShiftApiResponse
        | undefined;

      if (!unconfirmedPayload || !Array.isArray(unconfirmedPayload.shifts)) {
        throw new Error("UNCONFIRMED_SHIFTS_RESPONSE_INVALID");
      }

      if (!confirmedPayload || !Array.isArray(confirmedPayload.shifts)) {
        throw new Error("CONFIRMED_SHIFTS_RESPONSE_INVALID");
      }

      setUnconfirmedShifts(
        unconfirmedPayload.shifts.map((shift) => ({
          id: shift.id,
          date: formatDateWithWeekday(shift.date),
          workplaceName: shift.workplace.name,
          startTime: shift.startTime,
          endTime: shift.endTime,
          breakMinutes: shift.breakMinutes,
        })),
      );

      const grouped = new Map<string, ConfirmedShiftWorkplaceGroup>();

      for (const shift of confirmedPayload.shifts) {
        const existing = grouped.get(shift.workplace.id);
        if (existing) {
          existing.shifts.push({
            id: shift.id,
            date: formatDate(shift.date),
            startTime: shift.startTime,
            endTime: shift.endTime,
            workDurationHours: shift.workDurationHours,
          });
          continue;
        }

        grouped.set(shift.workplace.id, {
          workplaceId: shift.workplace.id,
          workplaceName: shift.workplace.name,
          shifts: [
            {
              id: shift.id,
              date: formatDate(shift.date),
              startTime: shift.startTime,
              endTime: shift.endTime,
              workDurationHours: shift.workDurationHours,
            },
          ],
        });
      }

      setConfirmedShiftGroups(Array.from(grouped.values()));
    } catch (error) {
      console.error("failed to fetch shift confirmation data", error);
      setUnconfirmedShifts([]);
      setConfirmedShiftGroups([]);
      setErrorMessage("シフト確定ページのデータ取得に失敗しました。");
      toast.error("シフト確定ページのデータ取得に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadShiftConfirmationData();
  }, [loadShiftConfirmationData]);

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <h2 className="text-xl font-semibold">シフト確定</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          未確定シフトの時刻調整と確定・削除を行えます。
        </p>
      </header>

      {errorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>未確定シフト</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : unconfirmedShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              未確定シフトはありません
            </p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto pr-1">
              <div className="flex flex-col gap-3">
                {unconfirmedShifts.map((shift) => (
                  <ConfirmShiftCard
                    key={shift.id}
                    shift={shift}
                    onChange={(shiftId, patch) => {
                      setUnconfirmedShifts((current) =>
                        current.map((item) =>
                          item.id === shiftId ? { ...item, ...patch } : item,
                        ),
                      );
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmedShiftGroups.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">今月の確定済みシフト</h3>
          <ConfirmedShiftsList groups={confirmedShiftGroups} />
        </section>
      ) : null}
    </section>
  );
}
