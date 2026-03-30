"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

type MessageRow = {
  id: string;
  member_id: string | null;
  display_name: string;
  body: string;
  created_at: string;
};

type DashboardRow = {
  member_id: string;
  display_name: string;
  activity: "memorizing" | "revising" | null;
  active_juz: number | null;
  pct_active_juz: number | null;
  max_juz_completed: number;
};

type ProgressReport = {
  leaderboard: { member_id: string; display_name: string; max_juz: number }[];
  focus: { member_id: string; display_name: string; juz: number; event_kind: "memorizing" | "revising" }[];
  clubSeries: { date: string; clubMaxJuz: number }[];
  projection: { date: string; clubMaxJuz: number; projected: true }[];
  dashboard: DashboardRow[];
};

type MainPanel = "chat" | "focus" | "trajectory" | "bars";

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
    id: "trajectory",
    label: "Trajectory",
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
    case "trajectory":
      return "Club trajectory";
    case "bars":
      return "Leaderboard bars";
    default:
      return "Club";
  }
}

type MemberBrief = { id: string; display_name: string };

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
    ? "flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-zinc-800 ring-2 ring-white dark:text-zinc-100 dark:ring-zinc-950"
    : "flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-zinc-800 ring-2 ring-white dark:text-zinc-100 dark:ring-zinc-950";
  const overflowClass = toolbar
    ? "flex h-8 w-8 items-center justify-center rounded-full bg-zinc-300 text-[9px] font-bold tabular-nums text-zinc-800 ring-2 ring-white dark:bg-zinc-600 dark:text-zinc-100 dark:ring-zinc-950"
    : "flex h-9 w-9 items-center justify-center rounded-full bg-zinc-300 text-[10px] font-bold tabular-nums text-zinc-800 ring-2 ring-white dark:bg-zinc-600 dark:text-zinc-100 dark:ring-zinc-950";
  const inviteBtnClass = toolbar
    ? "flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white ring-2 ring-white transition hover:bg-violet-700 dark:ring-zinc-950 dark:hover:bg-violet-500"
    : "flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white ring-2 ring-white transition hover:bg-violet-700 dark:ring-zinc-950 dark:hover:bg-violet-500";
  const iconClass = toolbar ? "h-4 w-4" : "h-[18px] w-[18px]";

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
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendHint, setSendHint] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [progress, setProgress] = useState<ProgressReport | null>(null);
  const [groupMembers, setGroupMembers] = useState<MemberBrief[]>([]);
  const [inviteCopied, setInviteCopied] = useState(false);
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
    const data = (await res.json()) as ProgressReport;
    setProgress({
      ...data,
      focus: data.focus ?? [],
      dashboard: data.dashboard ?? [],
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

  const chartRows = useMemo(() => {
    if (!progress) return [];
    const map = new Map<string, { date: string; recorded?: number; forecast?: number }>();
    for (const p of progress.clubSeries) {
      map.set(p.date, { date: p.date, recorded: p.clubMaxJuz });
    }
    for (const p of progress.projection) {
      const existing = map.get(p.date) ?? { date: p.date };
      existing.forecast = p.clubMaxJuz;
      map.set(p.date, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [progress]);

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
      <div className="inline-block max-w-[min(560px,calc(100vw-220px-4rem))] rounded-2xl bg-[#F3F4F6] px-4 py-2.5 text-sm leading-relaxed text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
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
      <header className="flex shrink-0 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex h-11 w-[220px] shrink-0 items-center border-r border-black/[0.06] bg-[#f4f4f4] px-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Alif Laam Meem
          </p>
        </div>
        <div className="flex h-11 min-w-0 flex-1 items-center justify-between gap-3 bg-white px-3 sm:px-4 dark:bg-zinc-950">
          <div className="flex min-w-0 items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
            <span className="truncate font-medium">{panelTitle(panel)}</span>
            <span className="shrink-0 text-zinc-400" aria-hidden>
              ▾
            </span>
          </div>
          <GroupMemberStack
            variant="toolbar"
            members={groupMembers}
            onInviteClick={copyInviteLink}
            inviteCopied={inviteCopied}
          />
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1">
        <aside
          className="flex w-[220px] shrink-0 flex-col border-r border-black/[0.06] bg-[#f4f4f4] dark:border-zinc-800 dark:bg-zinc-900"
          aria-label="Club navigation"
        >
          <nav className="flex flex-col gap-0.5 px-2 pb-2 pt-2">
          {NAV.map((item) => {
            const active = panel === item.id;
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setPanel(item.id)}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[#ebebeb] text-zinc-900 dark:bg-zinc-800/90 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-black/[0.06] dark:text-zinc-400 dark:hover:bg-zinc-800/50"
                }`}
              >
                <Icon
                  className={`shrink-0 ${active ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-500 dark:text-zinc-400"}`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-black/[0.06] p-3 dark:border-zinc-800">
          <div className="flex items-center gap-2 rounded-lg px-2 py-2">
            <div
              className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-zinc-700 dark:text-zinc-200"
              style={{ backgroundColor: avatarBackground(initialDisplayName) }}
            >
              {initialDisplayName.trim().slice(0, 1).toUpperCase() || "?"}
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-[#f4f4f4] dark:ring-zinc-900" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">{initialDisplayName}</p>
              <button
                type="button"
                onClick={() => void logout()}
                className="mt-0.5 text-[11px] text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:hover:text-zinc-300"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white dark:bg-zinc-950">
        <div className="flex min-h-0 flex-1 flex-col">
          {panel === "chat" ? (
            <>
              <div className="shrink-0 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
                <StructuredProgressPicker
                  onPosted={() => {
                    void loadMessages();
                    void loadProgress();
                    setSendHint("Progress posted — it appears in chat and Current focus.");
                  }}
                  onError={(msg) => setSendError(msg)}
                />
                <p className="mt-2 text-left text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Use <span className="font-medium text-zinc-600 dark:text-zinc-300">I am…</span> to log memorising or revising
                  (juz + surahs). Chat is for everything else.
                </p>
              </div>
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
                  className="flex flex-row items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/80 py-1.5 pl-3 pr-1.5 dark:border-zinc-700 dark:bg-zinc-800/50"
                >
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
                    className="min-h-10 min-w-0 flex-1 border-0 bg-transparent py-2 text-sm leading-normal text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
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
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white p-6 dark:bg-zinc-950">
              <div className="mx-auto w-full max-w-5xl shrink-0">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Current focus from structured updates (I am…). <span className="text-zinc-600 dark:text-zinc-300">Completed</span>{" "}
                  is the highest juz with a completed event in history.
                </p>
              </div>
              <div className="mx-auto mt-6 w-full max-w-5xl min-h-0 flex-1 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/40">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-zinc-100/95 text-xs font-medium uppercase tracking-wide text-zinc-500 backdrop-blur-sm dark:bg-zinc-800/95 dark:text-zinc-400">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Active juz</th>
                      <th className="px-4 py-3 text-right">% of active juz</th>
                      <th className="px-4 py-3 text-right">Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!progress || progress.dashboard.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                          No members yet.
                        </td>
                      </tr>
                    ) : (
                      progress.dashboard.map((row) => (
                        <tr key={row.member_id} className="border-t border-zinc-200 dark:border-zinc-800">
                          <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{row.display_name}</td>
                          <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                            {row.activity === "memorizing"
                              ? "Memorising"
                              : row.activity === "revising"
                                ? "Revising"
                                : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                            {row.active_juz ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                            {row.pct_active_juz != null ? `${row.pct_active_juz}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                            {row.max_juz_completed}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {panel === "trajectory" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white p-6 dark:bg-zinc-950">
              <div className="mx-auto w-full max-w-3xl shrink-0">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Highest juz anyone has logged by day. Dashed line is a simple projection (illustrative).
                </p>
              </div>
              <div className="mx-auto mt-6 w-full max-w-3xl min-h-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50/30 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                {chartRows.length === 0 ? (
                  <p className="text-sm text-zinc-500">Not enough data for a chart.</p>
                ) : (
                  <div className="h-full w-full min-h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartRows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} className="text-zinc-500" />
                        <YAxis domain={[0, 30]} width={32} tick={{ fontSize: 10 }} className="text-zinc-500" />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "0.75rem",
                            border: "1px solid rgb(228 228 231)",
                            fontSize: "12px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Line
                          type="monotone"
                          dataKey="recorded"
                          name="Recorded"
                          stroke="#047857"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="forecast"
                          name="Projection"
                          stroke="#10b981"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          dot={false}
                          connectNulls
                        />
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
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Max completed juz per member.</p>
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
                          juz: r.max_juz,
                        }))}
                        layout="vertical"
                        margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
                        <XAxis type="number" domain={[0, 30]} tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="juz" name="Max juz" fill="#047857" radius={[0, 4, 4, 0]} />
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
    </div>
  );
}
