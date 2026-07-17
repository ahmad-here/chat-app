import { requireUserId, unauthorized } from "@/lib/api-auth";
import { getOrCreateConnectCode } from "@/lib/connect-code";

/** The caller's own connect code, assigning one on first read.
 *
 * GET rather than POST despite the possible write: it is idempotent from the
 * caller's view — the code is created once and every later call returns the
 * same value. */
export async function GET(): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  try {
    const code = await getOrCreateConnectCode(userId);
    return Response.json({ code });
  } catch (error) {
    console.error("[me/code] failed", error);
    return Response.json({ error: "Could not load your code." }, { status: 500 });
  }
}
