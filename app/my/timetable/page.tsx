"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { z } from "zod";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const workplaceListResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(["GENERAL", "CRAM_SCHOOL"]),
    }),
  ),
});

type Workplace = z.infer<typeof workplaceListResponseSchema>["data"][number];

async function readApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export default function TimetablePage() {
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    async function fetchWorkplaces() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/workplaces", {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (response.ok === false) {
          throw new Error(
            await readApiErrorMessage(
              response,
              "勤務先一覧の取得に失敗しました。",
            ),
          );
        }

        const parsed = workplaceListResponseSchema.safeParse(
          (await response.json()) as unknown,
        );
        if (parsed.success === false) {
          throw new Error("勤務先一覧レスポンスの形式が不正です。");
        }

        setWorkplaces(
          parsed.data.data.filter(
            (workplace) => workplace.type === "CRAM_SCHOOL",
          ),
        );
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("failed to fetch workplaces for timetable", error);
        setWorkplaces([]);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "勤務先一覧の取得に失敗しました。",
        );
      } finally {
        if (abortController.signal.aborted === false) {
          setIsLoading(false);
        }
      }
    }

    void fetchWorkplaces();

    return () => {
      abortController.abort();
    };
  }, []);

  return (
    <section className="space-y-6 p-4 md:p-6">
      <header>
        <h2 className="text-xl font-semibold">Timetable</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          塾時間割を管理する勤務先（CRAM_SCHOOL）を選択してください。
        </p>
      </header>

      {errorMessage ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>勤務先選択</CardTitle>
          <CardDescription>CRAM_SCHOOL勤務先のみ表示されます。</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中です...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>勤務先名</TableHead>
                  <TableHead>タイプ</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workplaces.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-16 text-center">
                      CRAM_SCHOOL 勤務先がありません。
                    </TableCell>
                  </TableRow>
                ) : (
                  workplaces.map((workplace) => (
                    <TableRow key={workplace.id}>
                      <TableCell className="font-medium">
                        {workplace.name}
                      </TableCell>
                      <TableCell>{workplace.type}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Link
                            href={`/my/workplaces/${workplace.id}/timetables`}
                            className={buttonVariants({ size: "sm" })}
                          >
                            時間割管理
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
