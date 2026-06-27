"use client";

import { use } from "react";
import * as React from "react";

import { cn } from "@/lib/utils";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  );
};

type ChartContextProps = {
  config: ChartConfig;
};

type ChartPayloadValue = number | string | null;

type ChartPayloadRecord = Record<string, unknown> & {
  fill?: string;
};

type ChartPayloadItem = {
  color?: string;
  dataKey?: string | number;
  name?: string | number;
  payload?: ChartPayloadRecord;
  type?: string;
  value?: ChartPayloadValue;
};

type ChartTooltipContentProps = React.ComponentProps<"div"> & {
  active?: boolean;
  payload?: ChartPayloadItem[];
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: "line" | "dot" | "dashed";
  label?: React.ReactNode;
  labelFormatter?: (
    value: React.ReactNode,
    payload: ChartPayloadItem[],
  ) => React.ReactNode;
  labelClassName?: string;
  formatter?: (
    value: ChartPayloadValue,
    name: string,
    item: ChartPayloadItem,
    index: number,
    payload: ChartPayloadRecord | undefined,
  ) => React.ReactNode;
  color?: string;
  nameKey?: string;
  labelKey?: string;
};

type ChartLegendContentProps = React.ComponentProps<"div"> & {
  hideIcon?: boolean;
  payload?: ChartPayloadItem[];
  verticalAlign?: "top" | "bottom";
  nameKey?: string;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = use(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ReactNode;
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;
  const contextValue = React.useMemo(() => ({ config }), [config]);

  return (
    <ChartContext.Provider value={contextValue}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        {children}
      </div>
    </ChartContext.Provider>
  );
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, configValue]) => configValue.theme || configValue.color,
  );

  if (colorConfig.length === 0) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ||
      itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .join("\n")}
}
`,
          )
          .join("\n"),
      }}
    />
  );
};

function resolveTooltipLabel(params: {
  config: ChartConfig;
  hideLabel: boolean;
  label: React.ReactNode;
  labelClassName?: string;
  labelFormatter?: (
    value: React.ReactNode,
    payload: ChartPayloadItem[],
  ) => React.ReactNode;
  labelKey?: string;
  payload: ChartPayloadItem[];
}) {
  const {
    config,
    hideLabel,
    label,
    labelClassName,
    labelFormatter,
    labelKey,
    payload,
  } = params;

  if (hideLabel || payload.length === 0) {
    return null;
  }

  const [item] = payload;
  const key = `${labelKey || item?.dataKey || item?.name || "value"}`;
  const itemConfig = getPayloadConfigFromPayload(config, item, key);
  const value =
    !labelKey && typeof label === "string"
      ? config[label]?.label || label
      : itemConfig?.label;

  if (labelFormatter) {
    return (
      <div className={cn("font-medium", labelClassName)}>
        {labelFormatter(value, payload)}
      </div>
    );
  }

  if (value === undefined || value === null || value === "") {
    return null;
  }

  return <div className={cn("font-medium", labelClassName)}>{value}</div>;
}

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: ChartTooltipContentProps) {
  const { config } = useChart();

  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const tooltipLabel = resolveTooltipLabel({
    config,
    hideLabel,
    label,
    labelClassName,
    labelFormatter,
    labelKey,
    payload,
  });
  const nestLabel = payload.length === 1 && indicator !== "dot";
  const tooltipRows: React.ReactNode[] = [];

  for (const [index, item] of payload.entries()) {
    if (item.type === "none") {
      continue;
    }

    const key = `${nameKey || item.name || item.dataKey || "value"}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);
    const indicatorColor = color || item.payload?.fill || item.color;
    const itemName = typeof item.name === "string" ? item.name : key;

    tooltipRows.push(
      <div
        key={String(item.dataKey ?? itemName ?? index)}
        className={cn(
          "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
          indicator === "dot" && "items-center",
        )}
      >
        {formatter && item.value !== undefined ? (
          formatter(item.value, itemName, item, index, item.payload)
        ) : (
          <>
            {itemConfig?.icon ? (
              <itemConfig.icon />
            ) : (
              !hideIndicator && (
                <div
                  className={cn(
                    "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
                    {
                      "h-2.5 w-2.5": indicator === "dot",
                      "w-1": indicator === "line",
                      "w-0 border-[1.5px] border-dashed bg-transparent":
                        indicator === "dashed",
                      "my-0.5": nestLabel && indicator === "dashed",
                    },
                  )}
                  style={
                    {
                      "--color-bg": indicatorColor,
                      "--color-border": indicatorColor,
                    } as React.CSSProperties
                  }
                />
              )
            )}
            <div
              className={cn(
                "flex flex-1 justify-between leading-none",
                nestLabel ? "items-end" : "items-center",
              )}
            >
              <div className="grid gap-1.5">
                {nestLabel ? tooltipLabel : null}
                <span className="text-muted-foreground">
                  {itemConfig?.label || itemName}
                </span>
              </div>
              {item.value ? (
                <span className="font-mono font-medium text-foreground tabular-nums">
                  {item.value.toLocaleString()}
                </span>
              ) : null}
            </div>
          </>
        )}
      </div>,
    );
  }

  return (
    <div
      className={cn(
        "grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className,
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">{tooltipRows}</div>
    </div>
  );
}

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: ChartLegendContentProps) {
  const { config } = useChart();

  if (!payload || payload.length === 0) {
    return null;
  }

  const legendItems: React.ReactNode[] = [];
  for (const item of payload) {
    if (item.type === "none") {
      continue;
    }

    const key = `${nameKey || item.dataKey || "value"}`;
    const itemConfig = getPayloadConfigFromPayload(config, item, key);

    legendItems.push(
      <div
        key={String(item.value ?? item.dataKey ?? key)}
        className={cn(
          "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground",
        )}
      >
        {itemConfig?.icon && !hideIcon ? (
          <itemConfig.icon />
        ) : (
          <div
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{
              backgroundColor: item.color,
            }}
          />
        )}
        {itemConfig?.label}
      </div>,
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className,
      )}
    >
      {legendItems}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string,
) {
  if (!isRecord(payload)) {
    return undefined;
  }

  const payloadData = isRecord(payload.payload) ? payload.payload : undefined;

  let configLabelKey = key;

  if (typeof payload[key] === "string") {
    configLabelKey = payload[key] as string;
  } else if (payloadData && typeof payloadData[key] === "string") {
    configLabelKey = payloadData[key] as string;
  }

  return configLabelKey in config ? config[configLabelKey] : config[key];
}

export { ChartContainer, ChartTooltipContent, ChartLegendContent, ChartStyle };
