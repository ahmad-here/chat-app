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
  /** DERIVED per viewer, not stored: for a 1:1 chat this is the *other*
   *  participant's name. Alice sees "Bob"; Bob sees "Alice". There is no stored
   *  title and no rename — a single shared title is meaningless for 1:1 (your
   *  friend renaming your chat is strange). Revisit when groups arrive. */
  title: string;
  participantIds: string[];
  /** ISO 8601. Drives conversation-list ordering. */
  updatedAt: string;
}

/** A user you are connected to. */
export interface Friend {
  id: string;
  name: string;
  image?: string;
  /** The 1:1 chat with them, if one has been started. Null means "connected but
   *  no conversation yet" — starting one is an explicit action. */
  chatId: string | null;
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
  /** The permanent share code. Optional because it is assigned LAZILY, on first
   *  read — see lib/connect-code.ts. It cannot be assigned at signup alone:
   *  Google users are created by @auth/mongodb-adapter's own createUser and
   *  never touch /api/signup, and users predating this feature have none. */
  connectCode?: string;
}

/** A symmetric friendship, stored ONCE per pair.
 *
 * The pair is canonically ordered (userA < userB by hex string) so that one
 * unique compound index on {userA, userB} makes a duplicate friendship
 * impossible — including when both people enter each other's code at the same
 * instant. Storing it un-ordered, or as two rows, would let that race through:
 * the database, not application logic, is what enforces this. */
export interface FriendshipDoc {
  _id: ObjectId;
  userA: ObjectId;
  userB: ObjectId;
  createdAt: Date;
}

/** A conversation as stored.
 *
 * No `title` field: 1:1 titles are derived per viewer (see `Conversation`). */
export interface ChatDoc {
  _id: ObjectId;
  participantIds: ObjectId[];
  /** Canonical "<idA>_<idB>" for 1:1 chats, with a UNIQUE index.
   *
   * This is what guarantees exactly one conversation per pair even if both
   * users hit "Start chat" simultaneously — a find-then-insert would let both
   * through. Absent for group chats, and the index is sparse so they're ignored. */
  pairKey?: string;
  /** Users who have "deleted" (left) this chat. Delete is per-user: it hides the
   *  conversation for you and leaves the other person's history untouched.
   *  A new message un-hides it for everyone. */
  hiddenFor?: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageDoc {
  _id: ObjectId;
  chatId: ObjectId;
  authorId?: ObjectId;
  role: MessageRole;
  content: string;
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
