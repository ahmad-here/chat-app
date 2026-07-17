#!/usr/bin/env node
// Stop hook: typecheck the project when Claude finishes a turn.
// Reports errors to the user rather than blocking, so a turn never loops here.
//
// tsc is spawned via its JS entrypoint rather than `npx`, because on Windows
// spawning npx.cmd without a shell fails with EINVAL.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')

const tsc = spawnSync(
  process.execPath,
  [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'],
  { cwd: ROOT, encoding: 'utf8' },
)

// status null means tsc never ran (spawn failure) — don't report that as clean.
if (tsc.status === null) {
  console.log(JSON.stringify({
    systemMessage: `typecheck hook could not run tsc: ${tsc.error?.message ?? 'unknown error'}`,
  }))
  process.exit(0)
}

if (tsc.status !== 0) {
  const errors = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`
    .split('\n')
    .filter(line => line.includes('error TS'))
  const shown = errors.slice(0, 10).join('\n')
  const more = errors.length > 10 ? `\n…and ${errors.length - 10} more` : ''
  console.log(JSON.stringify({
    systemMessage: `TypeScript: ${errors.length} error(s)\n${shown}${more}`,
  }))
}
