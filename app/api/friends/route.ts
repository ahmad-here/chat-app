import { requireUserId, unauthorized } from "@/lib/api-auth";
import { listFriends } from "@/lib/chat-data";

/** The caller's friends, each with their 1:1 chat id (or null if not started). */
export async function GET(): Promise<Response> {
  const userId = await requireUserId();
  if (!userId) return unauthorized();

  const friends = await listFriends(userId);
  return Response.json({ friends });
}
