import { atom, update } from 'claude-code'
import type { Args, EngineInterface } from 'claude-code'

import type { Editor, SessionEnv } from '../types'
import { parseTzOffset } from './format'

const ENV = atom({ plugin: 'realce', key: 'env' } as const, null)

// The hot drawings (every tool row, every reply) read the env here: a state read per row was a trip to the engine.
let current: SessionEnv | null = null

export const cachedEnv = () => current

// The first one installed wins: links open where the person edits.
const EDITOR_APPS: readonly (readonly [Editor, string])[] = [
  ['cursor', '/Applications/Cursor.app'],
  ['vscode', '/Applications/Visual Studio Code.app'],
  ['zed', '/Applications/Zed.app'],
]

export async function detectEditor($: EngineInterface): Promise<Editor> {
  for (const [editor, app] of EDITOR_APPS) if (await $.fs.exists(app)) return editor
  return 'file'
}

/** Records what the session runs in, once per load: directory, home, editor, UTC offset and the mermaid CLI. */
export async function recordEnv($: EngineInterface, e: Args<'session.start'>): Promise<void> {
  const [home, editor, date, which] = await Promise.all([
    $.env.get('HOME'),
    detectEditor($),
    $.process.run(['date', '+%z']),
    $.process.run(['which', 'mmdc']),
  ])
  const mmdc = which.exitCode === 0 && which.stdout.trim() !== '' ? which.stdout.trim() : null
  current = { cwd: e.cwd, home: home ?? '', editor, tzOffsetMinutes: parseTzOffset(date.stdout), mmdc }
  await update($, ENV, () => current)
  // Rows drawn before the env was known read it from the module, not the state: draw them again.
  $.ui.invalidate('ui.render')
}
