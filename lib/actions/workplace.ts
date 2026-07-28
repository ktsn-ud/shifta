"use server";

import { updateTag } from "next/cache";
import { requireSessionAndCurrentUser } from "@/lib/api/current-user";
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

type ActionResult = Record<string, unknown>;

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

async function unwrap(response: Response): Promise<ActionResult> {
  const payload = (await response.json()) as ActionResult;
  if (response.ok) return payload;
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

async function run(
  workplaceId: string | undefined,
  execute: () => Promise<Response | undefined>,
): Promise<ActionResult> {
  const current = await requireSessionAndCurrentUser();
  if ("response" in current) return unwrap(current.response);
  const response = await execute();
  if (!response) return { error: "操作に失敗しました" };
  const result = await unwrap(response);
  if (!("error" in result)) updateWorkplaceTags(current.user.id, workplaceId);
  return result;
}

export async function createWorkplaceAction(data: unknown) {
  return run(undefined, () =>
    createWorkplaceRouteAction(mutationRequest(data)),
  );
}

export async function updateWorkplaceAction(
  workplaceId: string,
  data: unknown,
) {
  return run(workplaceId, () =>
    updateWorkplaceRouteAction(mutationRequest(data), {
      params: Promise.resolve({ workplaceId }),
    }),
  );
}

export async function deleteWorkplaceAction(workplaceId: string) {
  return run(workplaceId, () =>
    deleteWorkplaceRouteAction(mutationRequest(), {
      params: Promise.resolve({ workplaceId }),
    }),
  );
}

export async function createPayrollRuleAction(
  workplaceId: string,
  data: unknown,
) {
  return run(workplaceId, () =>
    createPayrollRuleRouteAction(mutationRequest(data), {
      params: Promise.resolve({ workplaceId }),
    }),
  );
}

export async function updatePayrollRuleAction(
  workplaceId: string,
  id: string,
  data: unknown,
) {
  return run(workplaceId, () =>
    updatePayrollRuleRouteAction(mutationRequest(data), {
      params: Promise.resolve({ workplaceId, id }),
    }),
  );
}

export async function deletePayrollRuleAction(workplaceId: string, id: string) {
  return run(workplaceId, () =>
    deletePayrollRuleRouteAction(mutationRequest(), {
      params: Promise.resolve({ workplaceId, id }),
    }),
  );
}

export async function createTimetableAction(
  workplaceId: string,
  data: unknown,
) {
  return run(workplaceId, () =>
    createTimetableRouteAction(mutationRequest(data), {
      params: Promise.resolve({ workplaceId }),
    }),
  );
}

export async function updateTimetableAction(
  workplaceId: string,
  id: string,
  data: unknown,
) {
  return run(workplaceId, () =>
    updateTimetableRouteAction(mutationRequest(data), {
      params: Promise.resolve({ workplaceId, id }),
    }),
  );
}

export async function deleteTimetableAction(workplaceId: string, id: string) {
  return run(workplaceId, () =>
    deleteTimetableRouteAction(mutationRequest(), {
      params: Promise.resolve({ workplaceId, id }),
    }),
  );
}
