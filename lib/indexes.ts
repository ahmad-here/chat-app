import { getDb } from "./mongodb";

/** Creates the indexes the app's correctness depends on.
 *
 * Most of these are not performance tuning — they are the ONLY thing standing
 * between us and duplicate accounts, duplicate friendships, and duplicate
 * conversations. Every one of those races the same way: two concurrent requests
 * both read "doesn't exist yet" before either writes. An application-level check
 * cannot close that window; a unique index can.
 *
 * createIndex is idempotent, so this is safe to run on every boot.
 * See docs/requirements.md §4 and docs/architecture.md §5. */
export async function ensureIndexes(): Promise<void> {
  const db = await getDb();

  // CORRECTNESS. Stops two accounts sharing an email.
  await db.collection("users").createIndex({ email: 1 }, { unique: true });

  // CORRECTNESS. Codes must be unique to identify one person. Sparse because
  // codes are assigned lazily (lib/connect-code.ts) — without `sparse`, every
  // user still lacking one would collide on `null` and only the first would
  // ever be insertable.
  await db
    .collection("users")
    .createIndex({ connectCode: 1 }, { unique: true, sparse: true });

  // CORRECTNESS. One row per friendship, with the pair canonically ordered
  // (userA < userB), so "A friends B" and "B friends A" are the same key and the
  // second one is rejected — even if both users enter each other's code at the
  // same moment.
  await db
    .collection("friendships")
    .createIndex({ userA: 1, userB: 1 }, { unique: true });

  // PERFORMANCE. "Who are my friends?" is an $or over userA/userB; the compound
  // index above already serves the userA side, this serves the userB side.
  await db.collection("friendships").createIndex({ userB: 1 });

  // CORRECTNESS. Exactly one 1:1 conversation per pair, even if both people hit
  // "Start chat" simultaneously. Sparse so future group chats (no pairKey) are
  // exempt rather than all colliding on null.
  await db
    .collection("chats")
    .createIndex({ pairKey: 1 }, { unique: true, sparse: true });

  // PERFORMANCE. Every authorization check reads participantIds to decide
  // whether a user may see a conversation.
  await db.collection("chats").createIndex({ participantIds: 1 });

  // PERFORMANCE. Compound: serves "this chat's history, in order" — the app's
  // hottest read.
  await db.collection("messages").createIndex({ chatId: 1, createdAt: 1 });
}
