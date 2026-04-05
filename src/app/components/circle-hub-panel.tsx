"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { MemberTrajectory } from "@/lib/progress-aggregate";
import { buildFiveMonthMemorisationChart } from "@/lib/projection-chart";
import { StructuredProgressPicker } from "@/app/components/structured-progress-picker";
import { StatsLeaderboardStrip, StatsMemorisationOverTimeStrip } from "@/app/components/stats-robinhood";
import { SurahHeatmapPanel, type HeatmapPayload } from "@/app/components/surah-heatmap-panel";
import type { MyCircleSummary } from "@/app/components/my-circles-panel";

type MessageRow = {
  id: string;
  member_id: string | null;
  display_name: string;
  body: string;
  created_at: string;
};

type DashRow = {
  member_id: string;
  display_name: string;
  revising: { name: string }[];
  memorising: { name: string }[];
  reciting: { name: string }[];
  pct_quran: number;
};

type CircleAgg = {
  leaderboard: { member_id: string; display_name: string; pct_quran: number }[];
  clubSeries: { date: string; clubPct: number }[];
  projection: { date: string; clubPct: number; projected: true }[];
  memberTrajectories: MemberTrajectory[];
  dashboard: DashRow[];
  heatmap: HeatmapPayload;
};

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

type CircleTab = "chat" | "stats" | "table" | "matrix";

const TAB_LABELS: { id: CircleTab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "stats", label: "Stats" },
  { id: "table", label: "Table" },
  { id: "matrix", label: "Surah matrix" },
];

export function CircleHubPanel({
  circle,
  memberId,
  initialDisplayName,
  memorizedSurahIds,
  onProgressDataUpdated,
}: {
  circle: MyCircleSummary;
  memberId: string;
  initialDisplayName: string;
  memorizedSurahIds: number[];
  onProgressDataUpdated?: () => void;
}) {
  const [tab, setTab] = useState<CircleTab>("chat");
  const [agg, setAgg] = useState<CircleAgg | null>(null);
  const [aggLoading, setAggLoading] = useState(true);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendHint, setSendHint] = useState<string | null>(null);
  const [msgLoading, setMsgLoading] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const loadAgg = useCallback(async () => {
    setAggLoading(true);
    try {
      const res = await fetch(`/api/circles/${encodeURIComponent(circle.id)}/progress`);
      const data = (await res.json()) as CircleAgg & { error?: string };
      if (!res.ok) {
        setAgg(null);
        return;
      }
      setAgg(data);
    } catch {
      setAgg(null);
    } finally {
      setAggLoading(false);
    }
  }, [circle.id]);

  const loadMessages = useCallback(async () => {
    setMsgLoading(true);
    try {
      const res = await fetch(`/api/messages?circleId=${encodeURIComponent(circle.id)}`);
      if (!res.ok) {
        setMessages([]);
        return;
      }
      const data = (await res.json()) as { messages?: MessageRow[] };
      setMessages(data.messages ?? []);
    } catch {
      setMessages([]);
    } finally {
      setMsgLoading(false);
    }
  }, [circle.id]);

  useEffect(() => {
    void loadAgg();
  }, [loadAgg]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`circle-msgs-${circle.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `circle_id=eq.${circle.id}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [circle.id]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, tab]);

  const fiveMonthChart = useMemo(() => {
    return buildFiveMonthMemorisationChart(agg?.memberTrajectories ?? [], "all", memberId);
  }, [agg?.memberTrajectories, memberId]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    setSendError(null);
    setSendHint(null);
    const body = draft.trim();
    if (!body) return;
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, circleId: circle.id }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: MessageRow };
    if (!res.ok) {
      setSendError(data.error ?? "Could not send.");
      return;
    }
    if (data.message) {
      setMessages((prev) => (prev.some((m) => m.id === data.message!.id) ? prev : [...prev, data.message!]));
    }
    setDraft("");
  }

  function renderBubble(m: MessageRow) {
    const mine = m.member_id === memberId;
    const label = mine ? "You" : m.display_name;
    const initial = (mine ? initialDisplayName : m.display_name).trim().slice(0, 1).toUpperCase() || "?";
    const bg = avatarBackground(mine ? initialDisplayName : m.display_name);
    const time = formatTime(m.created_at);
    const bubble = (
      <div className="inline-block max-w-[min(560px,calc(100vw-2rem))] rounded-2xl bg-[#F3F4F6] px-4 py-2.5 text-sm leading-relaxed text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
        <p className="whitespace-pre-wrap">{formatMessageBody(m.body)}</p>
      </div>
    );
    const avatar = (
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-zinc-700 dark:text-zinc-200"
        style={{ backgroundColor: bg }}
      >
        {initial}
      </div>
    );

    if (mine) {
      return (
        <div className="flex w-full justify-end">
          <div className="max-w-[min(640px,calc(100%-0.5rem))]">
            <div className="mb-1.5 pr-[3.25rem] text-right text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className="font-medium">{label}</span>
              <span className="text-zinc-400"> · </span>
              <time dateTime={m.created_at}>{time}</time>
            </div>
            <div className="flex flex-row-reverse items-end gap-3">
              {avatar}
              <div className="min-w-0">{bubble}</div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full max-w-[min(640px,100%)]">
        <div className="mb-1.5 flex gap-3">
          <div className="w-10 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="font-medium">{label}</span>
            <span>·</span>
            <time dateTime={m.created_at}>{time}</time>
          </div>
        </div>
        <div className="flex items-end gap-3">
          {avatar}
          <div className="min-w-0 flex-1">{bubble}</div>
        </div>
      </div>
    );
  }

  const myPct = agg?.dashboard.find((r) => r.member_id === memberId)?.pct_quran ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
      <div className="w-full shrink-0 bg-white px-2 pb-2 pt-2 dark:bg-zinc-950 sm:px-3">
        <div
          className="flex w-full gap-2 sm:gap-2.5"
          role="tablist"
          aria-label="Group views"
        >
          {TAB_LABELS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`min-h-[2.75rem] min-w-0 flex-1 rounded-full px-2 py-2 text-center text-[13px] font-semibold leading-tight transition sm:min-h-[3.25rem] sm:px-3 sm:text-base ${
                  active
                    ? "bg-transparent text-emerald-800 dark:text-emerald-400"
                    : "bg-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "chat" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-6 dark:bg-zinc-950">
            <div className="mx-auto flex max-w-2xl flex-col gap-6">
              {msgLoading ? (
                <p className="text-sm text-zinc-500">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="text-sm text-zinc-500">No messages yet. Say salam below.</p>
              ) : (
                messages.map((m) => <article key={m.id}>{renderBubble(m)}</article>)
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-zinc-200 p-4 dark:border-zinc-800">
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
              className="mx-auto flex max-w-2xl flex-row items-center gap-1.5 rounded-2xl border border-zinc-200 bg-zinc-50/80 py-1.5 pl-2 pr-1.5 dark:border-zinc-700 dark:bg-zinc-800/50"
            >
              <StructuredProgressPicker
                memorizedSurahIds={memorizedSurahIds}
                onPosted={() => {
                  void loadMessages();
                  void loadAgg();
                  onProgressDataUpdated?.();
                  setSendHint("Progress posted — visible in Chat and on Progress.");
                }}
                onError={(msg) => setSendError(msg)}
              />
              <div
                className="hidden h-6 w-px shrink-0 bg-zinc-200 sm:block dark:bg-zinc-600"
                aria-hidden
              />
              <label className="sr-only" htmlFor="circle-chat-input">
                Message
              </label>
              <input
                id="circle-chat-input"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={4000}
                placeholder="Write a message…"
                className="min-h-10 min-w-0 flex-1 border-0 bg-transparent px-2 text-sm text-zinc-900 outline-none dark:text-zinc-100"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-emerald-600"
              >
                Send
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {tab === "stats" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 dark:bg-zinc-950 sm:px-6">
          {aggLoading ? (
            <p className="text-sm text-zinc-500">Loading stats…</p>
          ) : !agg ? (
            <p className="text-sm text-zinc-500">Could not load stats.</p>
          ) : (
            <div className="mx-auto max-w-4xl space-y-8">
              <section>
                <div className="px-4 sm:px-0">
                  <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Memorisation over time</h2>
                </div>
                <div className="mt-4">
                  <StatsMemorisationOverTimeStrip
                    chart={fiveMonthChart}
                    projectionScope="all"
                    trajectoryYouAvailable
                    showEndpointInitials
                  />
                </div>
              </section>
              <section>
                <h2 className="px-4 text-base font-semibold text-zinc-900 dark:text-zinc-100 sm:px-0">Leaderboard</h2>
                <p className="mt-1 px-4 text-sm text-zinc-500 dark:text-zinc-400 sm:px-0">
                  % Quran memorised (whole surahs).
                </p>
                <div className="mt-4">
                  <StatsLeaderboardStrip
                    rows={agg.leaderboard.map((r) => ({
                      name: r.display_name.length > 14 ? `${r.display_name.slice(0, 13)}…` : r.display_name,
                      pct: r.pct_quran,
                    }))}
                  />
                </div>
              </section>
            </div>
          )}
        </div>
      ) : null}

      {tab === "table" ? (
        <div className="min-h-0 flex-1 overflow-auto p-3 dark:bg-zinc-950 lg:p-6">
          {aggLoading || !agg ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : (
            <div className="mx-auto w-full max-w-5xl overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[36rem] text-left text-xs lg:text-sm">
                <thead className="sticky top-0 bg-zinc-100/95 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/95 dark:text-zinc-400">
                  <tr>
                    <th className="px-2 py-2 lg:px-4 lg:py-3">Name</th>
                    <th className="px-2 py-2 lg:px-4 lg:py-3">Revising</th>
                    <th className="px-2 py-2 lg:px-4 lg:py-3">Memorising</th>
                    <th className="px-2 py-2 lg:px-4 lg:py-3">Reciting</th>
                    <th className="px-2 py-2 text-right lg:px-4 lg:py-3">% Quran</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.dashboard.map((row) => (
                    <tr key={row.member_id} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-2 py-2 font-medium text-zinc-900 dark:text-zinc-100 lg:px-4 lg:py-3">
                        {row.display_name}
                      </td>
                      <td className="px-2 py-2 text-zinc-600 dark:text-zinc-300 lg:px-4 lg:py-3">
                        {row.revising.map((e) => e.name).join(", ") || "—"}
                      </td>
                      <td className="px-2 py-2 text-zinc-600 dark:text-zinc-300 lg:px-4 lg:py-3">
                        {row.memorising.map((e) => e.name).join(", ") || "—"}
                      </td>
                      <td className="px-2 py-2 text-zinc-600 dark:text-zinc-300 lg:px-4 lg:py-3">
                        {row.reciting.map((e) => e.name).join(", ") || "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300 lg:px-4 lg:py-3">
                        {row.pct_quran}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {tab === "matrix" ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden dark:bg-zinc-950">
          {aggLoading || !agg ? (
            <p className="p-4 text-sm text-zinc-500">Loading…</p>
          ) : (
            <SurahHeatmapPanel
              heatmap={agg.heatmap}
              currentMemberId={memberId}
              myPctQuran={myPct}
              readOnly
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
