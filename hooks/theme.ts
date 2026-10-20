import type { EngineInterface } from 'claude-code'

import { bumpVersion, getFlags } from './flags'
import { applyPalette } from './palette'
import { PALETTES, type ThemeKind } from './palettes'
import { envVar, listConfig, logLine, readFile, redraw, runProcess } from './io'

export type { ThemeKind }

let current: ThemeKind = 'dark'

export const currentTheme = (): ThemeKind => current

/** A theme's base (`dark`, `light-daltonized`, `dark-ansi`…) as the palette class that reads on it. */
export function classifyTheme(base: string): ThemeKind {
  const light = base.includes('light')
  if (base.includes('ansi')) return light ? 'light-ansi' : 'dark-ansi'
  if (base.includes('daltonized')) return light ? 'light-cb' : 'dark-cb'
  return light ? 'light' : 'dark'
}

/** Paints with `kind` from the next drawing on; the caller redraws the screen. */
export function applyTheme(kind: ThemeKind): void {
  current = kind
  applyPalette(PALETTES[kind])
  bumpVersion()
}

/** Resolves the person's theme and paints with it, the screen redrawn. */
export async function refreshTheme($: EngineInterface, value?: string): Promise<void> {
  const kind = await resolveTheme($, value)
  if (kind === current) return
  applyTheme(kind)
  redraw($, 'ui.render')
}

/** macOS's appearance: `defaults` answers "Dark", and fails when the key is absent, which means light. */
async function systemIsDark($: EngineInterface): Promise<boolean> {
  const run = await runProcess($, ['defaults', 'read', '-g', 'AppleInterfaceStyle'])
  return run.exitCode === 0 && run.stdout.trim() === 'Dark'
}

/** A `custom:<name>` theme's base, from `~/.claude/themes/<name>.json`. */
async function customBase($: EngineInterface, name: string): Promise<string> {
  const home = (await envVar($, 'HOME')) ?? ''
  const parsed: unknown = JSON.parse(await readFile($, `${home}/.claude/themes/${name}.json`))
  const base = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).base : undefined
  if (typeof base !== 'string') throw new Error('no "base" field')
  return base
}

/** The palette class of a /config theme value. */
async function classOf($: EngineInterface, value: string): Promise<ThemeKind> {
  if (value === 'auto') return (await systemIsDark($)) ? 'dark' : 'light'
  if (value.startsWith('custom:')) return classifyTheme(await customBase($, value.slice('custom:'.length)))
  return classifyTheme(value)
}

/**
 * The palette for the person's theme, or the dark one with the reason logged: a theme the mod cannot read is said,
 * never guessed. With `tema` off, always the dark one.
 */
export async function resolveTheme($: EngineInterface, value?: string): Promise<ThemeKind> {
  if (!(await getFlags($)).tema) return 'dark'
  const theme = value ?? (await listConfig($)).find(row => row.key === 'theme')?.value
  if (typeof theme !== 'string') return 'dark'
  try {
    return await classOf($, theme)
  } catch (error) {
    logLine($, `realce: theme ${theme} not read (${error instanceof Error ? error.message : String(error)}); using the dark one`)
    return 'dark'
  }
}
