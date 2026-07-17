"use client";

import { ConversationItem } from "./conversation-item";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./auth/user-menu";
import type { Conversation } from "@/lib/types";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenFriends: () => void;
  sessionUser: { name: string; email: string };
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onOpenFriends,
  sessionUser,
}: ConversationListProps) {
  // <nav> rather than <div>: this is the app's primary navigation, and the
  // landmark lets screen-reader users jump straight to it.
  return (
    <nav aria-label="Conversations" className="flex h-full flex-col bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <h2 className="text-sm font-semibold">Chats</h2>
        <ThemeToggle />
      </div>

      <div className="border-b border-border p-2">
        <button
          type="button"
          onClick={onOpenFriends}
          className="w-full rounded-md bg-accent px-2 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Friends &amp; connect code
        </button>
      </div>

      {conversations.length === 0 ? (
        <p className="flex-1 p-4 text-sm text-muted">
          No conversations yet. Connect with someone using a code, then start a
          chat.
        </p>
      ) : (
        <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isActive={conversation.id === activeId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      <UserMenu name={sessionUser.name} email={sessionUser.email} />
    </nav>
  );
}
