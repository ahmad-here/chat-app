import { requireUserId, unauthorized } from "@/lib/api-auth";
import { listMessages } from "@/lib/chat-data";

/** Chat history.
 *
 * The initial render gets its history from the Server Component, so this exists
 * mainly for REFETCH AFTER RECONNECT. Socket.IO reconnects transparently, which
 * is exactly what makes the gap easy to miss: the connection looks healthy again
 * while the client silently sits on a hole where the messages it missed while
 * offline should be. Rejoining the room does not backfill — only refetching does.
 * See docs/architecture.md §3. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> },
): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const { chatId } = await params;

  const messages = await listMessages(userId, chatId);
  // null means "not a participant". It must NOT be reported as an empty history
  // — that would render someone else's chat as a blank thread rather than
  // refusing it.
  if (messages === null) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return Response.json({ messages });
}
