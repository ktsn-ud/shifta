-- Add payroll cycle constraints to keep workplace settings consistent
ALTER TABLE "Workplace"
ADD CONSTRAINT "Workplace_payday_range_check"
CHECK ("payday" BETWEEN 1 AND 31) NOT VALID;

ALTER TABLE "Workplace"
ADD CONSTRAINT "Workplace_closing_day_consistency_check"
CHECK (
  ("closingDayType" = 'END_OF_MONTH' AND "closingDay" IS NULL)
  OR (
    "closingDayType" = 'DAY_OF_MONTH'
    AND "closingDay" BETWEEN 1 AND 31
    AND "closingDay" <> "payday"
  )
) NOT VALID;

ALTER TABLE "Workplace"
VALIDATE CONSTRAINT "Workplace_payday_range_check";

ALTER TABLE "Workplace"
VALIDATE CONSTRAINT "Workplace_closing_day_consistency_check";
