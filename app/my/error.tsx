"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type MySectionErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function MySectionError({ error, reset }: MySectionErrorProps) {
  const router = useRouter();

  useEffect(() => {
    console.error("/my route error", error);
  }, [error]);

  return (
    <section className="space-y-4 p-4 md:p-6">
      <h2 className="text-xl font-semibold">処理に失敗しました</h2>
      <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        画面の処理中にエラーが発生しました。再実行し、解決しない場合はダッシュボードに戻って操作をやり直してください。
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={reset}>
          再試行
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.push("/my");
          }}
        >
          ダッシュボードへ戻る
        </Button>
      </div>
    </section>
  );
}
