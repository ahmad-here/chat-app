#!/usr/bin/env node
/** PreToolUse hook: refuse to create a component that already exists.
 *
 * CLAUDE.md says "Use reusable components. No duplicated code." That is easy to
 * violate by accident — a second <Avatar> in a different folder looks fine in
 * isolation and only hurts later, when the two drift apart. This catches it at
 * the moment of writing, when reusing the existing one is still cheap.
 *
 * WHAT IT MATCHES
 * Named, PascalCase value exports: `export function Avatar` /
 * `export const Avatar =`. If the name already exists in a *different* file, the
 * write is refused with a pointer to that file.
 *
 * WHAT IT DELIBERATELY IGNORES, and why
 *  - `export default` — Next.js routes all export a default `Page`/`Layout`.
 *    Matching those would flag /login/page.tsx against /signup/page.tsx forever.
 *  - Next.js convention filenames (page/layout/route/...) — they repeat by
 *    design, one per route segment.
 *  - Types (`export type` / `export interface`) — a shared name there is often
 *    deliberate, and they aren't components.
 *  - The target file itself — rewriting a file must not match its own exports.
 *
 * The bar is a false-positive rate low enough to justify BLOCKING. Anything
 * fuzzier (similar names, similar bodies) belongs in review, not a hook.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const SEARCH_DIRS = ["app", "lib"];

/** Filenames Next.js gives special meaning; they legitimately repeat. */
const NEXT_CONVENTIONS = new Set([
  "page", "layout", "route", "template", "error", "loading",
  "not-found", "default", "global-error", "instrumentation", "proxy",
]);

function isConventionFile(filePath) {
  return NEXT_CONVENTIONS.has(basename(filePath, extname(filePath)));
}

/** Named PascalCase value exports. */
function extractExports(source) {
  const names = new Set();
  // `export function Foo(` and `export async function Foo(`
  for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Z]\w*)/g)) {
    names.add(m[1]);
  }
  // `export const Foo =`
  for (const m of source.matchAll(/export\s+const\s+([A-Z]\w*)\s*[:=]/g)) {
    names.add(m[1]);
  }
  return names;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

function allow() {
  process.exit(0);
}

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  allow(); // Can't parse the hook input — never block on our own bug.
}

const filePath = payload?.tool_input?.file_path;
const content = payload?.tool_input?.content;

// Only Write creates whole files. Edit is a targeted change to a file that
// already exists, so it isn't how a duplicate component gets introduced.
if (payload?.tool_name !== "Write" || typeof filePath !== "string" || typeof content !== "string") {
  allow();
}
if (!/\.(tsx|ts)$/.test(filePath) || isConventionFile(filePath)) allow();

const incoming = extractExports(content);
if (incoming.size === 0) allow();

const targetAbs = join(ROOT, relative(ROOT, filePath));
const conflicts = [];

for (const file of SEARCH_DIRS.flatMap((d) => walk(join(ROOT, d)))) {
  // A rewrite of the same file must not match itself.
  if (file === targetAbs) continue;
  if (isConventionFile(file)) continue;

  let existing;
  try {
    existing = extractExports(readFileSync(file, "utf8"));
  } catch {
    continue;
  }

  for (const name of incoming) {
    if (existing.has(name)) {
      conflicts.push({ name, file: relative(ROOT, file).replace(/\\/g, "/") });
    }
  }
}

if (conflicts.length === 0) allow();

const lines = conflicts.map((c) => `  • ${c.name}  already exported by  ${c.file}`);
const reason = [
  `Duplicate component${conflicts.length > 1 ? "s" : ""} — this write would create a second copy of:`,
  ...lines,
  "",
  "CLAUDE.md: \"Use reusable components. No duplicated code.\"",
  "Import the existing one, or extend it with a prop. If this really is a distinct",
  "component, give it a name that says how it differs.",
].join("\n");

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  }),
);
