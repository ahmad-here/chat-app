import { ObjectId } from "mongodb";
import { getDb } from "./mongodb.ts";
import type {
  ChatDoc,
  Conversation,
  Friend,
  FriendshipDoc,
  Message,
  MessageDoc,
  User,
  UserDoc,
} from "./types.ts";

/** Data access for friends, chats, and messages.
 *
 * Imported by BOTH the Next app and server.mts (the Socket.IO server), which
 * constrains this file in two ways:
 *
 *   1. Relative imports carry explicit `.ts` extensions — Node ESM requires
 *      them, and server.mts is run by Node, not bundled by Next.
 *   2. It must NOT `import "server-only"`. That package exists only inside
 *      Next's compiled bundle and is unresolvable in plain Node, so importing
 *      it here would break the socket server. The safety net is that `mongodb`
 *      cannot be bundled for the browser, so a client component importing this
 *      fails at build time anyway.
 *
 * Every function that touches a chat takes the acting user's id and enforces
 * membership itself. This is the real authorization boundary — proxy.ts is
 * optimistic UX and deliberately skips /api. See docs/architecture.md §4.
 */

/* ---------- helpers ---------- */

/** Canonical ordering for a pair of ids.
 *
 * Both the friendship unique index and the chat pairKey depend on (A,B) and
 * (B,A) producing the SAME key — otherwise the uniqueness constraint doesn't
 * constrain anything and duplicates slip through under concurrency. */
function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function pairKeyFor(a: string, b: string): string {
  const [first, second] = orderPair(a, b);
  return `${first}_${second}`;
}

function toUser(doc: Pick<UserDoc, "_id" | "name" | "image">): User {
  return {
    id: doc._id.toString(),
    name: doc.name,
    ...(doc.image ? { image: doc.image } : {}),
  };
}

/* ---------- friendships ---------- */

/** Connects two users. Returns false if they were already friends.
 *
 * Relies on the unique index over the canonical pair rather than checking first:
 * two people entering each other's codes at the same moment would both pass a
 * read-then-write check. Let the database decide and treat 11000 as "already
 * friends". */
export async function createFriendship(
  userId: string,
  friendId: string,
): Promise<boolean> {
  const db = await getDb();
  const [a, b] = orderPair(userId, friendId);

  try {
    await db.collection<FriendshipDoc>("friendships").insertOne({
      userA: new ObjectId(a),
      userB: new ObjectId(b),
      createdAt: new Date(),
    } as FriendshipDoc);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: unknown }).code === 11000
    ) {
      return false;
    }
    throw error;
  }
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  const db = await getDb();
  const [first, second] = orderPair(a, b);
  const found = await db.collection<FriendshipDoc>("friendships").findOne({
    userA: new ObjectId(first),
    userB: new ObjectId(second),
  });
  return found !== null;
}

/** The user's friends, each with their 1:1 chat id if one has been started. */
export async function listFriends(userId: string): Promise<Friend[]> {
  const db = await getDb();
  const _id = new ObjectId(userId);

  const friendships = await db
    .collection<FriendshipDoc>("friendships")
    .find({ $or: [{ userA: _id }, { userB: _id }] })
    .toArray();

  if (friendships.length === 0) return [];

  const friendIds = friendships.map((f) =>
    f.userA.equals(_id) ? f.userB : f.userA,
  );

  const users = await db
    .collection<UserDoc>("users")
    .find({ _id: { $in: friendIds } }, { projection: { name: 1, image: 1 } })
    .toArray();

  // One query for every possible 1:1 chat rather than one per friend.
  const pairKeys = friendIds.map((fid) => pairKeyFor(userId, fid.toString()));
  const chats = await db
    .collection<ChatDoc>("chats")
    .find({ pairKey: { $in: pairKeys } }, { projection: { pairKey: 1 } })
    .toArray();
  const chatByPair = new Map(chats.map((c) => [c.pairKey, c._id.toString()]));

  return users.map((u) => ({
    ...toUser(u),
    chatId: chatByPair.get(pairKeyFor(userId, u._id.toString())) ?? null,
  }));
}

/* ---------- chats ---------- */

/** Finds or creates the 1:1 chat between two friends.
 *
 * Upsert keyed on pairKey, not find-then-insert: if both users hit "Start chat"
 * simultaneously, find-then-insert creates two conversations for the same pair.
 * The unique index makes that impossible and the upsert makes it a no-op. */
export async function startChat(
  userId: string,
  friendId: string,
): Promise<string | null> {
  // Never take the caller's word that they're friends — check.
  if (!(await areFriends(userId, friendId))) return null;

  const db = await getDb();
  const now = new Date();
  const key = pairKeyFor(userId, friendId);

  const result = await db.collection<ChatDoc>("chats").findOneAndUpdate(
    { pairKey: key },
    {
      $setOnInsert: {
        pairKey: key,
        participantIds: [new ObjectId(userId), new ObjectId(friendId)],
        createdAt: now,
        updatedAt: now,
      },
      // Starting a chat you previously left un-hides it for you.
      $pull: { hiddenFor: new ObjectId(userId) },
    },
    { upsert: true, returnDocument: "after" },
  );

  return result?._id.toString() ?? null;
}

/** True if the user participates in the chat. The membership check that every
 *  read and write funnels through — including socket room joins. */
export async function isParticipant(
  userId: string,
  chatId: string,
): Promise<boolean> {
  if (!ObjectId.isValid(chatId)) return false;
  const db = await getDb();
  const chat = await db.collection<ChatDoc>("chats").findOne(
    { _id: new ObjectId(chatId), participantIds: new ObjectId(userId) },
    { projection: { _id: 1 } },
  );
  return chat !== null;
}

/** The user's visible conversations, newest first.
 *
 * `title` is derived here, per viewer: for a 1:1 chat it's the OTHER
 * participant's name. Nothing is stored, so there's no rename. */
export async function listConversations(
  userId: string,
): Promise<Conversation[]> {
  const db = await getDb();
  const _id = new ObjectId(userId);

  const chats = await db
    .collection<ChatDoc>("chats")
    .find({
      participantIds: _id,
      // Deleted-for-me: hidden from this user's list, untouched for the other.
      hiddenFor: { $ne: _id },
    })
    .sort({ updatedAt: -1 })
    .toArray();

  if (chats.length === 0) return [];

  const otherIds = chats.flatMap((c) =>
    c.participantIds.filter((p) => !p.equals(_id)),
  );
  const others = await db
    .collection<UserDoc>("users")
    .find({ _id: { $in: otherIds } }, { projection: { name: 1, image: 1 } })
    .toArray();
  const nameById = new Map(others.map((u) => [u._id.toString(), u.name]));

  return chats.map((chat) => {
    const other = chat.participantIds.find((p) => !p.equals(_id));
    return {
      id: chat._id.toString(),
      title: (other && nameById.get(other.toString())) ?? "Unknown",
      participantIds: chat.participantIds.map((p) => p.toString()),
      updatedAt: chat.updatedAt.toISOString(),
    };
  });
}

/** Hides a chat for one user. Deliberately NOT a delete: the other participant
 *  keeps the conversation and its history (docs/requirements.md §3.2). */
export async function hideChat(userId: string, chatId: string): Promise<boolean> {
  if (!(await isParticipant(userId, chatId))) return false;
  const db = await getDb();
  await db
    .collection<ChatDoc>("chats")
    .updateOne(
      { _id: new ObjectId(chatId) },
      { $addToSet: { hiddenFor: new ObjectId(userId) } },
    );
  return true;
}

/* ---------- messages ---------- */

function toMessage(doc: MessageDoc): Message {
  return {
    id: doc._id.toString(),
    chatId: doc.chatId.toString(),
    ...(doc.authorId ? { authorId: doc.authorId.toString() } : {}),
    role: doc.role,
    content: doc.content,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** Chat history. Returns null when the user isn't a participant — callers must
 *  treat that as "not found", never as "empty". */
export async function listMessages(
  userId: string,
  chatId: string,
): Promise<Message[] | null> {
  if (!(await isParticipant(userId, chatId))) return null;
  const db = await getDb();
  const docs = await db
    .collection<MessageDoc>("messages")
    .find({ chatId: new ObjectId(chatId) })
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map(toMessage);
}

export const MAX_MESSAGE_LENGTH = 4000;

/** Persists a message. Returns null if the user isn't a participant or the
 *  content is unusable. */
export async function createMessage(
  userId: string,
  chatId: string,
  content: string,
): Promise<Message | null> {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return null;
  if (!(await isParticipant(userId, chatId))) return null;

  const db = await getDb();
  const now = new Date();
  const doc: Omit<MessageDoc, "_id"> = {
    chatId: new ObjectId(chatId),
    authorId: new ObjectId(userId),
    role: "user",
    content: trimmed,
    createdAt: now,
  };

  const result = await db
    .collection<MessageDoc>("messages")
    .insertOne(doc as MessageDoc);

  // Bump updatedAt so the conversation rises in both sidebars, and un-hide it
  // for anyone who had left — a new message should bring the chat back rather
  // than delivering silently into a hidden thread.
  // One $set: a literal with two `$set` keys silently drops the first, so
  // updatedAt would never be written.
  await db
    .collection<ChatDoc>("chats")
    .updateOne(
      { _id: new ObjectId(chatId) },
      { $set: { updatedAt: now, hiddenFor: [] } },
    );

  return toMessage({ ...doc, _id: result.insertedId } as MessageDoc);
}

/** Participants of a chat, for rendering author names. */
export async function listParticipants(chatId: string): Promise<User[]> {
  const db = await getDb();
  const chat = await db
    .collection<ChatDoc>("chats")
    .findOne({ _id: new ObjectId(chatId) }, { projection: { participantIds: 1 } });
  if (!chat) return [];
  const users = await db
    .collection<UserDoc>("users")
    .find(
      { _id: { $in: chat.participantIds } },
      { projection: { name: 1, image: 1 } },
    )
    .toArray();
  return users.map(toUser);
}
