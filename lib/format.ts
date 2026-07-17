/** Display formatting helpers. */

/** Formats an ISO timestamp as HH:MM (UTC).
 *
 * Deliberately does NOT use toLocaleTimeString(). That formats with the
 * server's timezone during SSR and the user's in the browser, so the two
 * disagree and React throws a hydration error — see
 * node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md.
 *
 * Reading the fixed-width ISO string is deterministic on both sides. The
 * tradeoff is that times display in UTC rather than the viewer's timezone;
 * showing local time needs the inline-script pattern from that guide, which is
 * deferred until timestamps carry real data. */
export function formatTime(iso: string): string {
  return iso.slice(11, 16);
}

/** Initials for an avatar fallback. "Sara Malik" -> "SM". */
export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
