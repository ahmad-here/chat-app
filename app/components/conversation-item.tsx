"use client";

import { useEffect, useRef, useState } from "react";
import type { Conversation } from "@/lib/types";

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

export function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.select();
    }
  }, [isEditing]);

  function startEditing(): void {
    setDraft(conversation.title);
    setIsEditing(true);
  }

  function commit(): void {
    const trimmed = draft.trim();
    // Empty title would render an unclickable blank row — treat as cancel.
    if (trimmed && trimmed !== conversation.title) {
      onRename(conversation.id, trimmed);
    }
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <li>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            commit();
          }}
          className="p-1"
        >
          <label htmlFor={`rename-${conversation.id}`} className="sr-only">
            Rename conversation
          </label>
          <input
            ref={inputRef}
            id={`rename-${conversation.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Escape") setIsEditing(false);
            }}
            className="w-full rounded-md border border-accent bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline-none"
          />
        </form>
      </li>
    );
  }

  return (
    <li className="group relative">
      {/* The select control and the action buttons are siblings, not nested.
          A <button> inside a <button> is invalid HTML and browsers recover
          unpredictably — the inner control often becomes unreachable by
          keyboard. The actions sit absolutely on top instead. */}
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={isActive ? "true" : undefined}
        className={`w-full rounded-md py-2 pr-16 pl-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-foreground hover:bg-surface"
        }`}
      >
        <span className="block truncate">{conversation.title}</span>
      </button>

      {/* Hidden until hover/focus to keep the list calm, but focus-within means
          they still appear for keyboard users — opacity-0 alone would leave a
          focused-but-invisible button. */}
      <div className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          onClick={startEditing}
          className={`rounded p-1 text-[10px] font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
            isActive
              ? "text-accent-foreground hover:bg-white/20"
              : "text-muted hover:bg-border hover:text-foreground"
          }`}
        >
          Rename
        </button>
        <button
          type="button"
          onClick={() => onDelete(conversation.id)}
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
