"use client";

import { useState } from "react";

interface ComposerProps {
  onSend: (content: string) => void;
  /** Names the conversation being posted to, for the field's accessible label. */
  conversationTitle: string;
}

export function Composer({ onSend, conversationTitle }: ComposerProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }

  // A <form> rather than an input + click handler: this gets Enter-to-submit
  // for free and is what assistive tech expects.
  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-border bg-raised p-3"
    >
      <label htmlFor="composer-input" className="sr-only">
        Message {conversationTitle}
      </label>
      <input
        id="composer-input"
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Write a message…"
        autoComplete="off"
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
      >
        Send
      </button>
    </form>
  );
}
