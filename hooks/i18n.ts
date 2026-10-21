import type { EngineInterface } from 'claude-code'
import { configs, redraw } from './io'

// The interface's language: Claude Code's own `language` setting, or the one the person picked with
// `/realce language`. English unless Portuguese is asked for. A leaf module: everything reads it, it reads nothing.

export type Lang = 'en' | 'pt'

/** A text in both languages, side by side where it is used. */
export type Text = { readonly en: string; readonly pt: string }

let fromConfig: Lang = 'en'
let picked: Lang | null = null
let changes = 0
let isConfigRead = false

/** The language every drawing and answer speaks now. */
export const lang = (): Lang => picked ?? fromConfig

/** True when the person picked the language with `/realce language`; false while it follows Claude Code's. */
export const isPicked = (): boolean => picked !== null

/** Changes whenever the language does: part of every memoized drawing's key, through flagsVersion. */
export const languageVersion = () => changes

/** The text in the language in force. */
export const tr = (en: string, pt: string): string => (lang() === 'pt' ? pt : en)

export const pick = (text: Text): string => text[lang()]

/** The text a table gives `key` in the language in force; a key the table does not know reads as it came. */
export const pickOr = (table: Readonly<Record<string, Text>>, key: string): string => (Object.hasOwn(table, key) ? pick(table[key]!) : key)

/** Claude Code's `language` value ("Brazilian Portuguese", "Portuguese", "pt-BR") as the interface's language. */
export function languageOf(value: unknown): Lang {
  // `pt`, `pt-BR` and `pt_BR` too: `\b` would miss the underscore, a word character.
  return typeof value === 'string' && /portugu|^pt([-_]|$)/i.test(value.trim()) ? 'pt' : 'en'
}

const moved = (before: Lang): boolean => {
  if (lang() === before) return false
  changes += 1
  return true
}

/** The person's own pick (`/realce language`), or null to follow Claude Code again; true when the language moved. */
export function setLanguage(next: Lang | null): boolean {
  const before = lang()
  picked = next
  return moved(before)
}

/** Claude Code's setting changed or was read; true when the language moved. */
function setConfigLanguage(next: Lang): boolean {
  const before = lang()
  fromConfig = next
  isConfigRead = true
  return moved(before)
}

/**
 * Claude Code's language, read once: the first prompt.compose runs before session.start, and the session keeps the
 * prompt it composed.
 */
export async function ensureLanguage($: EngineInterface): Promise<void> {
  if (!isConfigRead) await refreshLanguage($)
}

/** Reads Claude Code's language (or takes the value a `config.set` carries) and redraws what speaks it. */
export async function refreshLanguage($: EngineInterface, value?: unknown): Promise<boolean> {
  const setting = value ?? (await configs($)).find(row => row.key === 'language')?.value
  if (!setConfigLanguage(languageOf(setting))) return false
  redrawAll($)
  return true
}

/** A change every drawing and the aids the model is taught may speak: both are drawn again. */
export function redrawAll($: EngineInterface): void {
  redraw($, 'ui.render')
  redraw($, 'prompt.section')
}
