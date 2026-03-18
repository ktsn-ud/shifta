"use client";

import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function NewShiftPage() {
  const searchParams = useSearchParams();
  const date = searchParams.get("date");

  return (
    <section className="space-y-4 p-4 md:p-6">
      <h2 className="text-xl font-semibold">新規シフト登録</h2>
      <p className="text-sm text-muted-foreground">
        実フォームは Phase 6 (SCR_004) で実装します。
      </p>
      <p className="text-sm">選択日: {date ?? "未指定"}</p>
      <Button type="button" variant="outline" onClick={() => history.back()}>
        戻る
      </Button>
    </section>
  );
}
