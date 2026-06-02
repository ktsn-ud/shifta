const DEFAULT_SYNC_PENDING_DESCRIPTION =
  "Google Calendar 同期はバックグラウンドで実行中です。";

type BuildMutationSuccessDescriptionInput = {
  baseDescription?: string;
  pendingDescription?: string;
  syncPending?: boolean;
};

export function buildMutationSuccessDescription(
  input: BuildMutationSuccessDescriptionInput,
): string | undefined {
  const baseDescription = input.baseDescription?.trim() || "";
  const pendingDescription =
    input.pendingDescription?.trim() || DEFAULT_SYNC_PENDING_DESCRIPTION;

  if (input.syncPending) {
    if (baseDescription.length === 0) {
      return pendingDescription;
    }

    return `${baseDescription} ${pendingDescription}`;
  }

  return baseDescription.length > 0 ? baseDescription : undefined;
}
