import { ChatShell } from "./components/chat-shell";
import { verifySession } from "@/lib/dal";
import {
  listConversations,
  listMessages,
  listParticipants,
} from "@/lib/chat-data";

/** Server Component: verifies the session, then loads the user's real data.
 *
 * The auth check lives here (via the DAL), not in the root layout. Next's auth
 * guide warns that layouts don't re-render on client-side navigation because of
 * partial rendering, so a check there would silently stop running. proxy.ts also
 * redirects unauthenticated users, but that's optimistic UX — this is the check
 * that actually guards the data.
 *
 * The active conversation comes from ?chat=<id> rather than client state, so a
 * conversation is linkable, survives reload, and — crucially — its history is
 * rendered on the server instead of fetched after mount (which would flash an
 * empty thread). */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string }>;
}) {
  const { user } = await verifySession();
  const { chat } = await searchParams;

  const conversations = await listConversations(user.id);

  // Only honour ?chat= if the user actually participates. listMessages returns
  // null for a non-participant, and that must NOT be shown as an empty thread —
  // otherwise a guessed id renders as someone else's blank conversation.
  const requested = chat ?? null;
  const messages = requested ? await listMessages(user.id, requested) : null;
  const activeChatId = messages === null ? null : requested;

  const participants = activeChatId
    ? await listParticipants(activeChatId)
    : [];

  return (
    <ChatShell
      conversations={conversations}
      initialMessages={messages ?? []}
      participants={participants}
      activeChatId={activeChatId}
      currentUserId={user.id}
      sessionUser={{
        name: user.name ?? "You",
        email: user.email ?? "",
      }}
    />
  );
}
