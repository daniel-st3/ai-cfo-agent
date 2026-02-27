"use client";
import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  { label?: React.ReactNode; icon?: React.ComponentType; color?: string }
>;

type ChartContextProps = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be inside ChartContainer");
  return context;
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { config: ChartConfig; children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"] }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn("flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-sector]:outline-none", className)}
        {...props}
      >
        <style>{Object.entries(config).map(([key, value]) =>
          value.color ? `[data-chart=${chartId}] { --color-${key}: ${value.color}; }` : ""
        ).join("\n")}</style>
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "Chart";

const ChartTooltip = RechartsPrimitive.Tooltip;

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> &
    React.ComponentProps<typeof RechartsPrimitive.Tooltip> & {
      hideLabel?: boolean;
      hideIndicator?: boolean;
      indicator?: "line" | "dot" | "dashed";
      nameKey?: string;
      labelKey?: string;
    }
>(({ active, payload, className, indicator = "dot", hideLabel = false, hideIndicator = false, label, labelFormatter, labelClassName, formatter, color, nameKey, labelKey }, ref) => {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) return null;
    const item = payload[0];
    const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`;
    const cfg = getPayloadConfigFromPayload(config, item, key);
    const val = !labelKey && typeof label === "string" ? (config[label as keyof typeof config]?.label ?? label) : cfg?.label;

    if (labelFormatter) {
      return <div className={cn("font-medium", labelClassName)}>{labelFormatter(label, payload)}</div>;
    }
    return val ? <div className={cn("font-medium", labelClassName)}>{val}</div> : null;
  }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey]);

  if (!active || !payload?.length) return null;

  return (
    <div ref={ref} className={cn("grid min-w-[120px] items-start gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs shadow-xl", className)}>
      {tooltipLabel}
      <div className="grid gap-1.5">
        {payload.map((item, index) => {
          const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`;
          const cfg = getPayloadConfigFromPayload(config, item, key);
          const indicatorColor = color ?? item.payload?.fill ?? item.color;

          return (
            <div key={item.dataKey} className={cn("flex w-full flex-wrap items-stretch gap-2", "[&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground")}>
              {cfg?.icon ? (
                <cfg.icon />
              ) : !hideIndicator ? (
                <div className={cn("shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]", indicator === "dot" && "mt-0.5 h-2 w-2 rounded-full", indicator === "line" && "h-2 w-px", indicator === "dashed" && "h-2 w-px border-r-2 border-dashed bg-transparent")} style={{ "--color-bg": indicatorColor, "--color-border": indicatorColor } as React.CSSProperties} />
              ) : null}
              <div className="flex flex-1 justify-between gap-4">
                <span className="text-zinc-500">{cfg?.label || item.name}</span>
                {item.value !== undefined && (
                  <span className="font-mono font-semibold tabular-nums text-zinc-200">
                    {formatter ? formatter(item.value, item.name ?? "", item, index, payload) : item.value?.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});
ChartTooltipContent.displayName = "ChartTooltipContent";

// Helper
function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string) {
  if (typeof payload !== "object" || payload === null) return undefined;
  const payloadPayload = "payload" in payload && typeof payload.payload === "object" && payload.payload !== null ? payload.payload : undefined;
  let configLabelKey = key;
  if (payloadPayload && key in payloadPayload) {
    configLabelKey = payloadPayload[key as keyof typeof payloadPayload] as string;
  }
  return configLabelKey in config ? config[configLabelKey] : config[key as keyof typeof config];
}

const ChartLegend = RechartsPrimitive.Legend;

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { hideIcon?: boolean; nameKey?: string } & Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign">
>(({ className, hideIcon = false, payload, verticalAlign = "bottom", nameKey }, ref) => {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div ref={ref} className={cn("flex items-center justify-center gap-4", verticalAlign === "top" ? "pb-3" : "pt-3", className)}>
      {payload.map((item) => {
        const key = `${nameKey ?? item.dataKey ?? "value"}`;
        const cfg = getPayloadConfigFromPayload(config, item, key);
        return (
          <div key={item.value} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            {cfg?.icon && !hideIcon ? <cfg.icon /> : <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />}
            {cfg?.label}
          </div>
        );
      })}
    </div>
  );
});
ChartLegendContent.displayName = "ChartLegendContent";

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent };
