/** Pull a UUID from pasted invite URL or raw token. */
export function parseInviteTokenFromInput(input: string): string | null {
  const trimmed = input.trim();
  const re =
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
  const m = trimmed.match(re);
  return m ? m[0].toLowerCase() : null;
}
