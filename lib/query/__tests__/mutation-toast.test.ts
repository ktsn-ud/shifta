import { buildMutationSuccessDescription } from "@/lib/query/mutation-toast";

describe("buildMutationSuccessDescription", () => {
  it("syncPending=false なら baseDescription をそのまま返す", () => {
    expect(
      buildMutationSuccessDescription({
        baseDescription: "シフトを更新しました。",
        syncPending: false,
      }),
    ).toBe("シフトを更新しました。");
  });

  it("syncPending=true なら pending文言を付与する", () => {
    expect(
      buildMutationSuccessDescription({
        baseDescription: "シフトを更新しました。",
        syncPending: true,
      }),
    ).toBe(
      "シフトを更新しました。 Google Calendar 同期はバックグラウンドで実行中です。",
    );
  });

  it("baseDescription が空で syncPending=true なら pending文言のみ返す", () => {
    expect(
      buildMutationSuccessDescription({
        syncPending: true,
      }),
    ).toBe("Google Calendar 同期はバックグラウンドで実行中です。");
  });
});
