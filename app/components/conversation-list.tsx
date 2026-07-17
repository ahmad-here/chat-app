"use client";

import { ConversationItem } from "./conversation-item";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./auth/user-menu";
import type { Conversation } from "@/lib/types";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  sessionUser: { name: string; email: string };
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onRename,
  onDelete,
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

      {conversations.length === 0 ? (
        <p className="flex-1 p-4 text-sm text-muted">No conversations yet.</p>
      ) : (
        <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isActive={conversation.id === activeId}
              onSelect={onSelect}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}

      <UserMenu name={sessionUser.name} email={sessionUser.email} />
    </nav>
  );
}
