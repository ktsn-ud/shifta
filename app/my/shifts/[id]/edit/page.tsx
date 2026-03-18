"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function EditShiftPage() {
  const params = useParams<{ id: string }>();

  return (
    <section className="space-y-4 p-4 md:p-6">
      <h2 className="text-xl font-semibold">シフト編集</h2>
      <p className="text-sm text-muted-foreground">
        実フォームは Phase 6 (SCR_005) で実装します。
      </p>
      <p className="text-sm">対象シフトID: {params.id}</p>
      <Button type="button" variant="outline" onClick={() => history.back()}>
        戻る
      </Button>
    </section>
  );
}
