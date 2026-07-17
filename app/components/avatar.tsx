import { initials } from "@/lib/format";

interface AvatarProps {
  name: string;
  /** Visual only — the surrounding message already names the author, so
   *  announcing it again would be noise for a screen reader. */
  className?: string;
}

export function Avatar({ name, className = "" }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-semibold text-muted ring-1 ring-border ${className}`}
    >
      {initials(name)}
    </span>
  );
}
