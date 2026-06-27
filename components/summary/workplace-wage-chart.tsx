"use client";

import { useEffect, useState } from "react";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { SpinnerPanel } from "@/components/ui/spinner";

type WorkplaceWageChartProps = {
  byWorkplace: Array<{
    workplaceName: string;
    displayWage: number;
  }>;
};

type RechartsModule = typeof import("recharts");

const chartConfig = {
  displayWage: {
    label: "給与",
    color: "var(--chart-1)",
  },
} as const;

const currencyFormatter = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});
const axisCurrencyFormatter = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 0,
});

let cachedRechartsModule: RechartsModule | null = null;
let rechartsModulePromise: Promise<RechartsModule> | null = null;

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function loadRechartsModule(): Promise<RechartsModule> {
  if (cachedRechartsModule) {
    return Promise.resolve(cachedRechartsModule);
  }

  rechartsModulePromise ??= import("recharts").then((module) => {
    cachedRechartsModule = module;
    return module;
  });

  return rechartsModulePromise;
}

function useRechartsModule() {
  const [rechartsModule, setRechartsModule] = useState<RechartsModule | null>(
    cachedRechartsModule,
  );

  useEffect(() => {
    if (rechartsModule) {
      return;
    }

    let isMounted = true;

    void loadRechartsModule().then((module) => {
      if (isMounted) {
        setRechartsModule(module);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [rechartsModule]);

  return rechartsModule;
}

export function WorkplaceWageChart({ byWorkplace }: WorkplaceWageChartProps) {
  const rechartsModule = useRechartsModule();

  if (!rechartsModule) {
    return <SpinnerPanel className="h-[280px]" label="グラフを読み込み中..." />;
  }

  const {
    Bar,
    BarChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
  } = rechartsModule;

  return (
    <ChartContainer config={chartConfig} className="h-[280px] w-full">
      <ResponsiveContainer>
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
              axisCurrencyFormatter.format(value)
            }
          />
          <Tooltip
            cursor={false}
            content={
              <ChartTooltipContent
                formatter={(value) => [formatCurrency(Number(value)), "給与"]}
              />
            }
          />
          <Bar
            dataKey="displayWage"
            fill="var(--color-displayWage)"
            radius={4}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
