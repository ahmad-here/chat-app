import { auth } from "@/auth";

/** Session for a route handler, or null.
 *
 * Route handlers cannot use lib/dal.ts's `verifySession()` — that calls
 * `redirect()`, which answers a fetch with an HTML login page where the caller
 * expected JSON. And they cannot lean on proxy.ts, which skips /api entirely
 * (deliberately — see docs/architecture.md §4). So every handler authenticates
 * itself through this. */
export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export function unauthorized(): Response {
  return Response.json({ error: "Not signed in." }, { status: 401 });
}
