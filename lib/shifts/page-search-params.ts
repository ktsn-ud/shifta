export type ShiftFormReturnTo = "dashboard" | "list";

export type ShiftPageSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type NormalizedShiftPageSearchParams = {
  returnTo: ShiftFormReturnTo;
  initialDate?: string;
  returnMonth?: string;
};

function readSingleParam(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function normalizeShiftPageSearchParams(
  searchParams: ShiftPageSearchParams,
): NormalizedShiftPageSearchParams {
  const returnTo = readSingleParam(searchParams.returnTo);

  return {
    returnTo: returnTo === "list" ? "list" : "dashboard",
    initialDate: readSingleParam(searchParams.date),
    returnMonth: readSingleParam(searchParams.month),
  };
}
