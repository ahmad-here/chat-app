import { ChatShell } from "./components/chat-shell";
import {
  CURRENT_USER_ID,
  conversations,
  messages,
  users,
} from "@/lib/placeholder-data";

/** Server Component: reads the data and hands it to the client shell.
 *
 * The shell is a Client Component because everything in it is interactive
 * (drawer, rename, send). Once real data lands, the read moves to MongoDB here
 * and the static parts of the tree can render on the server — only the live
 * message list and composer need to stay client (architecture.md §7). */
export default function Home() {
  return (
    <ChatShell
      initialConversations={conversations}
      initialMessages={messages}
      users={users}
      currentUserId={CURRENT_USER_ID}
    />
  );
}
