"use client";

import { useEffect, useState } from "react";
import { Avatar } from "./avatar";
import { FormAlert } from "./auth/form-alert";
import type { Friend } from "@/lib/types";

interface FriendsPanelProps {
  onClose: () => void;
  /** Called after a chat is started or reopened, so the shell can select it. */
  onChatStarted: (chatId: string) => void;
}

export function FriendsPanel({ onClose, onChatStarted }: FriendsPanelProps) {
  const [myCode, setMyCode] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      const [codeRes, friendsRes] = await Promise.all([
        fetch("/api/me/code"),
        fetch("/api/friends"),
      ]);
      if (codeRes.ok) setMyCode((await codeRes.json()).code);
      if (friendsRes.ok) setFriends((await friendsRes.json()).friends);
    })();
  }, []);

  async function refreshFriends(): Promise<void> {
    const res = await fetch("/api/friends");
    if (res.ok) setFriends((await res.json()).friends);
  }

  async function handleConnect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsConnecting(true);

    try {
      const res = await fetch("/api/friends/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeInput }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not connect.");
        return;
      }

      setNotice(
        data.alreadyConnected
          ? `You're already connected to ${data.friend.name}.`
          : `Connected to ${data.friend.name}.`,
      );
      setCodeInput("");
      await refreshFriends();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleStartChat(friendId: string): Promise<void> {
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId }),
    });
    if (!res.ok) {
      setError("Could not start that chat.");
      return;
    }
    const { chatId } = await res.json();
    onChatStarted(chatId);
    onClose();
  }

  async function copyCode(): Promise<void> {
    if (!myCode) return;
    try {
      await navigator.clipboard.writeText(myCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure origin / permissions). The code is on
      // screen and selectable, so this is a nicety, not a failure worth
      // reporting.
    }
  }

  return (
    <section
      aria-label="Friends"
      className="flex h-full flex-col gap-4 overflow-y-auto bg-raised p-4"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Friends</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-muted hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          Close
        </button>
      </header>

      <div className="rounded-lg border border-border p-3">
        <h3 className="text-xs font-medium text-muted">Your code</h3>
        <p className="mt-1 text-xs text-muted">
          Share this so someone can connect to you.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded-md bg-surface px-2 py-1.5 font-mono text-sm tracking-widest">
            {myCode ?? "…"}
          </code>
          <button
            type="button"
            onClick={copyCode}
            disabled={!myCode}
            className="shrink-0 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-surface disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <form onSubmit={handleConnect} className="flex flex-col gap-2">
        <label htmlFor="connect-code" className="text-xs font-medium text-muted">
          Enter a friend&apos;s code
        </label>
        <div className="flex gap-2">
          <input
            id="connect-code"
            value={codeInput}
            onChange={(event) => setCodeInput(event.target.value)}
            placeholder="ABCD2345"
            autoComplete="off"
            // Codes are uppercase; typing lowercase is normalised server-side
            // anyway, but showing it uppercase avoids a confusing mismatch.
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          />
          <button
            type="submit"
            disabled={isConnecting || !codeInput.trim()}
            className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {isConnecting ? "…" : "Connect"}
          </button>
        </div>
      </form>

      {error && <FormAlert>{error}</FormAlert>}
      {notice && (
        <p role="status" className="text-xs text-muted">
          {notice}
        </p>
      )}

      <div>
        <h3 className="mb-2 text-xs font-medium text-muted">
          Connected ({friends.length})
        </h3>
        {friends.length === 0 ? (
          <p className="text-xs text-muted">
            No one yet. Share your code, or enter someone else&apos;s.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {friends.map((friend) => (
              <li key={friend.id} className="flex items-center gap-2">
                <Avatar name={friend.name} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {friend.name}
                </span>
                <button
                  type="button"
                  onClick={() => void handleStartChat(friend.id)}
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                >
                  {/* Same endpoint either way — it upserts. The label just
                      reflects whether a conversation already exists. */}
                  {friend.chatId ? "Open" : "Start chat"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
