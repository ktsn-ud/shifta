"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

type GlobalAppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function GlobalAppError({ error, reset }: GlobalAppErrorProps) {
  useEffect(() => {
    console.error("Unhandled route error", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70svh] w-full max-w-2xl flex-col justify-center gap-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold">エラーが発生しました</h1>
      <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        画面の表示に失敗しました。ページを再読み込みして再実行してください。改善しない場合は再ログインしてください。
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={reset}>
          再読み込みする
        </Button>
      </div>
    </main>
  );
}
