"use client";

import dynamic from "next/dynamic";
import {
  EditShiftFormLoadingSkeleton,
  NewShiftFormLoadingSkeleton,
} from "@/components/shifts/ShiftFormLoadingSkeleton";
import type { ShiftFormReturnTo } from "@/lib/shifts/page-search-params";

type ShiftFormNavigationProps = {
  returnMonth?: string;
  returnTo: ShiftFormReturnTo;
};

type NewShiftFormPageClientProps = ShiftFormNavigationProps & {
  initialDate?: string;
};

type EditShiftFormPageClientProps = ShiftFormNavigationProps & {
  shiftId: string;
};

const NewShiftForm = dynamic(
  () => import("@/components/shifts/ShiftForm").then((mod) => mod.ShiftForm),
  {
    loading: () => <NewShiftFormLoadingSkeleton />,
  },
);

const EditShiftForm = dynamic(
  () => import("@/components/shifts/ShiftForm").then((mod) => mod.ShiftForm),
  {
    loading: () => <EditShiftFormLoadingSkeleton />,
  },
);

export function NewShiftFormPageClient({
  initialDate,
  returnMonth,
  returnTo,
}: NewShiftFormPageClientProps) {
  return (
    <NewShiftForm
      mode="create"
      initialDate={initialDate}
      returnMonth={returnMonth}
      returnTo={returnTo}
    />
  );
}

export function EditShiftFormPageClient({
  shiftId,
  returnMonth,
  returnTo,
}: EditShiftFormPageClientProps) {
  return (
    <EditShiftForm
      mode="edit"
      shiftId={shiftId}
      returnMonth={returnMonth}
      returnTo={returnTo}
    />
  );
}
