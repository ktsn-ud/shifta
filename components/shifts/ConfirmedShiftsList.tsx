import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ConfirmedShiftWorkplaceGroup } from "@/components/shifts/shift-confirmation-types";
import { formatShiftTimeRange } from "@/lib/shifts/time";

type ConfirmedShiftsListProps = {
  groups: ConfirmedShiftWorkplaceGroup[];
};

function formatDurationHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function ConfirmedShiftsList({ groups }: ConfirmedShiftsListProps) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <Card
          key={group.workplaceId}
          size="sm"
          className="w-full max-w-2xl border ring-0"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-bold">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: group.workplaceColor }}
              />
              {group.workplaceName}
            </CardTitle>
          </CardHeader>

          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold">日付</TableHead>
                  <TableHead className="font-bold">コメント</TableHead>
                  <TableHead className="font-bold">時間帯</TableHead>
                  <TableHead className="font-bold">給与</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.shifts.map((shift) => (
                  <TableRow
                    key={shift.id}
                    className={
                      shift.status === "provisional" ? "opacity-70" : undefined
                    }
                  >
                    <TableCell>{shift.date}</TableCell>
                    <TableCell>{shift.comment ?? "-"}</TableCell>
                    <TableCell>
                      {shift.status === "provisional"
                        ? `${formatShiftTimeRange(shift.startTime, shift.endTime, { separator: " ～ " })}（実働計算中）`
                        : `${formatShiftTimeRange(shift.startTime, shift.endTime, { separator: " ～ " })}（実働${formatDurationHours(shift.workDurationHours ?? 0)}）`}
                    </TableCell>
                    <TableCell>
                      {shift.status === "provisional"
                        ? "計算中"
                        : shift.wage === null
                          ? "-"
                          : formatCurrency(shift.wage)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
