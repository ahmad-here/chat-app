"use client";

import { signOut } from "next-auth/react";
import { Avatar } from "../avatar";

interface UserMenuProps {
  name: string;
  email: string;
}

export function UserMenu({ name, email }: UserMenuProps) {
  return (
    <div className="flex items-center gap-2 border-t border-border p-3">
      <Avatar name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{name}</p>
        <p className="truncate text-[10px] text-muted">{email}</p>
      </div>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/login" })}
        className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-muted hover:bg-border hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        Sign out
      </button>
    </div>
  );
}
