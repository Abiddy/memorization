"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { StructuredProgressPicker } from "@/app/components/structured-progress-picker";
import {
  MatrixTrackLegend,
  SurahHeatmapPanel,
  SurahMatrixHelpButton,
  type HeatmapPayload,
} from "@/app/components/surah-heatmap-panel";
import type { MemberTrajectory } from "@/lib/progress-aggregate";

type MessageRow = {
  id: string;
  member_id: string | null;
  display_name: string;
  body: string;
  created_at: string;
};

type DashboardSurahEntry = {
  juz: number;
  surahId: number;
  name: string;
};

type DashboardRow = {
  member_id: string;
  display_name: string;
  revising: DashboardSurahEntry[];
  memorising: DashboardSurahEntry[];
  reciting: DashboardSurahEntry[];
  pct_quran: number;
};

function FocusTrackSurahList({ entries }: { entries: DashboardSurahEntry[] }) {
  if (entries.length === 0) {
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }
  const badgeClass =
    "inline-flex min-w-[1rem] shrink-0 items-center justify-center rounded border border-zinc-300/90 bg-zinc-200/90 px-0.5 py-px text-[8px] font-semibold tabular-nums leading-none text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 lg:min-w-[1.125rem] lg:rounded-md lg:px-1 lg:text-[9px]";
  return (
    <>
      <span className="flex flex-col gap-0.5 text-[10px] leading-tight text-zinc-600 dark:text-zinc-400 lg:hidden">
        {entries.map((e) => (
          <span key={e.surahId} className="inline-flex min-w-0 max-w-full items-baseline gap-0.5">
            <span className={badgeClass} title={`Juz ${e.juz}`}>
              {e.juz}
            </span>
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">{e.name}</span>
          </span>
        ))}
      </span>
      <span className="hidden text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 lg:inline">
        {entries.map((e, i) => (
          <Fragment key={e.surahId}>
            {i > 0 ? <span className="text-zinc-500">, </span> : null}
            <span className="inline-flex items-baseline gap-1">
              <span className={badgeClass} title={`Juz ${e.juz}`}>
                {e.juz}
              </span>
              <span>{e.name}</span>
            </span>
          </Fragment>
        ))}
      </span>
    </>
  );
}

type ProgressReport = {
  leaderboard: { member_id: string; display_name: string; pct_quran: number }[];
  clubSeries: { date: string; clubPct: number }[];
  projection: { date: string; clubPct: number; projected: true }[];
  memberTrajectories: MemberTrajectory[];
  dashboard: DashboardRow[];
  heatmap: HeatmapPayload | null;
};

type MainPanel = "chat" | "focus" | "heatmap" | "trajectory" | "bars";

const NAV: {
  id: MainPanel;
  label: string;
  Icon: (props: { className?: string }) => ReactNode;
}[] = [
  {
    id: "chat",
    label: "Group chat",
    Icon: function IconChat({ className }: { className?: string }) {
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    },
  },
  {
    id: "focus",
    label: "Current focus",
    Icon: function IconFocus({ className }: { className?: string }) {
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    },
  },
  {
    id: "heatmap",
    label: "Surah matrix",
    Icon: function IconHeatmap({ className }: { className?: string }) {
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    },
  },
  {
    id: "trajectory",
    label: "Projections",
    Icon: function IconLine({ className }: { className?: string }) {
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 3v18h18" />
          <path d="M7 16l4-6 4 3 5-9" />
        </svg>
      );
    },
  },
  {
    id: "bars",
    label: "Leaderboard",
    Icon: function IconBars({ className }: { className?: string }) {
      return (
        <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    },
  },
];

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function avatarBackground(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 42% 88%)`;
}

function formatMessageBody(text: string): ReactNode {
  const parts = text.split(/(@[\w.-]+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="font-medium text-violet-600 dark:text-violet-400">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function panelTitle(p: MainPanel): string {
  switch (p) {
    case "chat":
      return "Group chat";
    case "focus":
      return "Current focus";
    case "heatmap":
      return "Surah matrix";
    case "trajectory":
      return "Projections";
    case "bars":
      return "Leaderboard bars";
    default:
      return "Club";
  }
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function ClubSideNav({
  panel,
  onSelectPanel,
  initialDisplayName,
  onLogout,
  closeOnNavigate,
  onNavigate,
}: {
  panel: MainPanel;
  onSelectPanel: (p: MainPanel) => void;
  initialDisplayName: string;
  onLogout: () => void;
  closeOnNavigate?: boolean;
  onNavigate?: () => void;
}) {
  function pick(p: MainPanel) {
    onSelectPanel(p);
    if (closeOnNavigate) onNavigate?.();
  }

  return (
    <>
      <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3 pt-3" aria-label="Club navigation">
        {NAV.map((item) => {
          const active = panel === item.id;
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => pick(item.id)}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-3.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                active
                  ? "bg-[#ebebeb] text-zinc-900 dark:bg-zinc-800/90 dark:text-zinc-100"
                  : "text-zinc-600 hover:bg-black/[0.06] dark:text-zinc-400 dark:hover:bg-zinc-800/50"
              }`}
            >
              <Icon
                className={`h-5 w-5 shrink-0 ${active ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-500 dark:text-zinc-400"}`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-black/[0.06] p-4 dark:border-zinc-800">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2.5">
          <div
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-zinc-700 dark:text-zinc-200"
            style={{ backgroundColor: avatarBackground(initialDisplayName) }}
          >
            {initialDisplayName.trim().slice(0, 1).toUpperCase() || "?"}
            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-[#f4f4f4] dark:ring-zinc-900" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{initialDisplayName}</p>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="mt-1 text-xs text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:hover:text-zinc-300"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

type MemberBrief = { id: string; display_name: string };

const TRAJECTORY_PALETTE = [
  "#047857",
  "#2563eb",
  "#b45309",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#4f46e5",
  "#65a30d",
  "#ea580c",
  "#0d9488",
  "#c026d3",
  "#ca8a04",
  "#16a34a",
  "#9333ea",
];

function lastRecordedPctUpTo(series: { date: string; pct: number }[], d: string): number | undefined {
  let v: number | undefined;
  for (const p of series) {
    if (p.date <= d) v = p.pct;
    else break;
  }
  return v;
}

function shortLegendName(name: string, max = 9): string {
  const t = name.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

type TrajectoryLineSpec = {
  dataKey: string;
  name: string;
  stroke: string;
  dashed?: boolean;
};

function buildProjectionChart(
  trajs: MemberTrajectory[],
  scope: "you" | "all",
  selfId: string | undefined
): { rows: Record<string, string | number | undefined>[]; lines: TrajectoryLineSpec[] } {
  if (trajs.length === 0) return { rows: [], lines: [] };

  if (scope === "you") {
    const self = selfId ? trajs.find((t) => t.member_id === selfId) : undefined;
    if (!self) return { rows: [], lines: [] };
    const dateSet = new Set<string>();
    for (const p of self.recorded) dateSet.add(p.date);
    for (const p of self.projection) dateSet.add(p.date);
    const dates = [...dateSet].sort((a, b) => a.localeCompare(b));
    const rows = dates.map((date) => {
      const recorded = lastRecordedPctUpTo(self.recorded, date);
      const forecast = self.projection.find((p) => p.date === date)?.pct;
      return {
        date,
        ...(recorded !== undefined ? { recorded } : {}),
        ...(forecast !== undefined ? { forecast } : {}),
      } as Record<string, string | number | undefined>;
    });
    return {
      rows,
      lines: [
        { dataKey: "recorded", name: "Recorded %", stroke: "#047857" },
        { dataKey: "forecast", name: "Projection %", stroke: "#10b981", dashed: true },
      ],
    };
  }

  const trajsSorted = [...trajs].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const sortedIds = trajsSorted.map((t) => t.member_id);
  const dateSet = new Set<string>();
  for (const t of trajs) {
    for (const p of t.recorded) dateSet.add(p.date);
    for (const p of t.projection) dateSet.add(p.date);
  }
  const dates = [...dateSet].sort((a, b) => a.localeCompare(b));
  const rows = dates.map((date) => {
    const row: Record<string, string | number | undefined> = { date };
    for (const t of trajs) {
      const rec = lastRecordedPctUpTo(t.recorded, date);
      if (rec !== undefined) row[`rec_${t.member_id}`] = rec;
      const prj = t.projection.find((p) => p.date === date)?.pct;
      if (prj !== undefined) row[`prj_${t.member_id}`] = prj;
    }
    return row;
  });

  const lines: TrajectoryLineSpec[] = [];
  for (const t of trajsSorted) {
    const stroke =
      TRAJECTORY_PALETTE[sortedIds.indexOf(t.member_id) % TRAJECTORY_PALETTE.length] ?? "#047857";
    const base = shortLegendName(t.display_name);
    lines.push(
      { dataKey: `rec_${t.member_id}`, name: `${base} · rec`, stroke },
      { dataKey: `prj_${t.member_id}`, name: `${base} · proj`, stroke, dashed: true }
    );
  }
  return { rows, lines };
}

function ProjectionsScopeToggle({
  value,
  onChange,
  youDisabled,
}: {
  value: "you" | "all";
  onChange: (v: "you" | "all") => void;
  youDisabled?: boolean;
}) {
  return (
    <div
      className="flex shrink-0 items-center rounded-full border border-zinc-200/90 bg-zinc-100/80 p-0.5 dark:border-zinc-600 dark:bg-zinc-800/60"
      role="group"
      aria-label="Projection scope"
    >
      <button
        type="button"
        aria-pressed={value === "you"}
        disabled={youDisabled}
        onClick={() => onChange("you")}
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition sm:px-3 sm:text-sm ${
          value === "you"
            ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
            : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        } disabled:cursor-not-allowed disabled:opacity-45`}
      >
        You
      </button>
      <button
        type="button"
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
        className={`rounded-full px-2.5 py-1 text-xs font-medium transition sm:px-3 sm:text-sm ${
          value === "all"
            ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
            : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        }`}
      >
        All
      </button>
    </div>
  );
}

function IconUserPlus({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

/** Overlapping avatars + invite (copy link), Chat / Slack style */
function GroupMemberStack({
  members,
  onInviteClick,
  inviteCopied,
  variant = "default",
  className = "",
}: {
  members: MemberBrief[];
  onInviteClick: () => void;
  inviteCopied: boolean;
  variant?: "default" | "toolbar";
  className?: string;
}) {
  const toolbar = variant === "toolbar";
  const overlap = toolbar ? "-ml-2" : "-ml-2.5";
  const faceClass = toolbar
    ? "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-zinc-800 ring-2 ring-white dark:text-zinc-100 dark:ring-zinc-950"
    : "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-zinc-800 ring-2 ring-white dark:text-zinc-100 dark:ring-zinc-950";
  const overflowClass = toolbar
    ? "flex h-9 w-9 items-center justify-center rounded-full bg-zinc-300 text-[10px] font-bold tabular-nums text-zinc-800 ring-2 ring-white dark:bg-zinc-600 dark:text-zinc-100 dark:ring-zinc-950"
    : "flex h-9 w-9 items-center justify-center rounded-full bg-zinc-300 text-[10px] font-bold tabular-nums text-zinc-800 ring-2 ring-white dark:bg-zinc-600 dark:text-zinc-100 dark:ring-zinc-950";
  const inviteBtnClass = toolbar
    ? "flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white ring-2 ring-white transition hover:bg-violet-700 dark:ring-zinc-950 dark:hover:bg-violet-500"
    : "flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white ring-2 ring-white transition hover:bg-violet-700 dark:ring-zinc-950 dark:hover:bg-violet-500";
  const iconClass = "h-[18px] w-[18px]";

  const visibleSlots = 8;
  let faces: MemberBrief[];
  let overflow = 0;
  if (members.length <= visibleSlots) {
    faces = members;
  } else {
    overflow = members.length - (visibleSlots - 1);
    faces = members.slice(0, visibleSlots - 1);
  }

  const items: ReactNode[] = [];
  let z = 1;
  faces.forEach((m, i) => {
    const initial = m.display_name.trim().slice(0, 1).toUpperCase() || "?";
    items.push(
      <li
        key={m.id}
        className={i === 0 ? "relative" : `relative ${overlap}`}
        style={{ zIndex: z++ }}
        title={m.display_name}
      >
        <div className={faceClass} style={{ backgroundColor: avatarBackground(m.display_name) }}>
          {initial}
        </div>
      </li>
    );
  });
  if (overflow > 0) {
    items.push(
      <li
        key="overflow"
        className={items.length === 0 ? "relative" : `relative ${overlap}`}
        style={{ zIndex: z++ }}
        title={`${overflow} more ${overflow === 1 ? "member" : "members"}`}
      >
        <div className={overflowClass}>+{overflow}</div>
      </li>
    );
  }
  items.push(
    <li
      key="invite"
      className={items.length === 0 ? "relative" : `relative ${overlap}`}
      style={{ zIndex: z }}
    >
      <button
        type="button"
        onClick={onInviteClick}
        title={
          inviteCopied
            ? "Invite link copied"
            : "Copy invite link — friends open it and enter their name to join"
        }
        className={inviteBtnClass}
      >
        <IconUserPlus className={iconClass} />
      </button>
    </li>
  );

  return (
    <div
      className={`flex min-w-0 items-center ${toolbar ? "shrink-0 justify-end gap-2" : "flex-wrap gap-3"} ${className}`}
    >
      <span className="sr-only">
        {members.length} {members.length === 1 ? "person" : "people"} in this memorisation group
      </span>
      <ul className="flex flex-row items-center" role="list">
        {items}
      </ul>
      {inviteCopied && !toolbar ? (
        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Invite link copied</span>
      ) : null}
      {inviteCopied && toolbar ? (
        <span className="sr-only" role="status">
          Invite link copied
        </span>
      ) : null}
    </div>
  );
}

export function ClubRoom({ memberId, initialDisplayName }: { memberId: string; initialDisplayName: string }) {
  const [panel, setPanel] = useState<MainPanel>("chat");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendHint, setSendHint] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [progress, setProgress] = useState<ProgressReport | null>(null);
  const [groupMembers, setGroupMembers] = useState<MemberBrief[]>([]);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [projectionScope, setProjectionScope] = useState<"you" | "all">("you");
  const listRef = useRef<HTMLDivElement>(null);
  const inviteCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadMessages = useCallback(async () => {
    const res = await fetch("/api/messages");
    if (!res.ok) return;
    const data = (await res.json()) as { messages?: MessageRow[] };
    setMessages(data.messages ?? []);
  }, []);

  const loadProgress = useCallback(async () => {
    const res = await fetch("/api/progress");
    if (!res.ok) return;
    const data = (await res.json()) as Partial<ProgressReport>;
    setProgress({
      leaderboard: data.leaderboard ?? [],
      clubSeries: data.clubSeries ?? [],
      projection: data.projection ?? [],
      memberTrajectories: data.memberTrajectories ?? [],
      dashboard: data.dashboard ?? [],
      heatmap: data.heatmap ?? null,
    });
  }, []);

  const loadMembers = useCallback(async () => {
    const res = await fetch("/api/members");
    if (!res.ok) return;
    const data = (await res.json()) as { members?: MemberBrief[] };
    setGroupMembers(data.members ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMessages(true);
      await Promise.all([loadMessages(), loadProgress(), loadMembers()]);
      if (!cancelled) setLoadingMessages(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMessages, loadProgress, loadMembers]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel("club-room")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "progress_events" },
        () => {
          void loadProgress();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "member_progress" },
        () => {
          void loadProgress();
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "members" },
        () => {
          void loadMembers();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "members" },
        () => {
          void loadProgress();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadProgress, loadMembers]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, panel]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileNavOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    function onChange() {
      if (mq.matches) setMobileNavOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileNavOpen]);

  const projectionChart = useMemo(
    () =>
      buildProjectionChart(
        progress?.memberTrajectories ?? [],
        projectionScope,
        memberId ?? undefined
      ),
    [progress?.memberTrajectories, projectionScope, memberId]
  );

  const trajectoryYouAvailable = useMemo(() => {
    if (!memberId || !progress?.memberTrajectories?.length) return false;
    return progress.memberTrajectories.some((t) => t.member_id === memberId);
  }, [memberId, progress?.memberTrajectories]);

  useEffect(() => {
    if (!trajectoryYouAvailable && projectionScope === "you") setProjectionScope("all");
  }, [trajectoryYouAvailable, projectionScope]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  function copyInviteLink() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/` : "";
    void navigator.clipboard.writeText(url).then(() => {
      if (inviteCopyTimerRef.current) clearTimeout(inviteCopyTimerRef.current);
      setInviteCopied(true);
      inviteCopyTimerRef.current = setTimeout(() => setInviteCopied(false), 2200);
    });
  }

  useEffect(() => {
    return () => {
      if (inviteCopyTimerRef.current) clearTimeout(inviteCopyTimerRef.current);
    };
  }, []);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    setSendHint(null);
    const body = draft.trim();
    if (!body) return;
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: MessageRow;
    };
    if (!res.ok) {
      setSendError(data.error ?? "Could not send.");
      return;
    }
    if (data.message) {
      setMessages((prev) => (prev.some((m) => m.id === data.message!.id) ? prev : [...prev, data.message!]));
    }
    setDraft("");
  }

  function renderMessageBubble(m: MessageRow) {
    const mine = m.member_id === memberId;
    const label = mine ? "You" : m.display_name;
    const initial = (mine ? initialDisplayName : m.display_name).trim().slice(0, 1).toUpperCase() || "?";
    const bg = avatarBackground(mine ? initialDisplayName : m.display_name);
    const time = formatTime(m.created_at);

    const bubble = (
      <div className="inline-block max-w-[min(560px,calc(100vw-2rem))] rounded-2xl bg-[#F3F4F6] px-4 py-2.5 text-sm leading-relaxed text-zinc-900 sm:max-w-[min(560px,calc(100vw-220px-4rem))] dark:bg-zinc-800 dark:text-zinc-100">
        <p className="whitespace-pre-wrap">{formatMessageBody(m.body)}</p>
      </div>
    );

    const avatar = (
      <div className="relative h-10 w-10 shrink-0">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-zinc-700 dark:text-zinc-200"
          style={{ backgroundColor: bg }}
        >
          {initial}
        </div>
        <span
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-950"
          aria-hidden
        />
      </div>
    );

    if (mine) {
      return (
        <div className="flex w-full justify-end">
          <div className="max-w-[min(640px,calc(100%-0.5rem))]">
            {/* Indent so “You · time” lines up with the bubble’s right edge (avatar sits past that). */}
            <div className="mb-1.5 pr-[3.25rem] text-right text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
              <span className="text-zinc-400"> · </span>
              <time className="tabular-nums text-zinc-400 dark:text-zinc-500" dateTime={m.created_at}>
                {time}
              </time>
            </div>
            <div className="flex flex-row-reverse items-end justify-end gap-3">
              {avatar}
              <div className="min-w-0 max-w-[min(560px,calc(100vw-2rem))] sm:max-w-[min(560px,calc(100vw-220px-4rem))]">
                {bubble}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full max-w-[min(640px,100%)]">
        {/* Spacer matches avatar width so name/time line up with the bubble, not the avatar */}
        <div className="mb-1.5 flex gap-3">
          <div className="w-10 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
            <span className="font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
            <span className="text-zinc-400">·</span>
            <time className="tabular-nums text-zinc-400 dark:text-zinc-500" dateTime={m.created_at}>
              {time}
            </time>
          </div>
        </div>
        <div className="flex flex-row items-end gap-3">
          {avatar}
          <div className="min-w-0 flex-1">{bubble}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#ececec] dark:bg-zinc-950">
      {/* One continuous rule under brand + current view */}
      <header className="relative z-30 flex shrink-0 border-b border-zinc-200 dark:border-zinc-800">
        <div className="hidden h-14 w-[220px] shrink-0 items-center border-r border-black/[0.06] bg-[#f4f4f4] px-3 dark:border-zinc-800 dark:bg-zinc-900 lg:flex">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 sm:text-[13px]">
            Alif Laam Meem
          </p>
        </div>
        <div className="flex h-14 min-w-0 flex-1 items-center justify-between gap-2 bg-white px-3 sm:gap-3 sm:px-5 dark:bg-zinc-950">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={() => setMobileNavOpen((o) => !o)}
              className="shrink-0 rounded-lg p-2 text-zinc-600 outline-none transition hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950 lg:hidden"
              aria-expanded={mobileNavOpen}
              aria-controls="club-mobile-nav"
            >
              <IconMenu className="h-6 w-6" />
              <span className="sr-only">{mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}</span>
            </button>
            <div className="flex min-w-0 items-center gap-2 text-base font-semibold text-zinc-800 dark:text-zinc-200 sm:gap-2.5 sm:text-lg">
              <span className="truncate">{panelTitle(panel)}</span>
              {panel === "heatmap" ? <SurahMatrixHelpButton /> : null}
            </div>
          </div>
          {panel === "heatmap" ? (
            <div className="flex min-w-0 max-w-[min(52vw,13.5rem)] shrink-0 items-center justify-end pl-1 sm:max-w-none sm:pl-2">
              <MatrixTrackLegend className="text-right leading-tight" />
            </div>
          ) : panel === "trajectory" ? (
            <ProjectionsScopeToggle
              value={projectionScope}
              onChange={setProjectionScope}
              youDisabled={!trajectoryYouAvailable}
            />
          ) : (
            <GroupMemberStack
              variant="toolbar"
              members={groupMembers}
              onInviteClick={copyInviteLink}
              inviteCopied={inviteCopied}
            />
          )}
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        <aside
          className="hidden w-[220px] shrink-0 flex-col border-r border-black/[0.06] bg-[#f4f4f4] dark:border-zinc-800 dark:bg-zinc-900 lg:flex"
          aria-label="Club navigation"
        >
          <ClubSideNav
            panel={panel}
            onSelectPanel={setPanel}
            initialDisplayName={initialDisplayName}
            onLogout={logout}
          />
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-zinc-950">
        <div className="flex min-h-0 flex-1 flex-col">
          {panel === "chat" ? (
            <>
              <div
                ref={listRef}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white dark:bg-zinc-950"
                aria-live="polite"
              >
                <div className="flex flex-col items-start gap-6 px-5 py-8">
                  {loadingMessages ? (
                    <p className="text-sm text-zinc-500">Loading messages…</p>
                  ) : messages.length === 0 ? (
                    <p className="text-sm text-zinc-500">No messages yet. Say salam below.</p>
                  ) : (
                    messages.map((m) => (
                      <article key={m.id} className="w-full">
                        {renderMessageBubble(m)}
                      </article>
                    ))
                  )}
                </div>
              </div>
              <div className="shrink-0 border-t border-zinc-200/80 bg-white p-4 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)] dark:border-zinc-800 dark:bg-zinc-900">
                {sendError ? (
                  <p className="mb-2 text-xs text-red-600 dark:text-red-400" role="alert">
                    {sendError}
                  </p>
                ) : null}
                {sendHint ? (
                  <p className="mb-2 text-xs text-emerald-700 dark:text-emerald-400">{sendHint}</p>
                ) : null}
                <form
                  onSubmit={(e) => void sendMessage(e)}
                  className="flex flex-row items-center gap-1.5 rounded-2xl border border-zinc-200 bg-zinc-50/80 py-1.5 pl-2 pr-1.5 dark:border-zinc-700 dark:bg-zinc-800/50"
                >
                  <StructuredProgressPicker
                    onPosted={() => {
                      void loadMessages();
                      void loadProgress();
                      setSendHint("Progress posted — it appears in chat and Current focus.");
                    }}
                    onError={(msg) => setSendError(msg)}
                  />
                  <div
                    className="hidden h-6 w-px shrink-0 bg-zinc-200 sm:block dark:bg-zinc-600"
                    aria-hidden
                  />
                  <label className="sr-only" htmlFor="club-message-input">
                    Message
                  </label>
                  <input
                    id="club-message-input"
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    maxLength={4000}
                    placeholder="Write a message…"
                    className="min-h-10 min-w-0 flex-1 border-0 bg-transparent py-2 pl-0.5 text-sm leading-normal text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  >
                    Send
                  </button>
                </form>
              </div>
            </>
          ) : null}

          {panel === "focus" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white p-3 dark:bg-zinc-950 lg:p-6">
              <div className="mx-auto hidden w-full max-w-5xl shrink-0 lg:block">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Memorising</span>,{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">revising</span>, and{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">reciting</span> are tracked separately by{" "}
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">surah</span> (each column lists the surahs on that
                  track). <span className="font-medium text-zinc-600 dark:text-zinc-300">% Quran</span> reflects surahs you have
                  memorised (from memorising updates and the Surah matrix).
                </p>
              </div>
              <div className="mx-auto mt-0 w-full max-w-5xl min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/40 lg:mt-6 lg:rounded-xl">
                <table className="w-full min-w-[28rem] text-left text-xs lg:min-w-0 lg:text-sm">
                  <thead className="sticky top-0 bg-zinc-100/95 text-[10px] font-medium uppercase tracking-wide text-zinc-500 backdrop-blur-sm dark:bg-zinc-800/95 dark:text-zinc-400 lg:text-xs">
                    <tr>
                      <th className="px-2 py-2 lg:px-4 lg:py-3">Name</th>
                      <th className="px-2 py-2 lg:px-4 lg:py-3">Revising</th>
                      <th className="px-2 py-2 lg:px-4 lg:py-3">Memorising</th>
                      <th className="px-2 py-2 lg:px-4 lg:py-3">Reciting</th>
                      <th className="px-2 py-2 text-right lg:px-4 lg:py-3">% Quran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!progress || progress.dashboard.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-2 py-8 text-center text-zinc-500 lg:px-4 lg:py-10">
                          No members yet.
                        </td>
                      </tr>
                    ) : (
                      progress.dashboard.map((row) => (
                        <tr key={row.member_id} className="border-t border-zinc-200 dark:border-zinc-800">
                          <td className="px-2 py-1.5 align-top font-medium text-zinc-900 dark:text-zinc-100 lg:px-4 lg:py-3 lg:align-middle">
                            {row.display_name}
                          </td>
                          <td className="px-2 py-1.5 align-top text-zinc-600 dark:text-zinc-400 lg:px-4 lg:py-3">
                            <FocusTrackSurahList entries={row.revising} />
                          </td>
                          <td className="px-2 py-1.5 align-top text-zinc-600 dark:text-zinc-400 lg:px-4 lg:py-3">
                            <FocusTrackSurahList entries={row.memorising} />
                          </td>
                          <td className="px-2 py-1.5 align-top text-zinc-600 dark:text-zinc-400 lg:px-4 lg:py-3">
                            <FocusTrackSurahList entries={row.reciting} />
                          </td>
                          <td className="px-2 py-1.5 text-right align-top tabular-nums text-zinc-700 dark:text-zinc-300 lg:px-4 lg:py-3 lg:align-middle">
                            {row.pct_quran}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {panel === "heatmap" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <SurahHeatmapPanel
                heatmap={progress?.heatmap ?? undefined}
                currentMemberId={memberId}
                myPctQuran={progress?.dashboard.find((r) => r.member_id === memberId)?.pct_quran ?? null}
                onSaved={() => void loadProgress()}
              />
            </div>
          ) : null}

          {panel === "trajectory" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white p-6 dark:bg-zinc-950">
              <div className="mx-auto hidden w-full max-w-3xl shrink-0 lg:block">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">You</span> shows your % Quran from memorising
                  posts; <span className="font-medium text-zinc-600 dark:text-zinc-300">All</span> overlays everyone in
                  different colours. Dashed segments are illustrative projections from recent trend.
                </p>
              </div>
              <div className="mx-auto mt-0 w-full max-w-3xl min-h-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/30 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 lg:mt-6">
                {projectionChart.rows.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {projectionScope === "you" && trajectoryYouAvailable === false
                      ? "Post memorising progress to see your projection, or choose All."
                      : "Not enough data for a chart yet."}
                  </p>
                ) : (
                  <div className="h-full w-full min-h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={projectionChart.rows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} className="text-zinc-500" />
                        <YAxis domain={[0, 100]} width={32} tick={{ fontSize: 9 }} className="text-zinc-500" />
                        <Tooltip
                          formatter={(v) => [`${typeof v === "number" ? v : Number(v) || 0}%`, ""]}
                          contentStyle={{
                            borderRadius: "0.75rem",
                            border: "1px solid rgb(228 228 231)",
                            fontSize: "11px",
                          }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: projectionScope === "all" ? "10px" : "12px" }}
                          verticalAlign="bottom"
                          height={projectionScope === "all" ? 56 : 36}
                        />
                        {projectionChart.lines.map((ln) => (
                          <Line
                            key={ln.dataKey}
                            type="monotone"
                            dataKey={ln.dataKey}
                            name={ln.name}
                            stroke={ln.stroke}
                            strokeWidth={projectionScope === "all" ? 1.75 : 2}
                            strokeDasharray={ln.dashed ? "5 4" : undefined}
                            dot={
                              ln.dashed
                                ? false
                                : projectionScope === "you"
                                  ? { r: 3 }
                                  : { r: 2 }
                            }
                            connectNulls={!ln.dashed}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {panel === "bars" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white p-6 dark:bg-zinc-950">
              <div className="mx-auto w-full max-w-3xl shrink-0">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  % of the Quran memorised (whole surahs you’ve logged under Memorising, any order).
                </p>
              </div>
              <div className="mx-auto mt-6 w-full max-w-3xl min-h-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/30 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                {!progress || progress.leaderboard.length === 0 ? (
                  <p className="text-sm text-zinc-500">No bars yet.</p>
                ) : (
                  <div className="h-full w-full min-h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={progress.leaderboard.map((r) => ({
                          name: r.display_name.length > 14 ? `${r.display_name.slice(0, 13)}…` : r.display_name,
                          pct: r.pct_quran,
                        }))}
                        layout="vertical"
                        margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
                        <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v) => [`${typeof v === "number" ? v : Number(v) || 0}%`, "% Quran"]} />
                        <Bar dataKey="pct" name="% Quran" fill="#047857" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
        </div>
      </div>

      {/* Mobile nav drawer + backdrop (lg+ uses persistent sidebar only) */}
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={mobileNavOpen ? 0 : -1}
        aria-hidden={!mobileNavOpen}
        className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 lg:hidden ${
          mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileNavOpen(false)}
      />
      <aside
        id="club-mobile-nav"
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(280px,88vw)] flex-col border-r border-black/[0.06] bg-[#f4f4f4] shadow-[4px_0_24px_-4px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-[4px_0_24px_-4px_rgba(0,0,0,0.5)] lg:hidden ${
          mobileNavOpen ? "translate-x-0" : "pointer-events-none -translate-x-full"
        }`}
        aria-hidden={!mobileNavOpen}
        aria-label="Club navigation"
      >
        <div className="shrink-0 border-b border-black/[0.06] px-3 py-4 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Alif Laam Meem
          </p>
        </div>
        <ClubSideNav
          panel={panel}
          onSelectPanel={setPanel}
          initialDisplayName={initialDisplayName}
          onLogout={logout}
          closeOnNavigate
          onNavigate={() => setMobileNavOpen(false)}
        />
      </aside>
    </div>
  );
}
