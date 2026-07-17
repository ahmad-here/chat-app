import { getDb } from "./mongodb";

/** Creates the indexes the app's correctness depends on.
 *
 * These are not performance tuning. The unique index on users.email is what
 * actually prevents two accounts sharing an email — an application-level
 * "is this taken?" check races: two concurrent signups can both read "free"
 * before either writes. Only the database can make that atomic.
 *
 * createIndex is idempotent, so this is safe to run on every boot.
 * See docs/requirements.md §4 and docs/architecture.md §5. */
export async function ensureIndexes(): Promise<void> {
  const db = await getDb();

  await db.collection("users").createIndex({ email: 1 }, { unique: true });

  // Every authorization check reads participantIds to decide whether a user may
  // see a conversation.
  await db.collection("chats").createIndex({ participantIds: 1 });

  // Compound: serves "this chat's history, in order" — the app's hottest read.
  await db.collection("messages").createIndex({ chatId: 1, createdAt: 1 });
}
