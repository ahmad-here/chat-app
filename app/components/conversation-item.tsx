"use client";

import type { Conversation } from "@/lib/types";

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Rename is gone.
 *
 * `Conversation.title` is now DERIVED per viewer — for a 1:1 chat it is the
 * other person's name, computed server-side and never stored. A shared, mutable
 * title is meaningless here: your friend renaming your chat would be strange,
 * and there is no field to write to. It becomes relevant again if group chats
 * arrive. See docs/requirements.md §3.2. */
export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: ConversationItemProps) {
  return (
    <li className="group relative">
      {/* The select control and the Delete button are siblings, not nested. A
          <button> inside a <button> is invalid HTML and browsers recover
          unpredictably — the inner control often becomes unreachable by
          keyboard. Delete sits absolutely on top instead. */}
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={isActive ? "true" : undefined}
        className={`w-full rounded-md py-2 pr-14 pl-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-foreground hover:bg-surface"
        }`}
      >
        <span className="block truncate">{conversation.title}</span>
      </button>

      {/* Hidden until hover/focus to keep the list calm, but focus-within means
          it still appears for keyboard users — opacity-0 alone would leave a
          focused-but-invisible button. */}
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          onClick={() => onDelete(conversation.id)}
          // "Delete" is the user's word for it, but it only hides the
          // conversation for them — the other person keeps their history.
          title="Remove this conversation from your list"
          className={`rounded p-1 text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
            isActive
              ? "text-accent-foreground hover:bg-white/20"
              : "text-muted hover:bg-border hover:text-foreground"
          }`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
