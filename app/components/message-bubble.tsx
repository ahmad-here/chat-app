import { Avatar } from "./avatar";
import { formatTime } from "@/lib/format";
import type { Message } from "@/lib/types";

interface MessageBubbleProps {
  message: Message;
  authorName: string;
  /** Authored by the viewing user — aligns right, uses the accent bubble. */
  isOwn: boolean;
}

export function MessageBubble({
  message,
  authorName,
  isOwn,
}: MessageBubbleProps) {
  const isAssistant = message.role === "assistant";

  // Three variants rather than a colour ternary: the AI is visually distinct
  // from both participants, since "who said this" matters in a shared thread.
  const bubbleTone = isAssistant
    ? "bg-bubble-ai text-bubble-ai-foreground"
    : isOwn
      ? "bg-bubble-own text-bubble-own-foreground"
      : "bg-bubble-other text-bubble-other-foreground";

  return (
    <li className={`flex gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
      {!isOwn && <Avatar name={authorName} className="mt-auto" />}

      <div className={`flex max-w-[75%] flex-col ${isOwn ? "items-end" : "items-start"}`}>
        {/* The author line is the accessible label for the bubble. Colour and
            alignment convey the same thing visually, but neither survives a
            screen reader. */}
        <span className="mb-0.5 px-1 text-[11px] font-medium text-muted">
          {isAssistant ? "Assistant" : isOwn ? "You" : authorName}
        </span>

        <div className={`rounded-2xl px-3 py-2 text-sm break-words ${bubbleTone}`}>
          {/* Plain text for now. requirements.md §3.3 calls for Markdown, which
              must be sanitized before rendering — message content is untrusted
              input and Markdown allows raw HTML. Deliberately not shipping an
              unsanitized renderer as a placeholder. See ui-guidelines.md §7. */}
          {message.content}
        </div>

        <time
          dateTime={message.createdAt}
          className="mt-0.5 px-1 text-[10px] text-muted tabular-nums"
        >
          {formatTime(message.createdAt)}
        </time>
      </div>
    </li>
  );
}
