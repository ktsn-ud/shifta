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

function allowlistedShiftFormReturnTo(
  searchParams: ShiftPageSearchParams,
): ShiftFormReturnTo {
  // react-doctor-disable-next-line react-doctor/url-prefilled-privileged-action -- Return target is restricted to an internal allowlist.
  const returnTo = readSingleParam(searchParams.returnTo);

  return returnTo === "list" ? "list" : "dashboard";
}

export function normalizeShiftPageSearchParams(
  searchParams: ShiftPageSearchParams,
): NormalizedShiftPageSearchParams {
  return {
    returnTo: allowlistedShiftFormReturnTo(searchParams),
    initialDate: readSingleParam(searchParams.date),
    returnMonth: readSingleParam(searchParams.month),
  };
}
