import { MessageBubble } from "./message-bubble";
import type { Message, User } from "@/lib/types";

interface MessageListProps {
  messages: Message[];
  users: User[];
  currentUserId: string;
}

export function MessageList({
  messages,
  users,
  currentUserId,
}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted">No messages yet. Say hello.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {/* aria-live="polite" announces messages that arrive after load. Without
          it, a message pushed in over the socket is silently invisible to a
          screen reader — the highest-value a11y detail in a real-time app, and
          the easiest to miss, since nothing about the visuals reveals it.
          "polite" waits for a pause rather than interrupting.
          See ui-guidelines.md §6. */}
      <ul aria-live="polite" aria-relevant="additions" className="flex flex-col gap-3">
        {messages.map((message) => {
          const author = users.find((u) => u.id === message.authorId);
          return (
            <MessageBubble
              key={message.id}
              message={message}
              authorName={author?.name ?? "Unknown"}
              isOwn={message.authorId === currentUserId}
            />
          );
        })}
      </ul>
    </div>
  );
}
