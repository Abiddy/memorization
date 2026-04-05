"use client";

import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FiveMonthMemorisationChartData } from "@/lib/projection-chart";
import { formatMonthLongNameFromYm, SURAH_CHART_MAX } from "@/lib/projection-chart";

/** Primary line / bar green — matches pre–Robinhood stats charts. */
const ACCENT_GREEN = "#047857";

export type FiveMonthChart = FiveMonthMemorisationChartData;

function avatarBackground(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 42% 88%)`;
}

function lastDataIndexForSeries(rows: Record<string, unknown>[], dataKey: string): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][dataKey];
    if (typeof v === "number" && !Number.isNaN(v)) return i;
  }
  return -1;
}

function StatsFullBleed({ children }: { children: ReactNode }) {
  return (
    <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 bg-white dark:bg-zinc-950">
      {children}
    </div>
  );
}

export function StatsMemorisationOverTimeStrip({
  chart,
  projectionScope,
  trajectoryYouAvailable,
  showEndpointInitials = false,
}: {
  chart: FiveMonthChart;
  projectionScope: "you" | "all";
  trajectoryYouAvailable: boolean;
  /** When true, the last visible point on each line is a ring with the member’s initial (group view). */
  showEndpointInitials?: boolean;
}) {
  const [selectedMonth, setSelectedMonth] = useState(0);
  const hasChart = chart.rows.length > 0;

  const emptyMessage =
    projectionScope === "you" && !trajectoryYouAvailable
      ? "We couldn’t find your member profile for this chart — try All."
      : "Not enough data for a chart yet.";

  if (!hasChart) {
    return (
      <StatsFullBleed>
        <p className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
      </StatsFullBleed>
    );
  }

  const rowPayload = chart.rows as Record<string, unknown>[];

  return (
    <StatsFullBleed>
      <div className="h-[min(45vh,20rem)] min-h-[200px] w-full px-3 pt-4 sm:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chart.rows}
            margin={{ top: 12, right: 6, left: 6, bottom: 4 }}
            accessibilityLayer={false}
            className="outline-none [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_svg]:outline-none"
          >
            {/* 0–114 surahs (full Quran). Recharts v3: allowDataOverflow must be true for a fixed numeric domain to apply without merging quirks; niceTicks off avoids domain expansion past 114. */}
            <YAxis
              type="number"
              domain={[0, SURAH_CHART_MAX]}
              allowDataOverflow
              niceTicks="none"
              hide
            />
            <XAxis
              type="number"
              dataKey="monthIndex"
              domain={[0, 4]}
              ticks={[0, 1, 2, 3, 4]}
              padding={{ left: 28, right: 28 }}
              hide
            />
            {chart.lines.map((ln) => {
              const stroke =
                projectionScope === "you" && chart.lines.length === 1 ? ACCENT_GREEN : ln.stroke;
              const dataKey = ln.dataKey;
              const lastIdx = lastDataIndexForSeries(rowPayload, dataKey);
              const useInitialDots = showEndpointInitials && lastIdx >= 0;

              return (
                <Line
                  key={dataKey}
                  type="linear"
                  dataKey={dataKey}
                  name={ln.name}
                  stroke={stroke}
                  strokeWidth={projectionScope === "all" ? 1.75 : 2}
                  connectNulls={false}
                  isAnimationActive={false}
                  dot={(dotProps) => {
                    const cx = dotProps.cx as number | undefined;
                    const cy = dotProps.cy as number | undefined;
                    const index = dotProps.index as number | undefined;
                    const payload = dotProps.payload as Record<string, unknown> | undefined;
                    if (cx == null || cy == null || index == null || !payload) return null;
                    const v = payload[dataKey];
                    if (typeof v !== "number" || Number.isNaN(v)) return null;
                    const isEnd = useInitialDots && index === lastIdx;
                    if (!isEnd) {
                      return <circle cx={cx} cy={cy} r={2.5} fill={stroke} />;
                    }
                    const initial = ln.name.trim().slice(0, 1).toUpperCase() || "?";
                    const bg = avatarBackground(ln.name);
                    return (
                      <g aria-hidden>
                        <circle cx={cx} cy={cy} r={13} fill={bg} stroke={stroke} strokeWidth={2} />
                        <text
                          x={cx}
                          y={cy}
                          dy="0.35em"
                          textAnchor="middle"
                          fill="#18181b"
                          fontSize={11}
                          fontWeight={700}
                          style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
                        >
                          {initial}
                        </text>
                      </g>
                    );
                  }}
                  activeDot={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div
        className="grid w-full grid-cols-5 gap-0 px-3 pb-5 pt-2 sm:px-4"
        role="tablist"
        aria-label="Month range"
      >
        {chart.sortedDates.map((ym, i) => {
          const active = selectedMonth === i;
          const label = formatMonthLongNameFromYm(ym);
          return (
            <button
              key={ym}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedMonth(i)}
              className={`w-full px-0.5 py-1.5 text-center text-xs font-semibold leading-tight transition sm:text-sm ${
                active
                  ? "text-emerald-800 dark:text-emerald-400"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </StatsFullBleed>
  );
}

type LeaderboardRow = { name: string; pct: number };

export function StatsLeaderboardStrip({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) {
    return (
      <StatsFullBleed>
        <p className="px-4 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No leaderboard data yet.
        </p>
      </StatsFullBleed>
    );
  }

  return (
    <StatsFullBleed>
      <div className="h-[min(42vh,18rem)] min-h-[160px] w-full px-1 pb-5 pt-4 sm:px-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 12, right: 4, left: 4, bottom: 36 }}
            barCategoryGap="22%"
            accessibilityLayer={false}
            className="outline-none [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none [&_svg]:outline-none"
          >
            <XAxis
              dataKey="name"
              type="category"
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval={0}
            />
            <YAxis type="number" domain={[0, 100]} hide />
            <Tooltip
              cursor={false}
              formatter={(v) => [`${typeof v === "number" ? v : Number(v) || 0}%`, "% Quran"]}
              contentStyle={{
                borderRadius: "0.75rem",
                border: "1px solid rgb(228 228 231)",
                background: "#ffffff",
                fontSize: "11px",
                color: "rgb(63 63 70)",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.08)",
              }}
            />
            <Bar dataKey="pct" name="% Quran" fill={ACCENT_GREEN} radius={[6, 6, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </StatsFullBleed>
  );
}
