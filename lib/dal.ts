import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Data Access Layer — the real authorization boundary.
 *
 * Next's auth guide is explicit that proxy.ts is an *optimistic* check only:
 * it runs on prefetches and reads the cookie without touching the database, so
 * it's for redirect UX, not security. The guarantee has to live next to the
 * data.
 *
 * It also warns against auth checks in layouts: partial rendering means layouts
 * don't re-render on client-side navigation, so a layout check silently stops
 * running. Call verifySession() in the page/DAL instead.
 *
 * "server-only" makes importing this from a Client Component a build error
 * rather than a runtime leak. */

/** Returns the session, or redirects to /login.
 *
 * React `cache` dedupes this per request — several components can each call it
 * without re-verifying. */
export const verifySession = cache(async () => {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return { userId: session.user.id, user: session.user };
});

/** Returns the session or null, without redirecting. For pages that render
 *  differently when signed in rather than requiring it. */
export const getSession = cache(async () => {
  const session = await auth();
  return session?.user?.id ? session : null;
});
