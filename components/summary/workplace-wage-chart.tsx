"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { type PayrollSummaryResult } from "@/lib/payroll/summary";

type WorkplaceWageChartProps = {
  byWorkplace: PayrollSummaryResult["byWorkplace"];
};

const chartConfig = {
  wage: {
    label: "給与",
    color: "var(--chart-1)",
  },
} as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

export function WorkplaceWageChart({ byWorkplace }: WorkplaceWageChartProps) {
  return (
    <ChartContainer config={chartConfig} className="h-[280px] w-full">
      <BarChart data={byWorkplace}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="workplaceName"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) =>
            new Intl.NumberFormat("ja-JP", {
              maximumFractionDigits: 0,
            }).format(value)
          }
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value) => [formatCurrency(Number(value)), "給与"]}
            />
          }
        />
        <Bar dataKey="wage" fill="var(--color-wage)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
