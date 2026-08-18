import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TABLE_HEADERS = [
  "日付",
  "勤務先",
  "種別・確定",
  "時間 / 時間割",
  "休憩",
  "交通費",
  "コメント",
];

const TABLE_ROWS = 6;

export function BulkShiftEditLoadingSkeleton() {
  return (
    <section
      className="flex flex-col gap-6 p-4 md:p-6"
      aria-busy="true"
      aria-label="シフト一括編集を読み込み中"
    >
      <p className="sr-only" role="status">
        シフト一括編集を読み込み中です。
      </p>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">シフト一括編集</h2>
          <p className="text-sm text-muted-foreground">
            編集可能なセルだけを変更し、変更行のみ保存します。
          </p>
        </div>
        <div className="flex items-center gap-2" aria-hidden="true">
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-12" />
        </div>
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3"
        aria-hidden="true"
      >
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      <Table aria-label="シフト一括編集の読み込み中">
        <TableHeader>
          <TableRow>
            {TABLE_HEADERS.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody aria-hidden="true">
          {Array.from({ length: TABLE_ROWS }, (_, index) => (
            <TableRow key={index}>
              <TableCell>
                <Skeleton className="h-5 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-24" />
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-24" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-9 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-9 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-9 w-40" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
