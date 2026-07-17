"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConversationList } from "./conversation-list";
import { FriendsPanel } from "./friends-panel";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { useChatSocket } from "./use-chat-socket";
import type { Conversation, Message, User } from "@/lib/types";

interface ChatShellProps {
  conversations: Conversation[];
  /** History for `activeChatId`, rendered on the server. */
  initialMessages: Message[];
  /** Participants of the active chat, for author names. */
  participants: User[];
  activeChatId: string | null;
  currentUserId: string;
  sessionUser: { name: string; email: string };
}

export function ChatShell({
  conversations,
  initialMessages,
  participants,
  activeChatId,
  currentUserId,
  sessionUser,
}: ChatShellProps) {
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);

  const { messages, send, isConnected } = useChatSocket({
    chatId: activeChatId,
    initialMessages,
  });

  const active = conversations.find((c) => c.id === activeChatId) ?? null;

  /** Conversation selection lives in the URL, not component state.
   *
   * That makes a conversation linkable and survivable across reload, and lets
   * the server render its history — rather than the client fetching it after
   * mount and flashing an empty thread. */
  function handleSelect(id: string): void {
    setIsDrawerOpen(false);
    router.push(`/?chat=${id}`);
  }

  async function handleDelete(id: string): Promise<void> {
    // "Delete" hides the conversation for this user only; the other participant
    // keeps it and the full history (docs/requirements.md §3.2). No confirm
    // step: nothing is destroyed, and a new message brings it back.
    const res = await fetch(`/api/chats/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    // Re-render from the server rather than mutating local state, so the list
    // and the active selection stay consistent with what's actually stored.
    if (id === activeChatId) router.push("/");
    else router.refresh();
  }

  function handleChatStarted(chatId: string): void {
    router.push(`/?chat=${chatId}`);
    router.refresh();
  }

  const sidebar = (
    <ConversationList
      conversations={conversations}
      activeId={activeChatId}
      onSelect={handleSelect}
      onDelete={handleDelete}
      onOpenFriends={() => setIsFriendsOpen(true)}
      sessionUser={sessionUser}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar. Hidden below md, where the drawer takes over. */}
      <aside className="hidden w-72 shrink-0 border-r border-border md:block">
        {sidebar}
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
          {sidebar}
        </div>
      </div>

      {isFriendsOpen && (
        <div className="fixed inset-0 z-30 flex justify-end bg-black/40">
          <button
            type="button"
            onClick={() => setIsFriendsOpen(false)}
            aria-label="Close friends"
            className="flex-1"
          />
          <div className="w-full max-w-sm border-l border-border">
            <FriendsPanel
              onClose={() => setIsFriendsOpen(false)}
              onChatStarted={handleChatStarted}
            />
          </div>
        </div>
      )}

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

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">
              {active ? active.title : "No conversation"}
            </h1>
          </div>

          {active && !isConnected && (
            // Surfaced rather than hidden: while disconnected, messages from the
            // other person are not arriving. Silently showing a stale thread as
            // if it were live is worse than saying so.
            <span
              role="status"
              className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10px] text-muted"
            >
              Reconnecting…
            </span>
          )}
        </header>

        {active ? (
          <>
            <MessageList
              messages={messages}
              users={participants}
              currentUserId={currentUserId}
            />
            <Composer onSend={send} conversationTitle={active.title} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8">
            <p className="max-w-xs text-center text-sm text-muted">
              {conversations.length === 0
                ? "Open Friends, share your code, and connect with someone to start chatting."
                : "Select a conversation to start chatting."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
