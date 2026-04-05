/**
 * Club “admin” is whoever logs in with a username (or legacy display name) on the allowlist.
 * Default: `nouman` — matches username `Nouman` (stored lowercase).
 * Override: `CLUB_ADMIN_USERNAMES=nouman,other` (comma-separated, case-insensitive).
 */
export function clubAdminUsernameAllowlist(): string[] {
  const raw = process.env.CLUB_ADMIN_USERNAMES?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return ["nouman"];
}

export function isClubAdminRow(row: { username?: string | null }): boolean {
  const allow = clubAdminUsernameAllowlist();
  const u = (row.username ?? "").trim().toLowerCase();
  return u.length > 0 && allow.includes(u);
}
