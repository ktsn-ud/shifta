import {
  UserFacingError,
  buildActionableErrorMessage,
  resolveUserFacingErrorFromResponse,
} from "@/lib/user-facing-error";

type FetchJsonOptions<TData> = {
  fallbackMessage: string;
  parse: (payload: unknown) => TData;
  init?: RequestInit;
};

export function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return "name" in error && (error as { name?: unknown }).name === "AbortError";
}

function toInvalidResponseError(fallbackMessage: string): UserFacingError {
  const kind = "server";
  return new UserFacingError(
    buildActionableErrorMessage(fallbackMessage, kind),
    kind,
    { status: 500 },
  );
}

export async function fetchJson<TData>(
  input: RequestInfo | URL,
  options: FetchJsonOptions<TData>,
): Promise<TData> {
  const { fallbackMessage, init, parse } = options;

  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw error;
  }

  if (response.ok === false) {
    const resolved = await resolveUserFacingErrorFromResponse(
      response,
      fallbackMessage,
    );

    throw new UserFacingError(resolved.message, resolved.kind, {
      status: resolved.status,
      code: resolved.code,
      requiresCalendarSetup: resolved.requiresCalendarSetup,
      requiresSignOut: resolved.requiresSignOut,
    });
  }

  let payload: unknown;
  try {
    payload = (await response.json()) as unknown;
  } catch {
    throw toInvalidResponseError(fallbackMessage);
  }

  try {
    return parse(payload);
  } catch (error) {
    if (error instanceof UserFacingError) {
      throw error;
    }

    throw toInvalidResponseError(fallbackMessage);
  }
}
