import type { SessionEnv } from '../../types'

/** A path inside a URL: spaces and the like percent-encoded, the slashes kept, `#` and `?` too, or they would cut it. */
const encodePath = (path: string) => encodeURI(path).replace(/[#?]/g, c => encodeURIComponent(c))

export const fileUrl = (path: string) => `file://${encodePath(path)}`

/**
 * Where a path written in a reply opens: the editor's own URL scheme at the line
 * (`cursor://file/abs/x.ts:12:4`), or `file://` when no known editor is installed.
 */
export function pathHref(path: string, env: Pick<SessionEnv, 'cwd' | 'home' | 'editor'>): string {
  const [, file = path, line, column] = /^(.*?)(?::(\d+)(?::(\d+))?)?$/.exec(path) ?? []
  const absolute = file.startsWith('~/') ? env.home + file.slice(1) : file.startsWith('/') ? file : `${env.cwd}/${file}`
  const normalized = normalize(absolute)
  if (env.editor === 'file') return fileUrl(normalized)
  const at = line === undefined ? '' : column === undefined ? `:${line}` : `:${line}:${column}`
  return `${env.editor}://file${encodePath(normalized)}${at}`
}

function normalize(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}
