"use server";

import { updateTag } from "next/cache";
import { requireSessionAndCurrentUser } from "@/lib/api/current-user";
import type {
  ActionResult,
  ActionSuccess,
  CreatePayrollRuleActionResult,
  CreateTimetableActionResult,
  CreateWorkplaceActionResult,
  DeletePayrollRuleActionResult,
  DeleteTimetableActionResult,
  DeleteWorkplaceActionResult,
  DeletedActionData,
  PayrollRuleActionData,
  PayrollRuleWarning,
  TimetableSetActionData,
  UpdatePayrollRuleActionResult,
  UpdateTimetableActionResult,
  UpdateWorkplaceActionResult,
  WorkplaceActionData,
  WorkplaceDeletedActionData,
} from "@/lib/actions/action-result";
import {
  userActualPayrollTag,
  userPayrollDetailsTag,
  userPayrollSnapshotTag,
  userSummaryTag,
  userWorkplacesTag,
  workplaceDetailTag,
  workplacePayrollRulesTag,
  workplaceTimetablesTag,
} from "@/lib/cache/tags";
import { createWorkplaceRouteAction } from "@/lib/actions/workplace-core/workplaces";
import {
  deleteWorkplaceRouteAction,
  updateWorkplaceRouteAction,
} from "@/lib/actions/workplace-core/workplace";
import { createPayrollRuleRouteAction } from "@/lib/actions/workplace-core/payroll-rules";
import {
  deletePayrollRuleRouteAction,
  updatePayrollRuleRouteAction,
} from "@/lib/actions/workplace-core/payroll-rule";
import { createTimetableRouteAction } from "@/lib/actions/workplace-core/timetables";
import {
  deleteTimetableRouteAction,
  updateTimetableRouteAction,
} from "@/lib/actions/workplace-core/timetable";
import type { SyncResponsePayload } from "@/lib/google-calendar/sync-response";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type DataGuard<TData> = (value: unknown) => value is TData;
type ExtraParser<TExtra extends object> = (
  payload: Record<string, unknown>,
) => TExtra | null;

function isSyncResponsePayload(value: unknown): value is SyncResponsePayload {
  if (!isRecord(value)) return false;

  return (
    (value.status === "pending" ||
      value.status === "success" ||
      value.status === "failed") &&
    typeof value.ok === "boolean" &&
    typeof value.pending === "boolean" &&
    (typeof value.errorMessage === "string" || value.errorMessage === null) &&
    (typeof value.errorCode === "string" || value.errorCode === null) &&
    typeof value.requiresCalendarSetup === "boolean" &&
    typeof value.requiresSignOut === "boolean"
  );
}

function isWorkplaceActionData(value: unknown): value is WorkplaceActionData {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.type === "GENERAL" || value.type === "CRAM_SCHOOL")
  );
}

function isPayrollRuleActionData(
  value: unknown,
): value is PayrollRuleActionData {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workplaceId === "string"
  );
}

function isTimetableSetActionData(
  value: unknown,
): value is TimetableSetActionData {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.workplaceId === "string"
  );
}

function isTimetableCreateActionData(
  value: unknown,
): value is TimetableSetActionData | TimetableSetActionData[] {
  return (
    isTimetableSetActionData(value) ||
    (Array.isArray(value) && value.every(isTimetableSetActionData))
  );
}

function isDeletedActionData(value: unknown): value is DeletedActionData {
  return (
    isRecord(value) && typeof value.id === "string" && value.deleted === true
  );
}

function isDeletedWorkplaceActionData(
  value: unknown,
): value is WorkplaceDeletedActionData {
  if (!isRecord(value)) return false;

  const { id, deleted, relatedCounts } = value;
  if (!isRecord(relatedCounts)) return false;

  return (
    typeof id === "string" &&
    deleted === true &&
    typeof relatedCounts.shifts === "number" &&
    typeof relatedCounts.payrollRules === "number" &&
    typeof relatedCounts.timetableSets === "number" &&
    typeof relatedCounts.actualPayrolls === "number"
  );
}

function parseCreateWorkplaceExtra(
  payload: Record<string, unknown>,
): { initialPayrollRule: PayrollRuleActionData | null } | null {
  if (!("initialPayrollRule" in payload)) return null;

  const initialPayrollRule = payload.initialPayrollRule;
  if (
    initialPayrollRule !== null &&
    !isPayrollRuleActionData(initialPayrollRule)
  ) {
    return null;
  }

  return { initialPayrollRule };
}

function isPayrollRuleWarning(value: unknown): value is PayrollRuleWarning {
  return (
    isRecord(value) &&
    typeof value.message === "string" &&
    Array.isArray(value.overlappingRuleIds) &&
    value.overlappingRuleIds.every((id) => typeof id === "string")
  );
}

function parsePayrollRuleExtra(
  payload: Record<string, unknown>,
): { warning: PayrollRuleWarning | null } | null {
  if (!("warning" in payload)) return null;

  const warning = payload.warning;
  if (warning !== null && !isPayrollRuleWarning(warning)) return null;

  return { warning };
}

function parseDeleteWorkplaceExtra(
  payload: Record<string, unknown>,
): { warning: string | null } | null {
  if (!("warning" in payload)) return null;

  const warning = payload.warning;
  if (typeof warning !== "string" && warning !== null) return null;

  return { warning };
}

function parseNoRequiredExtra(): Record<never, never> {
  return {};
}

function parseActionSuccess<TData, TExtra extends object>(
  payload: Record<string, unknown>,
  isData: DataGuard<TData>,
  parseExtra: ExtraParser<TExtra>,
): ActionSuccess<TData, TExtra> | null {
  if (
    "error" in payload ||
    !("data" in payload) ||
    !isData(payload.data) ||
    !isSyncResponsePayload(payload.sync)
  ) {
    return null;
  }

  const extra = parseExtra(payload);
  if (extra === null) return null;

  return { data: payload.data, sync: payload.sync, ...extra };
}

function mutationRequest(data?: unknown): Request {
  return new Request("http://server-action.local", {
    method: "POST",
    headers: {
      "sec-fetch-site": "same-origin",
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}

async function unwrap<TData, TExtra extends object>(
  response: Response,
  isData: DataGuard<TData>,
  parseExtra: ExtraParser<TExtra>,
): Promise<ActionResult<TData, TExtra>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { error: "操作に失敗しました" };
  }

  if (response.ok) {
    if (isRecord(payload)) {
      const success = parseActionSuccess(payload, isData, parseExtra);
      if (success) return success;
    }

    return { error: "操作に失敗しました" };
  }

  if (!isRecord(payload)) return { error: "操作に失敗しました" };

  return {
    error:
      typeof payload.error === "string" ? payload.error : "操作に失敗しました",
    ...(payload.details === undefined ? {} : { details: payload.details }),
  };
}

function updateWorkplaceTags(userId: string, workplaceId?: string): void {
  const tags = [
    userWorkplacesTag(userId),
    userActualPayrollTag(userId),
    userPayrollSnapshotTag(userId),
    userSummaryTag(userId),
    userPayrollDetailsTag(userId),
  ];
  if (workplaceId) {
    tags.push(
      workplaceDetailTag(workplaceId),
      workplacePayrollRulesTag(workplaceId),
      workplaceTimetablesTag(workplaceId),
    );
  }
  for (const tag of tags) updateTag(tag);
}

async function run<TData, TExtra extends object = Record<never, never>>(
  workplaceId: string | undefined,
  execute: () => Promise<Response | undefined>,
  isData: DataGuard<TData>,
  parseExtra: ExtraParser<TExtra>,
): Promise<ActionResult<TData, TExtra>> {
  const current = await requireSessionAndCurrentUser();
  if ("response" in current) {
    return unwrap<TData, TExtra>(current.response, isData, parseExtra);
  }
  const response = await execute();
  if (!response) return { error: "操作に失敗しました" };
  const result = await unwrap<TData, TExtra>(response, isData, parseExtra);
  if (!("error" in result)) updateWorkplaceTags(current.user.id, workplaceId);
  return result;
}

export async function createWorkplaceAction(
  data: unknown,
): Promise<CreateWorkplaceActionResult> {
  return run<
    WorkplaceActionData,
    { initialPayrollRule: PayrollRuleActionData | null }
  >(
    undefined,
    () => createWorkplaceRouteAction(mutationRequest(data)),
    isWorkplaceActionData,
    parseCreateWorkplaceExtra,
  );
}

export async function updateWorkplaceAction(
  workplaceId: string,
  data: unknown,
): Promise<UpdateWorkplaceActionResult> {
  return run<WorkplaceActionData>(
    workplaceId,
    () =>
      updateWorkplaceRouteAction(mutationRequest(data), {
        params: Promise.resolve({ workplaceId }),
      }),
    isWorkplaceActionData,
    parseNoRequiredExtra,
  );
}

export async function deleteWorkplaceAction(
  workplaceId: string,
): Promise<DeleteWorkplaceActionResult> {
  return run<WorkplaceDeletedActionData, { warning: string | null }>(
    workplaceId,
    () =>
      deleteWorkplaceRouteAction(mutationRequest(), {
        params: Promise.resolve({ workplaceId }),
      }),
    isDeletedWorkplaceActionData,
    parseDeleteWorkplaceExtra,
  );
}

export async function createPayrollRuleAction(
  workplaceId: string,
  data: unknown,
): Promise<CreatePayrollRuleActionResult> {
  return run<PayrollRuleActionData, { warning: PayrollRuleWarning | null }>(
    workplaceId,
    () =>
      createPayrollRuleRouteAction(mutationRequest(data), {
        params: Promise.resolve({ workplaceId }),
      }),
    isPayrollRuleActionData,
    parsePayrollRuleExtra,
  );
}

export async function updatePayrollRuleAction(
  workplaceId: string,
  id: string,
  data: unknown,
): Promise<UpdatePayrollRuleActionResult> {
  return run<PayrollRuleActionData, { warning: PayrollRuleWarning | null }>(
    workplaceId,
    () =>
      updatePayrollRuleRouteAction(mutationRequest(data), {
        params: Promise.resolve({ workplaceId, id }),
      }),
    isPayrollRuleActionData,
    parsePayrollRuleExtra,
  );
}

export async function deletePayrollRuleAction(
  workplaceId: string,
  id: string,
): Promise<DeletePayrollRuleActionResult> {
  return run<DeletedActionData>(
    workplaceId,
    () =>
      deletePayrollRuleRouteAction(mutationRequest(), {
        params: Promise.resolve({ workplaceId, id }),
      }),
    isDeletedActionData,
    parseNoRequiredExtra,
  );
}

export async function createTimetableAction(
  workplaceId: string,
  data: unknown,
): Promise<CreateTimetableActionResult> {
  return run<TimetableSetActionData | TimetableSetActionData[]>(
    workplaceId,
    () =>
      createTimetableRouteAction(mutationRequest(data), {
        params: Promise.resolve({ workplaceId }),
      }),
    isTimetableCreateActionData,
    parseNoRequiredExtra,
  );
}

export async function updateTimetableAction(
  workplaceId: string,
  id: string,
  data: unknown,
): Promise<UpdateTimetableActionResult> {
  return run<TimetableSetActionData>(
    workplaceId,
    () =>
      updateTimetableRouteAction(mutationRequest(data), {
        params: Promise.resolve({ workplaceId, id }),
      }),
    isTimetableSetActionData,
    parseNoRequiredExtra,
  );
}

export async function deleteTimetableAction(
  workplaceId: string,
  id: string,
): Promise<DeleteTimetableActionResult> {
  return run<DeletedActionData>(
    workplaceId,
    () =>
      deleteTimetableRouteAction(mutationRequest(), {
        params: Promise.resolve({ workplaceId, id }),
      }),
    isDeletedActionData,
    parseNoRequiredExtra,
  );
}
