import { requireUserId, unauthorized } from "@/lib/api-auth";
import { startChat } from "@/lib/chat-data";

/** Start (or reopen) the 1:1 chat with a friend.
 *
 * Idempotent: `startChat` upserts on the canonical pair key, so calling it twice
 * — or from both users at once — yields the same single conversation. */
export async function POST(request: Request): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const friendId = (body as { friendId?: unknown })?.friendId;
  if (typeof friendId !== "string") {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // startChat verifies the friendship itself rather than trusting friendId —
  // otherwise anyone could open a chat with any user id they guessed.
  const chatId = await startChat(userId, friendId);
  if (!chatId) {
    return Response.json(
      { error: "You can only start a chat with a friend." },
      { status: 403 },
    );
  }

  return Response.json({ chatId }, { status: 201 });
}
