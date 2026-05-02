"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { TIME_ONLY_REGEX } from "@/lib/api/date-time";
import { clearShiftDerivedCaches } from "@/lib/client-cache/shift-derived-cache";
import {
  parseGoogleSyncFailureFromPayload,
  readGoogleSyncFailureFromErrorResponse,
} from "@/lib/google-calendar/clientSync";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { messages, toErrorMessage } from "@/lib/messages";
import { formatShiftWorkplaceLabel } from "@/lib/shifts/format";
import { isOvernightShift, isSameTimeShift } from "@/lib/shifts/time";
import { useGoogleTokenExpiredSignOut } from "@/hooks/use-google-token-expired-signout";
import { ConfirmDialog } from "@/components/modal/confirm-dialog";
import type { UnconfirmedShiftItem } from "@/components/shifts/shift-confirmation-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type ConfirmShiftCardProps = {
  shift: UnconfirmedShiftItem;
  onActionCompleted?: () => Promise<void> | void;
};

type ValidationResult = {
  startTime: string;
  endTime: string;
  breakMinutes: number;
};

const GOOGLE_TOKEN_EXPIRED_DESCRIPTION =
  "3秒後にログアウトします。再度Googleアカウントでログインしてください。";

function validateShiftInput(
  startTime: string,
  endTime: string,
  breakMinutesText: string,
):
  | { success: true; data: ValidationResult }
  | { success: false; message: string } {
  if (!TIME_ONLY_REGEX.test(startTime)) {
    return {
      success: false,
      message: "開始時刻はHH:MM形式で入力してください。",
    };
  }

  if (!TIME_ONLY_REGEX.test(endTime)) {
    return {
      success: false,
      message: "終了時刻はHH:MM形式で入力してください。",
    };
  }

  if (isSameTimeShift(startTime, endTime)) {
    return {
      success: false,
      message: "開始時刻と終了時刻は同じ時刻にできません。",
    };
  }

  const breakMinutes = Number(breakMinutesText);
  if (!Number.isInteger(breakMinutes)) {
    return {
      success: false,
      message: "休憩時間は整数で入力してください。",
    };
  }

  if (breakMinutes < 0 || breakMinutes > 240) {
    return {
      success: false,
      message: "休憩時間は0〜240分で入力してください。",
    };
  }

  return {
    success: true,
    data: {
      startTime,
      endTime,
      breakMinutes,
    },
  };
}

export function ConfirmShiftCard({
  shift,
  onActionCompleted,
}: ConfirmShiftCardProps) {
  const router = useRouter();
  const [startTime, setStartTime] = useState(shift.startTime);
  const [endTime, setEndTime] = useState(shift.endTime);
  const [breakMinutes, setBreakMinutes] = useState(String(shift.breakMinutes));
  const [isConfirming, setIsConfirming] = useState(false);
  const [isOvernightDialogOpen, setIsOvernightDialogOpen] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<ValidationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { isSignOutScheduled, scheduleSignOut } =
    useGoogleTokenExpiredSignOut();

  useEffect(() => {
    setStartTime(shift.startTime);
    setEndTime(shift.endTime);
    setBreakMinutes(String(shift.breakMinutes));
    setIsOvernightDialogOpen(false);
    setPendingConfirmation(null);
    setErrorMessage(null);
  }, [shift.breakMinutes, shift.endTime, shift.id, shift.startTime]);

  const isMutating = isConfirming || isSignOutScheduled;
  const workplaceLabel = formatShiftWorkplaceLabel({
    workplaceName: shift.workplaceName,
    comment: shift.comment,
  });

  const submitConfirmedShift = async (data: ValidationResult) => {
    setIsConfirming(true);
    try {
      const response = await fetch(`/api/shifts/${shift.id}/confirm`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (response.ok === false) {
        const apiError = await readGoogleSyncFailureFromErrorResponse(
          response,
          messages.error.shiftConfirmFailed,
        );

        if (apiError.requiresSignOut) {
          toast.error("Google 連携の有効期限が切れました", {
            description: GOOGLE_TOKEN_EXPIRED_DESCRIPTION,
            duration: 6000,
          });
          scheduleSignOut();
          return;
        }
        throw new Error(apiError.message);
      }

      const payload = (await response.json()) as unknown;
      const syncFailure = parseGoogleSyncFailureFromPayload(
        payload,
        messages.error.calendarSyncFailed,
      );

      clearShiftDerivedCaches();
      await onActionCompleted?.();

      if (syncFailure) {
        if (syncFailure.requiresSignOut) {
          toast.error("Google 連携の有効期限が切れました", {
            description: GOOGLE_TOKEN_EXPIRED_DESCRIPTION,
            duration: 6000,
          });
          scheduleSignOut();
          return;
        }

        toast.error(messages.error.calendarSyncFailed, {
          description: syncFailure.requiresCalendarSetup
            ? syncFailure.message
            : `${syncFailure.message} シフトは確定済みです。`,
          duration: 6000,
        });

        if (syncFailure.requiresCalendarSetup) {
          queueMicrotask(() => {
            router.push(CALENDAR_SETUP_PATH);
          });
        }
        return;
      }

      toast.success(messages.success.shiftConfirmed);
    } catch (error) {
      console.error("failed to confirm shift", error);
      setErrorMessage(toErrorMessage(error, messages.error.shiftConfirmFailed));
    } finally {
      setIsConfirming(false);
    }
  };

  const handleConfirm = async () => {
    if (isMutating) {
      return;
    }

    setErrorMessage(null);
    const validation = validateShiftInput(startTime, endTime, breakMinutes);
    if (!validation.success) {
      setErrorMessage(validation.message);
      return;
    }

    if (isOvernightShift(validation.data.startTime, validation.data.endTime)) {
      setPendingConfirmation(validation.data);
      setIsOvernightDialogOpen(true);
      return;
    }

    await submitConfirmedShift(validation.data);
  };

  return (
    <>
      <Card size="sm" className="w-full shadow-none md:max-w-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle className="font-bold">{shift.date}</CardTitle>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: shift.workplaceColor }}
              />
              <p>{workplaceLabel}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <label className="flex flex-col gap-1 text-sm">
              開始時刻
              <Input
                type="time"
                value={startTime}
                disabled={isMutating}
                onChange={(event) => setStartTime(event.currentTarget.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              終了時刻
              <Input
                type="time"
                value={endTime}
                disabled={isMutating}
                onChange={(event) => setEndTime(event.currentTarget.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              休憩時間（分）
              <Input
                type="number"
                min={0}
                max={240}
                value={breakMinutes}
                disabled={isMutating}
                onChange={(event) => setBreakMinutes(event.currentTarget.value)}
              />
            </label>

            <div className="flex items-end lg:justify-end">
              <Button
                type="button"
                className="w-full lg:w-auto"
                disabled={isMutating}
                onClick={handleConfirm}
              >
                <CheckIcon data-icon="inline-start" />
                {isConfirming ? "確定中..." : "確定"}
              </Button>
            </div>
          </div>

          {errorMessage ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={isOvernightDialogOpen}
        onOpenChange={setIsOvernightDialogOpen}
        title="このシフトは日付をまたぎます"
        description="終了時刻が開始時刻より早いため、翌日終了として確定します。よろしいですか？"
        confirmLabel="翌日終了として確定"
        cancelLabel="キャンセル"
        destructive={false}
        onConfirm={async () => {
          if (!pendingConfirmation) {
            return;
          }

          await submitConfirmedShift(pendingConfirmation);
          setPendingConfirmation(null);
        }}
      />
    </>
  );
}
