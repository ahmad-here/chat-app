import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import bcrypt from "bcryptjs";
import { getClientPromise, getDb } from "@/lib/mongodb";
import { authConfig } from "./auth.config";
import type { UserDoc } from "@/lib/types";

/** Full Auth.js config — Node runtime only.
 *
 * Imports the MongoDB driver and bcrypt, so this must never be pulled into
 * proxy.ts (Edge). See auth.config.ts. */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  // The adapter persists OAuth users and their linked accounts. It does NOT
  // manage sessions here — the session strategy is JWT (see auth.config.ts),
  // which the Credentials provider requires.
  //
  // Passed as a function, not a promise: the adapter supports lazy clients, so
  // no connection is attempted until a request actually needs one. Passing
  // `getClientPromise()` here instead would connect at import time and make
  // `next build` require a live database.
  adapter: MongoDBAdapter(getClientPromise),

  providers: [
    ...authConfig.providers,

    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      // Returning null means "invalid" — Auth.js surfaces it as CredentialsSignin.
      // Every failure below returns the same null so the response can't be used
      // to probe which emails exist (requirements.md §3.1).
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;

        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const db = await getDb();
        const user = await db
          .collection<UserDoc>("users")
          .findOne({ email: email.toLowerCase().trim() });

        if (!user) return null;

        // No passwordHash means this account was created via Google. Falling
        // through to bcrypt.compare with undefined would throw, so bail first.
        if (!user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Never return passwordHash — this object becomes the JWT payload.
        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          image: user.image ?? null,
        };
      },
    }),
  ],
});
