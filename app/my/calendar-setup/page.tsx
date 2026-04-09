"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CALENDAR_SETUP_SKIP_COOKIE } from "@/lib/google-calendar/constants";
import { messages } from "@/lib/messages";
import { resolveUserFacingErrorFromResponse } from "@/lib/user-facing-error";

export default function CalendarSetupPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleInitialize() {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/calendar/initialize", {
        method: "POST",
      });

      if (response.ok) {
        toast.success(messages.success.calendarInitialized, {
          description: "これからシフト情報が同期されます。",
        });
        router.replace("/my");
        return;
      }

      if (response.status === 409) {
        toast.warning(messages.warning.calendarAlreadyInitialized);
        router.replace("/my");
        return;
      }

      const resolved = await resolveUserFacingErrorFromResponse(
        response,
        messages.error.calendarInitializeFailed,
      );

      setErrorMessage(resolved.message);
      toast.error(messages.error.calendarInitializeFailed, {
        description: resolved.message,
        duration: 6000,
      });
    } catch (error) {
      console.error("calendar initialization failed", error);
      const message =
        "Googleカレンダーの初期設定に失敗しました。通信環境を確認し、時間をおいてから再実行してください。";
      setErrorMessage(message);
      toast.error(messages.error.calendarInitializeFailed, {
        description: message,
        duration: 6000,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSkip() {
    document.cookie = `${CALENDAR_SETUP_SKIP_COOKIE}=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    router.replace("/my");
  }

  return (
    <section className="p-4 md:p-6">
      <Card className="mx-auto w-full max-w-xl">
        <CardHeader>
          <CardTitle>Shifta カレンダーを設定しましょう</CardTitle>
          <CardDescription>
            シフト情報を Google Calendar
            と同期するための専用カレンダーを作成します。ログイン中の Google
            アカウントに連携されます。
          </CardDescription>
        </CardHeader>

        <CardContent>
          {errorMessage ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              設定後は、シフト登録時に Google Calendar へ自動同期されます。
            </p>
          )}
        </CardContent>

        <CardFooter className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={handleInitialize}
            disabled={isSubmitting}
          >
            {isSubmitting ? "設定中..." : "Google Calendar で設定する"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSkip}
            disabled={isSubmitting}
          >
            スキップ
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
