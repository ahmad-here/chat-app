import { handlers } from "@/auth";

/** Auth.js request handlers: sign-in, callback, sign-out, session, CSRF.
 *  The Google OAuth redirect URI points at /api/auth/callback/google here. */
export const { GET, POST } = handlers;
