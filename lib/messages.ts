export const messages = {
  success: {
    shiftCreated: "シフトを登録しました。",
    shiftUpdated: "シフトを更新しました。",
    shiftDeleted: "シフトを削除しました。",
    shiftsBulkCreated: (count: number) => `${count}件のシフトを登録しました。`,
    workplaceCreated: "勤務先を追加しました。",
    workplaceUpdated: "勤務先を更新しました。",
    workplaceDeleted: "勤務先を削除しました。",
    payrollRuleCreated: "給与ルールを作成しました。",
    payrollRuleUpdated: "給与ルールを更新しました。",
    payrollRuleDeleted: "給与ルールを削除しました。",
    timetableCreated: (count: number) => `${count}件の時間割を作成しました。`,
    timetableUpdated: "時間割を更新しました。",
    timetableDeleted: "時間割を削除しました。",
    calendarInitialized: "Google Calendar を設定しました。",
    calendarSyncRetried: "Google Calendar へ再同期しました。",
  },
  error: {
    validation: "入力エラーがあります。",
    network: "通信エラーが発生しました。",
    timeout: "リクエストがタイムアウトしました。",
    shiftSaveFailed: "シフトの保存に失敗しました。",
    bulkShiftSaveFailed: "シフト一括登録に失敗しました。",
    workplaceSaveFailed: "勤務先の保存に失敗しました。",
    workplaceDeleteFailed: "勤務先の削除に失敗しました。",
    payrollRuleSaveFailed: "給与ルールの保存に失敗しました。",
    payrollRuleDeleteFailed: "給与ルールの削除に失敗しました。",
    timetableSaveFailed: "時間割の保存に失敗しました。",
    timetableDeleteFailed: "時間割の削除に失敗しました。",
    calendarInitializeFailed: "Google Calendar の初期設定に失敗しました。",
    calendarSyncFailed: "Google Calendar への同期に失敗しました。",
  },
  warning: {
    shiftOverlap: "同じ日に複数のシフトがあります。",
    payrollRuleOverlap: "同一勤務先内で適用期間が重複しています。",
    calendarAlreadyInitialized: "Google Calendar の初期設定は完了しています。",
  },
} as const;

export function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}
