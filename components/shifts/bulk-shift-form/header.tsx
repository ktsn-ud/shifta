"use client";

export function BulkShiftHeader() {
  return (
    <header className="space-y-2">
      <h2 className="text-xl font-semibold">シフト一括登録</h2>
      <p className="text-sm text-muted-foreground">
        勤務先と日付を選び、複数日のシフトをまとめて登録します。
      </p>
    </header>
  );
}
