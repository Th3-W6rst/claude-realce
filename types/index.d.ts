export type Diagram =
  | { status: 'rendering' }
  | { status: 'ready'; file: string; width: number; height: number }
  | { status: 'failed'; error: string }

export type Editor = 'cursor' | 'vscode' | 'zed' | 'file'

export type SessionEnv = { cwd: string; home: string; editor: Editor; tzOffsetMinutes: number; mmdc: string | null }

export type TestScore = { runner: string; passed: number; failed: number; skipped: number; seconds?: number; unit: 'testes' | 'pacotes' }

export type Seal = 'proved' | 'failing' | 'unproved'

/** `testsSinceEdit`: the last test score seen after the turn's last edit (an edit clears it), subagents' too. */
export type OpenTurn = { startedAt: number; tools: number; files: string[]; tests: TestScore | null; hasEdits: boolean; testsSinceEdit: TestScore | null }

export type TurnStats = { endedAt: number; tools: number; files: number; tests: TestScore | null; seal: Seal | null }

export type Explanation = { status: 'pending' } | { status: 'ready'; text: string } | { status: 'failed'; reason: string }

export type AwaySummary = { minutes: number; turns: number; files: number; tests: TestScore | null; seal: Seal | null; pending: number }

export type TimelineRow = { requestId: string; at: number; prompt: string; durationMs: number | null; seal: Seal | null; tests: TestScore | null }

export type ExplainPanel = { excerpt: string; status: 'pending' | 'ready' | 'failed'; text: string }

export type Pin = { requestId: string; at: number; preview: string }

export type LimitWarning = { kind: 'rate' | 'context'; label: string; percent: number; resetsAt: number | null }

export type UsageReading = { context: number | null; windows: { label: string; percent: number }[] }

export type FileTouch = { path: string; added: number; removed: number; edits: number; at: number }

export type Failure = { command: string; line: string; at: number }

export type PendingItems = { items: string[]; turnId: string }

export type PlanItem = { id?: string; text: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }

export type AgentRow = { id: string; type: string; description: string; status: string; firstSeenAt: number }

// The engine's scan lists what each file reads and writes, so every file declares the atoms it uses itself:
// `const X = atom({ plugin: 'realce', key: '<key>' } as const, <initial>)`, with these initial values:
// diagrams {}, env null, turn null, turns {}, files [], failures [], pending null, plan [], agents [],
// paneOpen false, explanations {}, commits {}, away null, timeline [], explain null, pins [], limit null, usage null; folds is a family, read as `{ plugin: 'realce', key: 'folds', id }`.
declare module 'claude-code' {
  interface PluginState {
    realce: {
      folds: StateFamily<boolean>
      diagrams: Record<string, Diagram>
      env: SessionEnv | null
      turn: OpenTurn | null
      turns: Record<string, TurnStats>
      files: FileTouch[]
      failures: Failure[]
      pending: PendingItems | null
      plan: PlanItem[]
      agents: AgentRow[]
      paneOpen: boolean
      explanations: Record<string, Explanation>
      /** A git command's short card ('● commit 9cd805a') by its tool_use_id, for the folded group that holds it. */
      commits: Record<string, string>
      away: AwaySummary | null
      timeline: TimelineRow[]
      explain: ExplainPanel | null
      pins: Pin[]
      limit: LimitWarning | null
      usage: UsageReading | null
    }
  }
}
