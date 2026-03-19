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

type ConfirmedShiftsListProps = {
  groups: ConfirmedShiftWorkplaceGroup[];
};

function formatDurationHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

export function ConfirmedShiftsList({ groups }: ConfirmedShiftsListProps) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <Card key={group.workplaceId} size="sm" className="max-w-2xl">
          <CardHeader>
            <CardTitle className="font-bold">{group.workplaceName}</CardTitle>
          </CardHeader>

          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold">日付</TableHead>
                  <TableHead className="font-bold">時間帯</TableHead>
                  <TableHead className="font-bold">給与</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.shifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell>{shift.date}</TableCell>
                    <TableCell>{`${shift.startTime} ～ ${shift.endTime}（実働${formatDurationHours(shift.workDurationHours)}）`}</TableCell>
                    <TableCell>
                      {shift.wage === null ? "-" : formatCurrency(shift.wage)}
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
