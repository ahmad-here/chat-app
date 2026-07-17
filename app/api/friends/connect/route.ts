import { ObjectId } from "mongodb";
import { requireUserId, unauthorized } from "@/lib/api-auth";
import { getDb } from "@/lib/mongodb";
import { isWellFormedConnectCode, normalizeConnectCode } from "@/lib/connect-code";
import { createFriendship } from "@/lib/chat-data";
import { rateLimit } from "@/lib/rate-limit";
import type { UserDoc } from "@/lib/types";

/** Connect to another user by their code. Entering a valid code IS the consent —
 *  both sides become friends immediately (docs/requirements.md §3.2). */

// A permanent code cannot be rotated away from an attacker who finds it, so the
// only real defence against ENUMERATION (scanning the 32^8 space for any valid
// code) is making guesses expensive. 10 attempts/minute turns a feasible online
// scan into an infeasible one. The code's length defends against guessing one
// *specific* person's code; this defends against harvesting *anyone's*.
const ATTEMPTS_PER_WINDOW = 10;
const WINDOW_MS = 60_000;

export async function POST(request: Request): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  // Keyed by user, not IP: the caller must be signed in anyway, and an IP key
  // would punish everyone behind one NAT.
  const limit = rateLimit(`connect:${userId}`, ATTEMPTS_PER_WINDOW, WINDOW_MS);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const raw = (body as { code?: unknown })?.code;
  if (typeof raw !== "string") {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const code = normalizeConnectCode(raw);
  if (!isWellFormedConnectCode(code)) {
    return Response.json({ error: "That code doesn't look right." }, { status: 400 });
  }

  const db = await getDb();
  const target = await db
    .collection<UserDoc>("users")
    .findOne({ connectCode: code }, { projection: { name: 1 } });

  // Same generic message whether the code is unknown or belongs to nobody, so
  // the endpoint can't be used to confirm which codes exist.
  if (!target) {
    return Response.json({ error: "No one found with that code." }, { status: 404 });
  }

  if (target._id.equals(new ObjectId(userId))) {
    return Response.json(
      { error: "That's your own code — share it with someone else." },
      { status: 400 },
    );
  }

  const created = await createFriendship(userId, target._id.toString());

  return Response.json(
    {
      friend: { id: target._id.toString(), name: target.name },
      // false = the unique index rejected it, i.e. they were already connected.
      // Not an error: the end state is what the user wanted either way.
      alreadyConnected: !created,
    },
    { status: created ? 201 : 200 },
  );
}
