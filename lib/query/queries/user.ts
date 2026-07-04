import { useQuery } from "@tanstack/react-query";
import { fetchJson } from "@/lib/query/fetch-json";
import { queryKeys } from "@/lib/query/query-keys";

const USER_STALE_TIME_MS = 2 * 60 * 1000;
const USER_GC_TIME_MS = 10 * 60 * 1000;

export type CurrentUserSidebarData = {
  name: string | null;
  email: string;
  image: string | null;
};

function parseCurrentUserPayload(payload: unknown): CurrentUserSidebarData {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { data?: unknown }).data !== "object" ||
    (payload as { data?: unknown }).data === null
  ) {
    throw new Error("CURRENT_USER_RESPONSE_INVALID");
  }

  const data = (payload as { data: Record<string, unknown> }).data;

  if (typeof data.email !== "string") {
    throw new Error("CURRENT_USER_RESPONSE_INVALID");
  }

  return {
    name: typeof data.name === "string" ? data.name : null,
    email: data.email,
    image: typeof data.image === "string" ? data.image : null,
  };
}

export function useCurrentUserQuery(input?: { enabled?: boolean }) {
  const { enabled = true } = input ?? {};

  return useQuery({
    queryKey: queryKeys.users.me(),
    queryFn: ({ signal }) =>
      fetchJson("/api/users/me", {
        init: {
          signal,
          cache: "no-store",
        },
        fallbackMessage: "ユーザー情報の取得に失敗しました。",
        parse: parseCurrentUserPayload,
      }),
    enabled,
    staleTime: USER_STALE_TIME_MS,
    gcTime: USER_GC_TIME_MS,
  });
}
