import type { Args, EngineInterface } from 'claude-code'

import type { Editor, SessionEnv } from '../types'
import { parseTzOffset } from './format'
import { envVar, exec, exists, redraw } from './io'

// Read once per load (a reload runs session.start again) and kept here: every drawing reads it from the module, as a
// state read per row was a trip to the engine.
let current: SessionEnv | null = null

export const cachedEnv = () => current

/** The session's offset from UTC, or the machine's (`date +%z`) when the session has not read it yet. */
export async function sessionOffset($: EngineInterface): Promise<number> {
  return current?.tzOffsetMinutes ?? parseTzOffset((await exec($, ['date', '+%z'])).stdout)
}

// The first one installed wins: links open where the person edits.
const EDITOR_APPS: readonly (readonly [Editor, string])[] = [
  ['cursor', '/Applications/Cursor.app'],
  ['vscode', '/Applications/Visual Studio Code.app'],
  ['zed', '/Applications/Zed.app'],
]

async function detectEditor($: EngineInterface): Promise<Editor> {
  for (const [editor, app] of EDITOR_APPS) if (await exists($, app)) return editor
  return 'file'
}

let mermaid: Promise<string | null> | null = null

/** Where `which` finds the mermaid CLI, or null: asked once per load, whoever asks first. */
export function findMermaid($: EngineInterface): Promise<string | null> {
  mermaid ??= exec($, ['which', 'mmdc']).then(w => (w.exitCode === 0 && w.stdout.trim() !== '' ? w.stdout.trim() : null))
  return mermaid
}

/** Records what the session runs in, once per load: directory, home, editor, UTC offset and the mermaid CLI. */
export async function recordEnv($: EngineInterface, e: Args<'session.start'>): Promise<void> {
  const [home, editor, date, mmdc] = await Promise.all([
    envVar($, 'HOME'),
    detectEditor($),
    exec($, ['date', '+%z']),
    findMermaid($),
  ])
  current = { cwd: e.cwd, home: home ?? '', editor, tzOffsetMinutes: parseTzOffset(date.stdout), mmdc }
  // Rows drawn before the env was known: draw them again.
  redraw($, 'ui.render')
}
