"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TIME_ONLY_REGEX, toMinutes } from "@/lib/api/date-time";
import {
  parseGoogleSyncFailureFromPayload,
  readGoogleSyncFailureFromErrorResponse,
} from "@/lib/google-calendar/clientSync";
import { CALENDAR_SETUP_PATH } from "@/lib/google-calendar/constants";
import { messages, toErrorMessage } from "@/lib/messages";
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

  if (toMinutes(startTime) >= toMinutes(endTime)) {
    return {
      success: false,
      message: "開始時刻は終了時刻より前にしてください。",
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setStartTime(shift.startTime);
    setEndTime(shift.endTime);
    setBreakMinutes(String(shift.breakMinutes));
    setErrorMessage(null);
  }, [shift.breakMinutes, shift.endTime, shift.id, shift.startTime]);

  const isMutating = isConfirming;

  const handleConfirm = async () => {
    setErrorMessage(null);
    const validation = validateShiftInput(startTime, endTime, breakMinutes);
    if (!validation.success) {
      setErrorMessage(validation.message);
      return;
    }

    setIsConfirming(true);
    try {
      const response = await fetch(`/api/shifts/${shift.id}/confirm`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(validation.data),
      });

      if (response.ok === false) {
        const apiError = await readGoogleSyncFailureFromErrorResponse(
          response,
          messages.error.shiftConfirmFailed,
        );
        throw new Error(apiError.message);
      }

      const payload = (await response.json()) as unknown;
      const syncFailure = parseGoogleSyncFailureFromPayload(
        payload,
        messages.error.calendarSyncFailed,
      );

      await onActionCompleted?.();

      if (syncFailure) {
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

  return (
    <Card size="sm" className="w-full shadow-none md:max-w-4xl">
      <CardHeader>
        <CardTitle>{shift.date}</CardTitle>
        <p className="text-sm text-muted-foreground">{shift.workplaceName}</p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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

          <div className="flex items-end">
            <Button
              type="button"
              className="w-full lg:w-auto"
              disabled={isMutating}
              onClick={handleConfirm}
            >
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
  );
}
