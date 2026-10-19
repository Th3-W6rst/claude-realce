export type Diagram =
  | { status: 'rendering' }
  | { status: 'ready'; file: string; width: number; height: number }
  | { status: 'failed'; error: string }

export type Editor = 'cursor' | 'vscode' | 'zed' | 'file'

export type SessionEnv = { cwd: string; home: string; editor: Editor; tzOffsetMinutes: number; mmdc: string | null }

export type TestScore = { runner: string; passed: number; failed: number; skipped: number; seconds?: number; unit: 'testes' | 'pacotes' }

export type OpenTurn = { startedAt: number; tools: number; files: string[]; tests: TestScore | null }

export type TurnStats = { endedAt: number; tools: number; files: number; tests: TestScore | null }

export type FileTouch = { path: string; added: number; removed: number; edits: number; at: number }

export type Failure = { command: string; line: string; at: number }

export type PendingItems = { items: string[]; turnId: string }

export type PlanItem = { id?: string; text: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }

export type AgentRow = { id: string; type: string; description: string; status: string; firstSeenAt: number }

// The engine's scan lists what each file reads and writes, so every file declares the atoms it uses itself:
// `const X = atom({ plugin: 'realce', key: '<key>' } as const, <initial>)`, with these initial values:
// diagrams {}, env null, turn null, turns {}, files [], failures [], pending null, plan [], agents [],
// paneOpen false; folds is a family, read as `{ plugin: 'realce', key: 'folds', id }`.
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
    }
  }
}
