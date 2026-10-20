// What a tool call's input and stored result say, read loosely: rows and tracking see `unknown` from the engine.

export const EDIT_TOOLS: ReadonlySet<string> = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

export const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** Lines a text holds; a final newline ends the last line rather than opening another. */
export function lineCount(text: string): number {
  if (text === '') return 0
  return text.replace(/\n$/, '').split('\n').length
}

/** The file an editing tool wrote, or null. */
export const editedPath = (input: unknown): string | null => str(asRecord(input).file_path) ?? str(asRecord(input).notebook_path)

export type EditCounts = { added: number; removed: number; isNew: boolean }

/** Lines an edit added and removed: from the stored diff once the call settled, else from what the model sent. */
export function editCounts(tool: string, input: unknown, output?: unknown): EditCounts {
  const out = asRecord(output)
  const isNew = tool === 'Write' && out.type === 'create'
  const patch = out.structuredPatch
  if (Array.isArray(patch) && (patch.length > 0 || !isNew)) {
    let added = 0
    let removed = 0
    for (const hunk of patch) {
      const lines = asRecord(hunk).lines
      for (const line of Array.isArray(lines) ? lines : []) {
        if (typeof line !== 'string') continue
        if (line.startsWith('+')) added++
        else if (line.startsWith('-')) removed++
      }
    }
    return { added, removed, isNew }
  }
  const inp = asRecord(input)
  if (tool === 'Write') return { added: lineCount(str(inp.content) ?? ''), removed: 0, isNew }
  if (tool === 'NotebookEdit') return { added: lineCount(str(inp.new_source) ?? ''), removed: lineCount(str(out.old_source) ?? ''), isNew: false }
  const edits = tool === 'MultiEdit' && Array.isArray(inp.edits) ? inp.edits.map(asRecord) : [inp]
  return {
    added: edits.reduce((n, ed) => n + lineCount(str(ed.new_string) ?? ''), 0),
    removed: edits.reduce((n, ed) => n + lineCount(str(ed.old_string) ?? ''), 0),
    isNew,
  }
}

/** Whether a Bash call changed files in the working tree (`sed -i`, a heredoc, a formatter), as the engine saw it. */
export function hasBashEdits(output: unknown): boolean {
  const diff = asRecord(asRecord(output).bashEditDiff)
  const files = Array.isArray(diff.files) ? diff.files.length : 0
  const changed = Array.isArray(diff.changedFiles) ? diff.changedFiles.length : 0
  return files + changed + (typeof diff.moreFiles === 'number' ? diff.moreFiles : 0) > 0
}

/** The line that says what went wrong: the output's last, past the engine's "Exit code N", at most 300 characters. */
export function failureLine(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '' && !/^Exit code \d+$/.test(l))
  return (lines[lines.length - 1] ?? '').slice(0, 300)
}

/** What a Bash call printed: the stored record's streams, or the text the model read when it errored. */
export function bashText(output: unknown): string {
  if (typeof output === 'string') return output
  const out = asRecord(output)
  return [str(out.stdout), str(out.stderr)].filter((s): s is string => s !== null && s !== '').join('\n')
}

/** A path shown from the session's directory when it lies inside it. */
export function shortPath(path: string, cwd: string | null): string {
  if (cwd !== null && cwd !== '' && path.startsWith(`${cwd.replace(/\/$/, '')}/`)) return path.slice(cwd.replace(/\/$/, '').length + 1)
  return path
}
