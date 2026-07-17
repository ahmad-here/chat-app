import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

/** Optimistic auth redirects.
 *
 * NOTE: this file is `proxy.ts`, not `middleware.ts`. Next 16 renamed the
 * convention — `middleware` is deprecated (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
 *
 * This is UX, not security. It runs on every request including prefetches, so
 * it only decodes the session cookie and never queries MongoDB. Real
 * authorization lives in lib/dal.ts, next to the data. Deleting this file
 * should degrade the experience (unauthenticated users reach a page that then
 * redirects) but must never expose data.
 *
 * It imports authConfig, not auth.ts: this runs in the Edge runtime, and
 * auth.ts pulls in the MongoDB driver and bcrypt, which don't exist there. */
const { auth } = NextAuth(authConfig);

const AUTH_ROUTES = ["/login", "/signup"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isSignedIn = Boolean(req.auth?.user);
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  // Signed in, sitting on login/signup — nothing to do here.
  if (isSignedIn && isAuthRoute) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }

  if (!isSignedIn && !isAuthRoute) {
    const loginUrl = new URL("/login", req.nextUrl);
    // Preserve where they were headed so login can send them back, rather than
    // dumping everyone on the home page.
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Skips /api entirely, plus Next internals and static files.
  //
  // /api is excluded on purpose. This proxy redirects to an HTML login page,
  // which is a sensible response to a *navigation* and a nonsensical one to a
  // fetch — an API caller would get a login page where it expected JSON. Worse,
  // an earlier version excluded only `api/auth`, which meant POST /api/signup
  // was redirected to /login: you needed an account to create an account.
  //
  // Route handlers are therefore responsible for their own auth (lib/api-auth.ts
  // / lib/dal.ts), which is where the real check belongs anyway — the proxy is
  // optimistic UX, not a security boundary. /api/signup and /api/auth are
  // intentionally public.
  //
  // /socket.io is excluded too. engine.io intercepts requests on its path before
  // Next's handler ever runs, so in practice the proxy never sees them — but the
  // polling handshake is plain HTTP, and if one ever did reach the proxy it
  // would be redirected to an HTML login page and the transport would fail for
  // reasons that look nothing like auth. The socket authenticates itself in
  // server.mts.
  matcher: ["/((?!api|socket.io|_next/static|_next/image|favicon.ico).*)"],
};
