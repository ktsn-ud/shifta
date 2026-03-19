"use client";

import { useState } from "react";
import { ConfirmShiftCard } from "@/components/shifts/ConfirmShiftCard";
import { ConfirmedShiftsList } from "@/components/shifts/ConfirmedShiftsList";
import {
  type ConfirmedShiftWorkplaceGroup,
  type UnconfirmedShiftItem,
} from "@/components/shifts/shift-confirmation-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ShiftConfirmPage() {
  const [unconfirmedShifts, setUnconfirmedShifts] = useState<
    UnconfirmedShiftItem[]
  >([]);
  const [confirmedShiftGroups] = useState<ConfirmedShiftWorkplaceGroup[]>([]);

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <h2 className="text-xl font-semibold">シフト確定</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          未確定シフトの時刻調整と確定・削除を行えます。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>未確定シフト</CardTitle>
        </CardHeader>
        <CardContent>
          {unconfirmedShifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              未確定シフトはありません
            </p>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto pr-1">
              <div className="flex flex-col gap-3">
                {unconfirmedShifts.map((shift) => (
                  <ConfirmShiftCard
                    key={shift.id}
                    shift={shift}
                    onChange={(shiftId, patch) => {
                      setUnconfirmedShifts((current) =>
                        current.map((item) =>
                          item.id === shiftId ? { ...item, ...patch } : item,
                        ),
                      );
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmedShiftGroups.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">今月の確定済みシフト</h3>
          <ConfirmedShiftsList groups={confirmedShiftGroups} />
        </section>
      ) : null}
    </section>
  );
}
