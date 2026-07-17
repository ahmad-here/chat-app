import { requireUserId, unauthorized } from "@/lib/api-auth";
import { hideChat } from "@/lib/chat-data";

/** "Delete" a conversation — which means hide it for the caller only.
 *
 * The other participant keeps the conversation and its full history. A shared
 * hard delete would let one person destroy the other's record with no recourse
 * (docs/requirements.md §3.2). A new message un-hides it.
 *
 * In Next 16 route params are a Promise and must be awaited. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> },
): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const { chatId } = await params;

  const ok = await hideChat(userId, chatId);
  // hideChat returns false when the caller isn't a participant. Reported as 404
  // rather than 403 so it can't be used to probe which chat ids exist.
  if (!ok) return Response.json({ error: "Not found." }, { status: 404 });

  return Response.json({ ok: true });
}
