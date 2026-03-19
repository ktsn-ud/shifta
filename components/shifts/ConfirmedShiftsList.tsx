import { Badge } from "@/components/ui/badge";
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

export function ConfirmedShiftsList({ groups }: ConfirmedShiftsListProps) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <Card key={group.workplaceId} size="sm">
          <CardHeader>
            <CardTitle>{group.workplaceName}</CardTitle>
          </CardHeader>

          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日付</TableHead>
                  <TableHead>時間帯</TableHead>
                  <TableHead>状態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.shifts.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell>{shift.date}</TableCell>
                    <TableCell>{`${shift.startTime} ～ ${shift.endTime}（実働${formatDurationHours(shift.workDurationHours)}）`}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">✓</Badge>
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
