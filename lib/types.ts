/** Domain types, mirroring the data model in docs/requirements.md §4.
 *
 * The UI-facing types use plain string ids and never carry secrets. The
 * persistence shapes (ObjectId, passwordHash) are separated below so a
 * `passwordHash` can't leak into a component by accident — the type system
 * stops it rather than a code review. */

import type { ObjectId } from "mongodb";

/** Who authored a message. `assistant` is the AI, not a user. */
export type MessageRole = "user" | "assistant";

export interface User {
  id: string;
  name: string;
  /** Optional per the data model; the UI falls back to initials. */
  image?: string;
}

export interface Conversation {
  id: string;
  title: string;
  participantIds: string[];
  /** ISO 8601. Drives conversation-list ordering. */
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  /** The authoring user's id. Absent when `role` is `assistant`. */
  authorId?: string;
  role: MessageRole;
  /** Markdown source. Must be sanitized before rendering — see
   *  docs/ui-guidelines.md §7. Currently rendered as plain text. */
  content: string;
  /** ISO 8601. Ordering key. */
  createdAt: string;
}

/* ---------- Persistence shapes (server-only) ---------- */

/** A user as stored in MongoDB.
 *
 * Distinct from `User` because it carries `passwordHash`. Never return this
 * from a Server Component or route handler — map to `User` first. */
export interface UserDoc {
  _id: ObjectId;
  email: string;
  name: string;
  /** Absent for accounts created via Google — those have no password. */
  passwordHash?: string;
  image?: string | null;
  createdAt: Date;
}

/* ---------- Auth.js module augmentation ---------- */

/** Auth.js's default Session has no `user.id`. The jwt/session callbacks in
 *  auth.config.ts put it there, so the type has to say so. */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
