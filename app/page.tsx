import { ChatShell } from "./components/chat-shell";
import { verifySession } from "@/lib/dal";
import {
  CURRENT_USER_ID,
  conversations,
  messages,
  users,
} from "@/lib/placeholder-data";

/** Server Component: verifies the session, then hands data to the client shell.
 *
 * The auth check lives here (via the DAL), not in the root layout. Next's auth
 * guide warns that layouts don't re-render on client-side navigation because of
 * partial rendering, so a check there would silently stop running. proxy.ts
 * also redirects unauthenticated users, but that's optimistic UX — this is the
 * check that actually guards the data. */
export default async function Home() {
  const { user } = await verifySession();

  return (
    <ChatShell
      initialConversations={conversations}
      initialMessages={messages}
      users={users}
      // Placeholder identity for bubble alignment; real identity for the UI.
      // These converge in Phase 3 — see the prop's docs in chat-shell.tsx.
      currentUserId={CURRENT_USER_ID}
      sessionUser={{
        name: user.name ?? "You",
        email: user.email ?? "",
      }}
    />
  );
}
