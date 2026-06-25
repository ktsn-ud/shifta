"use client";

import { useCallback, useReducer } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FormErrorMessage } from "@/components/form/form-error-message";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  Form,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { SpinnerPanel } from "@/components/ui/spinner";
import { useResetOnRouteHidden } from "@/hooks/use-reset-on-route-hidden";
import { parseGoogleSyncStateFromPayload } from "@/lib/google-calendar/clientSync";
import { messages, toErrorMessage } from "@/lib/messages";
import { fetchJson } from "@/lib/query/fetch-json";
import { invalidateAfterTimetableMutation } from "@/lib/query/invalidation";
import { buildMutationSuccessDescription } from "@/lib/query/mutation-toast";
import { getBrowserQueryClient } from "@/lib/query/query-client";
import { queryKeys } from "@/lib/query/query-keys";
import {
  resolveUserFacingErrorFromResponse,
  toUserFacingMessage,
} from "@/lib/user-facing-error";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

type TimetableFormMode = "create" | "edit";

type TimetableFormProps = {
  mode: TimetableFormMode;
  workplaceId: string;
  timetableId?: string;
};

type WorkplaceSummary = {
  id: string;
  name: string;
  type: "GENERAL" | "CRAM_SCHOOL";
};

type TimetableItem = {
  id: string;
  timetableSetId: string;
  period: number;
  startTime: string;
  endTime: string;
  startTimeLabel?: string;
  endTimeLabel?: string;
};

type TimetableSet = {
  id: string;
  workplaceId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  items: TimetableItem[];
};

type FormItemValues = {
  id: string;
  period: string;
  startTime: string;
  endTime: string;
};

type FormValues = {
  name: string;
  items: FormItemValues[];
};

type QueuedTimetableSet = {
  id: string;
  values: FormValues;
};

type FormErrors = Partial<Record<"name" | "form", string>>;
type RowErrors = Partial<Record<"period" | "startTime" | "endTime", string>>;
type RowErrorMap = Record<string, RowErrors | undefined>;

type TimetableFormState = {
  values: FormValues;
  queuedSets: QueuedTimetableSet[];
  errors: FormErrors;
  rowErrors: RowErrorMap;
  isSubmitting: boolean;
};

type TimetableFormAction =
  | { type: "reset"; initialValues: FormValues | null }
  | { type: "updateName"; name: string }
  | {
      type: "updateItem";
      itemId: string;
      patch: Partial<Pick<FormItemValues, "period" | "startTime" | "endTime">>;
    }
  | { type: "appendItem" }
  | { type: "removeItem"; itemId: string }
  | { type: "setValidation"; errors: FormErrors; rowErrors: RowErrorMap }
  | { type: "clearValidation" }
  | { type: "queueCurrentSet" }
  | { type: "removeQueuedSet"; queuedSetId: string }
  | { type: "setFormError"; message: string }
  | { type: "setSubmitting"; isSubmitting: boolean };

type TimetableEditorFormProps = {
  mode: TimetableFormMode;
  workplaceId: string;
  timetableId?: string;
  workplaceName?: string;
  initialValues: FormValues | null;
  listHref: string;
  externalFormError?: string | null;
};

type TimetableItemsSectionProps = {
  items: FormItemValues[];
  rowErrors: RowErrorMap;
  isSubmitting: boolean;
  isEdit: boolean;
  onUpdateItem: (
    itemId: string,
    patch: Partial<Pick<FormItemValues, "period" | "startTime" | "endTime">>,
  ) => void;
  onRemoveItem: (itemId: string) => void;
  onAppendItem: () => void;
  onQueueCurrentSet: () => void;
};

type QueuedSetsSectionProps = {
  queuedSets: QueuedTimetableSet[];
  isSubmitting: boolean;
  onRemoveQueuedSet: (queuedSetId: string) => void;
};

type TimetableEditorController = {
  isEdit: boolean;
  pageTitle: string;
  values: FormValues;
  queuedSets: QueuedTimetableSet[];
  errors: FormErrors;
  rowErrors: RowErrorMap;
  isSubmitting: boolean;
  formErrorMessage: string | null;
  updateName: (name: string) => void;
  updateItem: (
    itemId: string,
    patch: Partial<Pick<FormItemValues, "period" | "startTime" | "endTime">>,
  ) => void;
  removeItem: (itemId: string) => void;
  appendItem: () => void;
  queueCurrentSet: () => void;
  removeQueuedSet: (queuedSetId: string) => void;
  submit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  cancel: () => void;
};

let nextDraftEntityId = 0;

function createDraftEntityId(prefix: string): string {
  nextDraftEntityId += 1;
  return `${prefix}-${nextDraftEntityId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseWorkplaceResponse(payload: unknown): WorkplaceSummary | null {
  if (!isRecord(payload) || !isRecord(payload.data)) {
    return null;
  }

  const data = payload.data;
  if (
    typeof data.id !== "string" ||
    typeof data.name !== "string" ||
    (data.type !== "GENERAL" && data.type !== "CRAM_SCHOOL")
  ) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    type: data.type,
  };
}

function isTimetableItem(value: unknown): value is TimetableItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.timetableSetId === "string" &&
    typeof value.period === "number" &&
    Number.isInteger(value.period) &&
    value.period > 0 &&
    typeof value.startTime === "string" &&
    typeof value.endTime === "string" &&
    (value.startTimeLabel === undefined ||
      typeof value.startTimeLabel === "string") &&
    (value.endTimeLabel === undefined || typeof value.endTimeLabel === "string")
  );
}

function isTimetableSet(value: unknown): value is TimetableSet {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.workplaceId === "string" &&
    typeof value.name === "string" &&
    typeof value.sortOrder === "number" &&
    Number.isInteger(value.sortOrder) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    value.items.every(isTimetableItem)
  );
}

function parseTimetableSetListResponse(
  payload: unknown,
): TimetableSet[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return null;
  }

  if (payload.data.every(isTimetableSet) === false) {
    return null;
  }

  return payload.data;
}

async function readApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const resolved = await resolveUserFacingErrorFromResponse(response, fallback);
  return resolved.message;
}

function toTimeOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function toMinutes(value: string): number {
  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function createEmptyItem(): FormItemValues {
  return {
    id: createDraftEntityId("timetable-item"),
    period: "",
    startTime: "",
    endTime: "",
  };
}

function createEmptyFormValues(): FormValues {
  return {
    name: "",
    items: [createEmptyItem()],
  };
}

function cloneFormValues(values: FormValues): FormValues {
  return {
    name: values.name,
    items: values.items.map((item) => ({ ...item })),
  };
}

function createFormValuesFromTimetableSet(
  timetableSet: TimetableSet,
): FormValues {
  const items = timetableSet.items
    .slice()
    .sort((left, right) => left.period - right.period)
    .map((item) => ({
      id: item.id,
      period: String(item.period),
      startTime: item.startTimeLabel ?? toTimeOnly(item.startTime),
      endTime: item.endTimeLabel ?? toTimeOnly(item.endTime),
    }));

  return {
    name: timetableSet.name,
    items: items.length > 0 ? items : [createEmptyItem()],
  };
}

function createTimetableFormState(
  initialValues: FormValues | null,
): TimetableFormState {
  return {
    values: initialValues
      ? cloneFormValues(initialValues)
      : createEmptyFormValues(),
    queuedSets: [],
    errors: {},
    rowErrors: {},
    isSubmitting: false,
  };
}

function clearFieldError(
  currentErrors: FormErrors,
  key: Exclude<keyof FormErrors, "form">,
): FormErrors {
  if (!currentErrors[key]) {
    return currentErrors;
  }

  const nextErrors = { ...currentErrors };
  delete nextErrors[key];
  return nextErrors;
}

function clearRowError(rowErrors: RowErrorMap, itemId: string): RowErrorMap {
  if (!rowErrors[itemId]) {
    return rowErrors;
  }

  const nextRowErrors = { ...rowErrors };
  delete nextRowErrors[itemId];
  return nextRowErrors;
}

function hasAnySetInput(values: FormValues): boolean {
  if (values.name.trim().length > 0) {
    return true;
  }

  return values.items.some(
    (item) => item.period || item.startTime || item.endTime,
  );
}

function validateRows(items: FormItemValues[]): {
  rowErrors: RowErrorMap;
  hasError: boolean;
} {
  const rowErrors: RowErrorMap = {};
  let hasError = false;
  const seenPeriods = new Map<number, string>();

  for (const item of items) {
    const errors: RowErrors = {};
    const period = Number(item.period);

    if (!item.period || Number.isInteger(period) === false || period <= 0) {
      errors.period = "コマ番号は1以上の整数で入力してください。";
    }

    if (!timeRegex.test(item.startTime)) {
      errors.startTime = "開始時刻はHH:MM形式で入力してください。";
    }

    if (!timeRegex.test(item.endTime)) {
      errors.endTime = "終了時刻はHH:MM形式で入力してください。";
    }

    if (
      timeRegex.test(item.startTime) &&
      timeRegex.test(item.endTime) &&
      toMinutes(item.startTime) >= toMinutes(item.endTime)
    ) {
      errors.endTime = "終了時刻は開始時刻より後にしてください。";
    }

    if (Object.keys(errors).length > 0) {
      rowErrors[item.id] = errors;
      hasError = true;
      continue;
    }

    const duplicatedItemId = seenPeriods.get(period);
    if (duplicatedItemId) {
      rowErrors[item.id] = {
        ...rowErrors[item.id],
        period: "同じコマ番号が重複しています。",
      };
      rowErrors[duplicatedItemId] = {
        ...rowErrors[duplicatedItemId],
        period:
          rowErrors[duplicatedItemId]?.period ??
          "同じコマ番号が重複しています。",
      };
      hasError = true;
      continue;
    }

    seenPeriods.set(period, item.id);
  }

  return { rowErrors, hasError };
}

function validateForm(target: FormValues): {
  formErrors: FormErrors;
  rowErrors: RowErrorMap;
} {
  const formErrors: FormErrors = {};

  if (!target.name.trim()) {
    formErrors.name = "時間割セット名は必須です。";
  } else if (target.name.trim().length > 50) {
    formErrors.name = "時間割セット名は50文字以内で入力してください。";
  }

  const rowValidation = validateRows(target.items);

  return {
    formErrors,
    rowErrors: rowValidation.rowErrors,
  };
}

function findFirstValidationMessage(
  formErrors: FormErrors,
  rowErrors: RowErrorMap,
): string | undefined {
  return (
    Object.values(formErrors).find(
      (value): value is string => typeof value === "string" && value.length > 0,
    ) ??
    Object.values(rowErrors)
      .flatMap((error) => Object.values(error ?? {}))
      .find(
        (value): value is string =>
          typeof value === "string" && value.length > 0,
      )
  );
}

function toCreatePayload(set: FormValues) {
  return {
    name: set.name.trim(),
    items: set.items.map((item) => ({
      period: Number(item.period),
      startTime: item.startTime,
      endTime: item.endTime,
    })),
  };
}

function timetableFormReducer(
  state: TimetableFormState,
  action: TimetableFormAction,
): TimetableFormState {
  switch (action.type) {
    case "reset":
      return createTimetableFormState(action.initialValues);
    case "updateName":
      return {
        ...state,
        values: {
          ...state.values,
          name: action.name,
        },
        errors: clearFieldError(state.errors, "name"),
      };
    case "updateItem":
      return {
        ...state,
        values: {
          ...state.values,
          items: state.values.items.map((item) =>
            item.id === action.itemId ? { ...item, ...action.patch } : item,
          ),
        },
        rowErrors: clearRowError(state.rowErrors, action.itemId),
      };
    case "appendItem":
      return {
        ...state,
        values: {
          ...state.values,
          items: [...state.values.items, createEmptyItem()],
        },
      };
    case "removeItem":
      if (state.values.items.length <= 1) {
        return state;
      }

      return {
        ...state,
        values: {
          ...state.values,
          items: state.values.items.filter((item) => item.id !== action.itemId),
        },
        rowErrors: clearRowError(state.rowErrors, action.itemId),
      };
    case "setValidation":
      return {
        ...state,
        errors: action.errors,
        rowErrors: action.rowErrors,
      };
    case "clearValidation":
      return {
        ...state,
        errors: {},
        rowErrors: {},
      };
    case "queueCurrentSet":
      return {
        ...state,
        queuedSets: [
          ...state.queuedSets,
          {
            id: createDraftEntityId("queued-set"),
            values: cloneFormValues(state.values),
          },
        ],
        values: createEmptyFormValues(),
        errors: {},
        rowErrors: {},
      };
    case "removeQueuedSet":
      return {
        ...state,
        queuedSets: state.queuedSets.filter(
          (queuedSet) => queuedSet.id !== action.queuedSetId,
        ),
      };
    case "setFormError":
      return {
        ...state,
        errors: {
          ...state.errors,
          form: action.message,
        },
      };
    case "setSubmitting":
      return {
        ...state,
        isSubmitting: action.isSubmitting,
      };
  }
}

function TimetableItemsSection({
  items,
  rowErrors,
  isSubmitting,
  isEdit,
  onUpdateItem,
  onRemoveItem,
  onAppendItem,
  onQueueCurrentSet,
}: TimetableItemsSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">コマ設定</h3>

      <div className="space-y-3">
        {items.map((item, index) => {
          const error = rowErrors[item.id] ?? {};

          return (
            <Card key={item.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">{index + 1}行目</CardTitle>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveItem(item.id)}
                    disabled={isSubmitting || items.length <= 1}
                    aria-label={`${index + 1}行目を削除`}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </CardHeader>

              <div className="grid gap-3 px-6 pb-6 md:grid-cols-3">
                <Field data-invalid={Boolean(error.period)}>
                  <FieldLabel>コマ番号</FieldLabel>
                  <FieldContent>
                    <Input
                      type="number"
                      min={1}
                      value={item.period}
                      onChange={(event) =>
                        onUpdateItem(item.id, {
                          period: event.currentTarget.value,
                        })
                      }
                      disabled={isSubmitting}
                    />
                    <FormErrorMessage message={error.period} />
                  </FieldContent>
                </Field>

                <Field data-invalid={Boolean(error.startTime)}>
                  <FieldLabel>開始時刻</FieldLabel>
                  <FieldContent>
                    <Input
                      type="time"
                      value={item.startTime}
                      onChange={(event) =>
                        onUpdateItem(item.id, {
                          startTime: event.currentTarget.value,
                        })
                      }
                      disabled={isSubmitting}
                    />
                    <FormErrorMessage message={error.startTime} />
                  </FieldContent>
                </Field>

                <Field data-invalid={Boolean(error.endTime)}>
                  <FieldLabel>終了時刻</FieldLabel>
                  <FieldContent>
                    <Input
                      type="time"
                      value={item.endTime}
                      onChange={(event) =>
                        onUpdateItem(item.id, {
                          endTime: event.currentTarget.value,
                        })
                      }
                      disabled={isSubmitting}
                    />
                    <FormErrorMessage message={error.endTime} />
                  </FieldContent>
                </Field>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-center">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAppendItem}
            disabled={isSubmitting}
          >
            <PlusIcon className="size-4" />
            行を追加
          </Button>
          {!isEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onQueueCurrentSet}
              disabled={isSubmitting}
            >
              時間割セットを確定
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function QueuedSetsSection({
  queuedSets,
  isSubmitting,
  onRemoveQueuedSet,
}: QueuedSetsSectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">
        作成予定セット ({queuedSets.length})
      </h3>

      {queuedSets.length === 0 ? (
        <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          追加済みのセットはありません。入力中のセットを「時間割セットを確定」で作成予定に積めます。
        </p>
      ) : (
        <div className="space-y-2">
          {queuedSets.map((queuedSet, index) => (
            <Card key={queuedSet.id}>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-sm">
                      {index + 1}. {queuedSet.values.name}
                    </CardTitle>
                    <CardDescription>
                      コマ数: {queuedSet.values.items.length}
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemoveQueuedSet(queuedSet.id)}
                    disabled={isSubmitting}
                    aria-label={`作成予定${index + 1}を削除`}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function useTimetableEditorController({
  mode,
  workplaceId,
  timetableId,
  initialValues,
  listHref,
  externalFormError,
}: TimetableEditorFormProps): TimetableEditorController {
  const router = useRouter();
  const queryClient = getBrowserQueryClient();
  const isEdit = mode === "edit";
  const pageTitle = isEdit ? "時間割セット編集" : "時間割セット作成";
  const [state, dispatch] = useReducer(
    timetableFormReducer,
    initialValues,
    createTimetableFormState,
  );
  const resetFormState = useCallback(() => {
    dispatch({
      type: "reset",
      initialValues,
    });
  }, [initialValues]);
  const { markForResetOnRouteHidden } = useResetOnRouteHidden(resetFormState);

  function queueCurrentSet() {
    const validation = validateForm(state.values);
    const hasFormError = Object.keys(validation.formErrors).length > 0;
    const hasRowError = Object.keys(validation.rowErrors).length > 0;

    if (hasFormError || hasRowError) {
      dispatch({
        type: "setValidation",
        errors: validation.formErrors,
        rowErrors: validation.rowErrors,
      });
      const firstError = findFirstValidationMessage(
        validation.formErrors,
        validation.rowErrors,
      );

      toast.error(messages.error.validation, {
        description: firstError,
        duration: 6000,
      });
      return;
    }

    dispatch({ type: "queueCurrentSet" });
    toast.success("作成予定セットに追加しました。");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isEdit && !timetableId) {
      dispatch({
        type: "setFormError",
        message: "編集対象の時間割セットIDが指定されていません。",
      });
      return;
    }

    const validation = validateForm(state.values);
    const hasFormError = Object.keys(validation.formErrors).length > 0;
    const hasRowError = Object.keys(validation.rowErrors).length > 0;

    if (isEdit && (hasFormError || hasRowError)) {
      dispatch({
        type: "setValidation",
        errors: validation.formErrors,
        rowErrors: validation.rowErrors,
      });
      const firstError = findFirstValidationMessage(
        validation.formErrors,
        validation.rowErrors,
      );

      toast.error(messages.error.validation, {
        description: firstError,
        duration: 6000,
      });
      return;
    }

    const createTargets = state.queuedSets.map((queuedSet) => queuedSet.values);
    if (!isEdit) {
      const shouldIncludeCurrent = hasAnySetInput(state.values);

      if (shouldIncludeCurrent) {
        if (hasFormError || hasRowError) {
          dispatch({
            type: "setValidation",
            errors: validation.formErrors,
            rowErrors: validation.rowErrors,
          });
          const firstError = findFirstValidationMessage(
            validation.formErrors,
            validation.rowErrors,
          );

          toast.error(messages.error.validation, {
            description: firstError,
            duration: 6000,
          });
          return;
        }

        createTargets.push(state.values);
      } else if (createTargets.length === 0) {
        const formErrors = {
          name: "少なくとも1つの時間割セットを入力してください。",
        } satisfies FormErrors;

        dispatch({
          type: "setValidation",
          errors: formErrors,
          rowErrors: {},
        });
        toast.error(messages.error.validation, {
          description: formErrors.name,
          duration: 6000,
        });
        return;
      }
    }

    const payload =
      isEdit || createTargets.length <= 1
        ? toCreatePayload(isEdit ? state.values : createTargets[0]!)
        : {
            sets: createTargets.map((set) => toCreatePayload(set)),
          };

    dispatch({ type: "clearValidation" });
    dispatch({ type: "setSubmitting", isSubmitting: true });
    const loadingToastId = toast.loading(
      isEdit
        ? "時間割セットを更新中です..."
        : "時間割セットを一括作成中です...",
    );

    try {
      const endpoint = isEdit
        ? `/api/workplaces/${workplaceId}/timetables/${timetableId}`
        : `/api/workplaces/${workplaceId}/timetables`;
      const method = isEdit ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok === false) {
        throw new Error(
          await readApiErrorMessage(
            response,
            messages.error.timetableSaveFailed,
          ),
        );
      }

      const responsePayload = (await response.json()) as unknown;
      const syncState = parseGoogleSyncStateFromPayload(
        responsePayload,
        messages.error.calendarSyncFailed,
      );
      const createdCount = isEdit ? 1 : createTargets.length;
      await invalidateAfterTimetableMutation(queryClient, workplaceId);
      toast.success(
        isEdit
          ? messages.success.timetableUpdated
          : messages.success.timetableCreated(createdCount),
        {
          id: loadingToastId,
          description: buildMutationSuccessDescription({
            syncPending: syncState.pending,
          }),
        },
      );
      markForResetOnRouteHidden();
      router.push(listHref);
    } catch (error) {
      console.error("failed to save timetable set", error);
      const message = toErrorMessage(error, messages.error.timetableSaveFailed);
      dispatch({
        type: "setFormError",
        message,
      });
      toast.error(messages.error.timetableSaveFailed, {
        id: loadingToastId,
        description: message,
        duration: 6000,
      });
    } finally {
      dispatch({ type: "setSubmitting", isSubmitting: false });
    }
  }

  return {
    isEdit,
    pageTitle,
    values: state.values,
    queuedSets: state.queuedSets,
    errors: state.errors,
    rowErrors: state.rowErrors,
    isSubmitting: state.isSubmitting,
    formErrorMessage: state.errors.form ?? externalFormError ?? null,
    updateName: (name) => {
      dispatch({
        type: "updateName",
        name,
      });
    },
    updateItem: (itemId, patch) => {
      dispatch({
        type: "updateItem",
        itemId,
        patch,
      });
    },
    removeItem: (itemId) => {
      dispatch({
        type: "removeItem",
        itemId,
      });
    },
    appendItem: () => {
      dispatch({ type: "appendItem" });
    },
    queueCurrentSet,
    removeQueuedSet: (queuedSetId) => {
      dispatch({
        type: "removeQueuedSet",
        queuedSetId,
      });
    },
    submit,
    cancel: () => {
      markForResetOnRouteHidden();
      router.push(listHref);
    },
  };
}

function TimetableEditorForm({
  mode,
  workplaceId,
  timetableId,
  workplaceName,
  initialValues,
  listHref,
  externalFormError,
}: TimetableEditorFormProps) {
  const controller = useTimetableEditorController({
    mode,
    workplaceId,
    timetableId,
    workplaceName,
    initialValues,
    listHref,
    externalFormError,
  });

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{controller.pageTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {workplaceName
            ? controller.isEdit
              ? `${workplaceName} の時間割セットを編集します。`
              : `${workplaceName} の時間割セットを作成します。`
            : controller.isEdit
              ? "時間割セットを編集します。"
              : "時間割セットを作成します。"}
        </p>
      </header>

      {controller.formErrorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {controller.formErrorMessage}
        </p>
      ) : null}

      <Form className="space-y-6" onSubmit={controller.submit}>
        <FieldGroup className="grid gap-4">
          <Field data-invalid={Boolean(controller.errors.name)}>
            <FieldLabel htmlFor="timetable-set-name">時間割セット名</FieldLabel>
            <FieldContent>
              <Input
                id="timetable-set-name"
                value={controller.values.name}
                onChange={(event) =>
                  controller.updateName(event.currentTarget.value)
                }
                disabled={controller.isSubmitting}
                maxLength={50}
              />
              <FormErrorMessage message={controller.errors.name} />
            </FieldContent>
          </Field>
        </FieldGroup>

        <TimetableItemsSection
          items={controller.values.items}
          rowErrors={controller.rowErrors}
          isSubmitting={controller.isSubmitting}
          isEdit={controller.isEdit}
          onUpdateItem={controller.updateItem}
          onRemoveItem={controller.removeItem}
          onAppendItem={controller.appendItem}
          onQueueCurrentSet={controller.queueCurrentSet}
        />

        {!controller.isEdit ? (
          <QueuedSetsSection
            queuedSets={controller.queuedSets}
            isSubmitting={controller.isSubmitting}
            onRemoveQueuedSet={controller.removeQueuedSet}
          />
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={controller.isSubmitting}>
            {controller.isSubmitting
              ? controller.isEdit
                ? "更新中..."
                : "作成中..."
              : controller.isEdit
                ? "更新"
                : "まとめて作成"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={controller.cancel}
            disabled={controller.isSubmitting}
          >
            キャンセル
          </Button>
        </div>
      </Form>
    </section>
  );
}

export function TimetableForm({
  mode,
  workplaceId,
  timetableId,
}: TimetableFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const pageTitle = isEdit ? "時間割セット編集" : "時間割セット作成";
  const listHref = `/my/workplaces/${workplaceId}/timetables`;
  const {
    data: workplaceData,
    error: workplaceError,
    isPending: isWorkplacePending,
  } = useQuery({
    queryKey: queryKeys.workplaces.detailSummary({
      workplaceId,
    }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/workplaces/${workplaceId}`, {
        init: { signal },
        fallbackMessage: "勤務先情報の取得に失敗しました。",
        parse: (payload) => {
          const parsed = parseWorkplaceResponse(payload);
          if (!parsed) {
            throw new Error("WORKPLACE_RESPONSE_INVALID");
          }
          return parsed;
        },
      }),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const workplace = workplaceData ?? null;
  const {
    data: timetableData,
    error: timetableError,
    isPending: isTimetablePending,
  } = useQuery({
    queryKey: queryKeys.workplaces.timetables({
      workplaceId,
    }),
    queryFn: ({ signal }) =>
      fetchJson(`/api/workplaces/${workplaceId}/timetables`, {
        init: { signal },
        fallbackMessage: "時間割一覧の取得に失敗しました。",
        parse: (payload) => {
          const parsed = parseTimetableSetListResponse(payload);
          if (!parsed) {
            throw new Error("TIMETABLE_LIST_RESPONSE_INVALID");
          }
          return parsed;
        },
      }),
    enabled:
      isEdit && Boolean(timetableId) && workplace?.type === "CRAM_SCHOOL",
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const editingTarget =
    isEdit && timetableId && timetableData
      ? (timetableData.find((set) => set.id === timetableId) ?? null)
      : null;
  const isLoading =
    isWorkplacePending ||
    (isEdit &&
      Boolean(timetableId) &&
      workplace?.type === "CRAM_SCHOOL" &&
      isTimetablePending);
  const externalFormError =
    isEdit && !timetableId
      ? "編集対象の時間割セットIDが指定されていません。"
      : workplaceError
        ? toUserFacingMessage(
            workplaceError,
            "勤務先情報の取得に失敗しました。",
          )
        : timetableError
          ? toUserFacingMessage(
              timetableError,
              "時間割データの読み込みに失敗しました。",
            )
          : isEdit &&
              timetableId &&
              workplace?.type === "CRAM_SCHOOL" &&
              timetableData &&
              !editingTarget
            ? "編集対象の時間割セットが見つかりません。"
            : null;

  if (isLoading) {
    return (
      <section className="space-y-4 p-4 md:p-6">
        <header>
          <h2 className="text-xl font-semibold">{pageTitle}</h2>
        </header>
        <SpinnerPanel
          className="min-h-[180px]"
          label="時間割データを読み込み中..."
        />
      </section>
    );
  }

  if (workplace && workplace.type !== "CRAM_SCHOOL") {
    return (
      <section className="space-y-4 p-4 md:p-6">
        <header>
          <h2 className="text-xl font-semibold">{pageTitle}</h2>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>操作対象外の勤務先です</CardTitle>
            <CardDescription>
              時間割は塾タイプの勤務先でのみ操作できます。
            </CardDescription>
          </CardHeader>
        </Card>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.push(listHref);
          }}
        >
          時間割一覧へ戻る
        </Button>
      </section>
    );
  }

  return (
    <TimetableEditorForm
      key={editingTarget?.id ?? `create-${workplaceId}`}
      mode={mode}
      workplaceId={workplaceId}
      timetableId={timetableId}
      workplaceName={workplace?.name}
      initialValues={
        editingTarget ? createFormValuesFromTimetableSet(editingTarget) : null
      }
      listHref={listHref}
      externalFormError={externalFormError}
    />
  );
}
