-- 1) OTHER 廃止前に既存値を NORMAL へ寄せる
UPDATE "Shift"
SET "shiftType" = 'NORMAL'
WHERE "shiftType" = 'OTHER';

-- 2) ShiftType enum から OTHER を除去
BEGIN;
CREATE TYPE "ShiftType_new" AS ENUM ('NORMAL', 'LESSON');
ALTER TABLE "Shift"
ALTER COLUMN "shiftType" TYPE "ShiftType_new"
USING ("shiftType"::text::"ShiftType_new");
ALTER TYPE "ShiftType" RENAME TO "ShiftType_old";
ALTER TYPE "ShiftType_new" RENAME TO "ShiftType";
DROP TYPE "public"."ShiftType_old";
COMMIT;

-- 3) 新テーブル作成（先に作ってバックフィルに使う）
CREATE TABLE "TimetableSet" (
    "id" TEXT NOT NULL,
    "workplaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimetableSet_pkey" PRIMARY KEY ("id")
);

-- 4) 既存テーブルへ列追加（まず NULL 許容で追加してから埋める）
ALTER TABLE "ShiftLessonRange" ADD COLUMN "timetableSetId" TEXT;
ALTER TABLE "Timetable" ADD COLUMN "timetableSetId" TEXT;

-- 5) 旧 Timetable(type) からセットを自動生成
INSERT INTO "TimetableSet" (
    "id",
    "workplaceId",
    "name",
    "sortOrder",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT
    'legacy-' || "workplaceId" || '-' || lower("type"::text) AS "id",
    "workplaceId",
    CASE
      WHEN "type" = 'INTENSIVE'::"TimetableType" THEN '講習'
      ELSE '通常'
    END AS "name",
    CASE
      WHEN "type" = 'INTENSIVE'::"TimetableType" THEN 1
      ELSE 0
    END AS "sortOrder",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Timetable";

-- 6) Timetable.timetableSetId を旧 (workplaceId, type) から埋める
UPDATE "Timetable"
SET "timetableSetId" = 'legacy-' || "workplaceId" || '-' || lower("type"::text)
WHERE "timetableSetId" IS NULL;

-- 7) ShiftLessonRange.timetableSetId を時刻一致で推定
UPDATE "ShiftLessonRange" AS slr
SET "timetableSetId" = matched."timetableSetId"
FROM (
  SELECT
    slr_inner."id" AS "shiftLessonRangeId",
    'legacy-' || s."workplaceId" || '-' || lower(t_start."type"::text) AS "timetableSetId"
  FROM "ShiftLessonRange" slr_inner
  INNER JOIN "Shift" s
    ON s."id" = slr_inner."shiftId"
  INNER JOIN "Timetable" t_start
    ON t_start."workplaceId" = s."workplaceId"
    AND t_start."period" = slr_inner."startPeriod"
    AND t_start."startTime" = s."startTime"
  INNER JOIN "Timetable" t_end
    ON t_end."workplaceId" = s."workplaceId"
    AND t_end."period" = slr_inner."endPeriod"
    AND t_end."endTime" = s."endTime"
    AND t_end."type" = t_start."type"
) AS matched
WHERE slr."id" = matched."shiftLessonRangeId"
  AND slr."timetableSetId" IS NULL;

-- 8) 推定不能データは勤務先内の「通常」セットへフォールバック
UPDATE "ShiftLessonRange" AS slr
SET "timetableSetId" = fallback."timetableSetId"
FROM (
  SELECT
    slr_inner."id" AS "shiftLessonRangeId",
    COALESCE(
      MAX(CASE WHEN ts."name" = '通常' THEN ts."id" END),
      MIN(ts."id")
    ) AS "timetableSetId"
  FROM "ShiftLessonRange" slr_inner
  INNER JOIN "Shift" s
    ON s."id" = slr_inner."shiftId"
  INNER JOIN "TimetableSet" ts
    ON ts."workplaceId" = s."workplaceId"
  GROUP BY slr_inner."id"
) AS fallback
WHERE slr."id" = fallback."shiftLessonRangeId"
  AND slr."timetableSetId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Timetable"
    WHERE "timetableSetId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Timetable.timetableSetId のバックフィルに失敗しました';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ShiftLessonRange"
    WHERE "timetableSetId" IS NULL
  ) THEN
    RAISE EXCEPTION 'ShiftLessonRange.timetableSetId のバックフィルに失敗しました';
  END IF;
END
$$;

-- 9) NOT NULL 制約付与
ALTER TABLE "Timetable"
ALTER COLUMN "timetableSetId" SET NOT NULL;

ALTER TABLE "ShiftLessonRange"
ALTER COLUMN "timetableSetId" SET NOT NULL;

-- 10) 旧構造の削除
ALTER TABLE "PayrollRule" DROP COLUMN "perLessonWage";

ALTER TABLE "Timetable" DROP CONSTRAINT "Timetable_workplaceId_fkey";
DROP INDEX "Timetable_workplaceId_idx";
DROP INDEX "Timetable_workplaceId_type_period_key";

ALTER TABLE "Timetable"
DROP COLUMN "type",
DROP COLUMN "workplaceId";

DROP TYPE "TimetableType";

-- 11) 新インデックス / 制約 / FK
CREATE INDEX "TimetableSet_workplaceId_idx" ON "TimetableSet"("workplaceId");
CREATE UNIQUE INDEX "TimetableSet_workplaceId_name_key" ON "TimetableSet"("workplaceId", "name");
CREATE INDEX "ShiftLessonRange_timetableSetId_idx" ON "ShiftLessonRange"("timetableSetId");
CREATE INDEX "Timetable_timetableSetId_idx" ON "Timetable"("timetableSetId");
CREATE UNIQUE INDEX "Timetable_timetableSetId_period_key" ON "Timetable"("timetableSetId", "period");

ALTER TABLE "TimetableSet"
ADD CONSTRAINT "TimetableSet_workplaceId_fkey"
FOREIGN KEY ("workplaceId") REFERENCES "Workplace"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Timetable"
ADD CONSTRAINT "Timetable_timetableSetId_fkey"
FOREIGN KEY ("timetableSetId") REFERENCES "TimetableSet"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "ShiftLessonRange"
ADD CONSTRAINT "ShiftLessonRange_timetableSetId_fkey"
FOREIGN KEY ("timetableSetId") REFERENCES "TimetableSet"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
