import { z } from "zod";
import { isValidDateOnly } from "@/lib/api/date-time";

export const finiteNumberSchema = z.number().finite();

export const nonNegativeIntegerSchema = finiteNumberSchema.int().nonnegative();

export const monthIndexSchema = finiteNumberSchema.int().min(1).max(12);

export const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const dateOnlySchema = z.string().refine(isValidDateOnly);

export const timeOnlySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
