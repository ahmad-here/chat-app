#!/usr/bin/env node
// PostToolUse hook: run eslint --fix on the file Claude just wrote.
// Reads the hook payload as JSON on stdin; stays silent unless eslint reports
// something it could not fix.
//
// eslint is spawned via its JS entrypoint rather than `npx`, because on Windows
// spawning npx.cmd without a shell fails with EINVAL.
import { spawnSync } from 'node:child_process'
import { extname, join } from 'node:path'

const LINTABLE = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs'])
const ROOT = join(import.meta.dirname, '..', '..')

let raw = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) raw += chunk

let file
try {
  const payload = JSON.parse(raw)
  file = payload.tool_response?.filePath ?? payload.tool_input?.file_path
} catch {
  process.exit(0)
}

if (!file || !LINTABLE.has(extname(file))) process.exit(0)

const eslint = spawnSync(
  process.execPath,
  [join(ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js'), '--fix', file],
  { cwd: ROOT, encoding: 'utf8' },
)

// status null means eslint never ran (spawn failure) — surface that rather than
// reporting a clean lint.
if (eslint.status === null) {
  console.log(JSON.stringify({
    systemMessage: `lint hook could not run eslint: ${eslint.error?.message ?? 'unknown error'}`,
  }))
  process.exit(0)
}

// Gate on output, not exit code: eslint exits 0 for warnings, and this project's
// Next.js rules report as warnings. A clean file prints nothing.
const report = `${eslint.stdout ?? ''}${eslint.stderr ?? ''}`.trim()
if (report) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `eslint findings it could not auto-fix:\n\n${report}`,
    },
  }))
}
