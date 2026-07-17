"use client";

import { useState } from "react";
import { ConversationList } from "./conversation-list";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import type { Conversation, Message, User } from "@/lib/types";

interface ChatShellProps {
  initialConversations: Conversation[];
  initialMessages: Message[];
  users: User[];
  /** Identifies "own" messages for bubble alignment.
   *
   * Still the placeholder id, NOT the signed-in user's id — the seeded messages
   * are authored by placeholder users, so using the real id would leave every
   * bubble looking like someone else's. These converge in Phase 3, when
   * messages come from MongoDB and are authored by real users. */
  currentUserId: string;
  /** The actually-signed-in user, from the session. */
  sessionUser: { name: string; email: string };
}

export function ChatShell({
  initialConversations,
  initialMessages,
  users,
  currentUserId,
  sessionUser,
}: ChatShellProps) {
  // Local state stands in for the server until Phase 3 — nothing here persists.
  // When real data lands, most of this moves server-side and only the live
  // pieces stay client (architecture.md §7).
  const [conversations, setConversations] = useState(initialConversations);
  const [messages, setMessages] = useState(initialMessages);
  const [activeId, setActiveId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const visibleMessages = active
    ? messages.filter((m) => m.chatId === active.id)
    : [];

  function handleSelect(id: string): void {
    setActiveId(id);
    setIsDrawerOpen(false); // On mobile the drawer covers the conversation.
  }

  function handleRename(id: string, title: string): void {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c)),
    );
  }

  function handleDelete(id: string): void {
    // Deletes locally with no confirmation because the semantics are still
    // undecided — for-everyone vs for-me changes both the schema and whether a
    // confirm step is warranted (requirements.md §6). Wiring a real destructive
    // action before that is settled would bake in the wrong answer.
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setMessages((prev) => prev.filter((m) => m.chatId !== id));
    if (activeId === id) {
      setActiveId((prev) => {
        const remaining = conversations.filter((c) => c.id !== id);
        return remaining[0]?.id ?? (prev === id ? null : prev);
      });
    }
  }

  function handleSend(content: string): void {
    if (!active) return;
    setMessages((prev) => [
      ...prev,
      {
        // Date.now() is fine here: this runs in a browser event handler, never
        // during SSR, so there's no server/client value to disagree about.
        id: `m_local_${Date.now()}`,
        chatId: active.id,
        authorId: currentUserId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar. Hidden below md, where the drawer takes over. */}
      <aside className="hidden w-72 shrink-0 border-r border-border md:block">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelect}
          onRename={handleRename}
          onDelete={handleDelete}
          sessionUser={sessionUser}
        />
      </aside>

      {/* Mobile drawer. Rendered but translated off-screen rather than
          unmounted, so opening and closing animates. */}
      <div
        className={`fixed inset-0 z-20 md:hidden ${isDrawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!isDrawerOpen}
      >
        <button
          type="button"
          tabIndex={isDrawerOpen ? 0 : -1}
          onClick={() => setIsDrawerOpen(false)}
          aria-label="Close conversations"
          className={`absolute inset-0 bg-black/40 transition-opacity ${
            isDrawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`absolute inset-y-0 left-0 w-72 max-w-[85%] border-r border-border transition-transform duration-200 ${
            isDrawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelect}
            onRename={handleRename}
            onDelete={handleDelete}
            sessionUser={sessionUser}
          />
        </div>
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border bg-raised p-3">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open conversations"
            aria-expanded={isDrawerOpen}
            className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent md:hidden"
          >
            {/* Decorative: the button already has an accessible name. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="size-4"
            >
              <path d="M2 4h12M2 8h12M2 12h12" />
            </svg>
          </button>

          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">
              {active ? active.title : "No conversation"}
            </h1>
            {active && (
              <p className="truncate text-xs text-muted">
                {active.participantIds.length} participants
              </p>
            )}
          </div>
        </header>

        {active ? (
          <>
            <MessageList
              messages={visibleMessages}
              users={users}
              currentUserId={currentUserId}
            />
            <Composer onSend={handleSend} conversationTitle={active.title} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="text-sm text-muted">
              Select a conversation to start chatting.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
