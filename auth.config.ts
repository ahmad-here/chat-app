import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/** Edge-safe half of the Auth.js config.
 *
 * proxy.ts runs in the Edge runtime, which has no Node sockets — so the MongoDB
 * driver and bcrypt cannot be imported here, directly or transitively. Anything
 * needing them lives in auth.ts (Node runtime only). Importing the full config
 * into the proxy is the classic way to break the build with an opaque
 * "Module not found: dns/net/tls" error.
 *
 * Google is listed here because OAuth redirects are just fetch + crypto, which
 * the Edge runtime supports. The Credentials provider is not: it has to read
 * the user out of MongoDB and compare a bcrypt hash. */
export const authConfig = {
  pages: {
    signIn: "/login",
    // Auth.js sends provider errors (e.g. OAuthAccountNotLinked) here as
    // ?error=... rather than rendering its own default page.
    error: "/login",
  },

  // Required: the Credentials provider only works with JWT sessions, never
  // database sessions. See docs/architecture.md §4.
  session: { strategy: "jwt" },

  providers: [
    Google({
      // allowDangerousEmailAccountLinking is deliberately NOT enabled.
      //
      // It would auto-link a Google sign-in to an existing credentials account
      // with the same email. That is unsafe *here* because signup does not
      // verify email ownership: anyone could register victim@gmail.com with a
      // password they choose, and the moment the real owner signed in with
      // Google, the attacker's password would unlock their account.
      //
      // With linking off, that case surfaces as an OAuthAccountNotLinked error
      // instead, which the login page explains. Revisit only after email
      // verification exists.
    }),
  ],

  callbacks: {
    // The JWT is the session — there is no session row to look up. Whatever the
    // app needs from `session.user` has to be put on the token here.
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
