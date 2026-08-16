import { z } from "zod";
import {
  dateOnlySchema,
  nonNegativeIntegerSchema,
  timeOnlySchema,
} from "@/lib/query/dto-schemas/common";

const unconfirmedShiftSchema = z.strictObject({
  id: z.string(),
  workplaceId: z.string(),
  comment: z.string().nullable(),
  date: dateOnlySchema,
  startTime: timeOnlySchema,
  endTime: timeOnlySchema,
  breakMinutes: nonNegativeIntegerSchema,
  transportationAllowance: nonNegativeIntegerSchema,
  isConfirmed: z.literal(false),
  workplace: z.strictObject({
    id: z.string(),
    name: z.string(),
    color: z.string(),
  }),
});

export const unconfirmedShiftsResponseSchema = z.strictObject({
  shifts: z.array(unconfirmedShiftSchema),
});

export const unconfirmedShiftCountResponseSchema = z.strictObject({
  count: nonNegativeIntegerSchema,
});
