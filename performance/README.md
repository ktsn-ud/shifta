# Performance Measurement

関連ドキュメント:

- 現行の実装まとめ: `docs/performance/2026-07-04_initial-display-and-auth-optimizations.md`
- 旧方針メモ: `docs/archive/performance/2026-07-03_perf-improvement-next-steps.md`

ローカルでサーバー計測を有効化する:

```bash
SHIFTA_PERF=1 pnpm dev
```

`Server-Timing` を収集する:

```bash
pnpm perf:collect -- --base-url http://localhost:3000 --path /api/workplaces --repeat 5
```

必要なら `--cookie "name=value; ..."` と `--output performance/20260702/workplaces.json` を付ける。JSON を保存しつつ、標準出力には path ごとの平均応答時間と `Server-Timing` 平均を表示する。

ブラウザで確認する:

1. DevTools を開く
2. Network で対象リクエストを選ぶ
3. `Timing` または Header の `Server-Timing` を確認する

`Server-Timing` は `auth;dur=4.1, workplaces;dur=18.7, total;dur=24.0` のように見える。`dur` はミリ秒で、各 named step と合計時間を表す。

実装時の注意:

- `connection()` のような request lifecycle primitive は `measure(() => ...)` に包まず、直接 `await` した前後を `startStep` / `endStep` で計測する。
- 退行比較しやすさを優先し、既存ラベル名は不用意に変更しない。
