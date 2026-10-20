import type { EngineInterface } from 'claude-code'

import { logLine } from './io'

// What every area shares to read the engine's loose values and to fail out loud. A leaf: it imports only io.ts.

/** A thrown value as the words a log or a reason line says. */
export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** One area failing must not cost the others, nor the event itself: the failure is reported, never swallowed. */
export async function guard($: EngineInterface, event: string, run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (error) {
    logLine($, `realce: ${event} failed: ${errorText(error)}`)
  }
}

/** A value the engine hands over as `unknown`, read as a record: anything else reads as an empty one. */
export const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

export const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** Why a process failed, for a log line: its first line on stderr, or how it exited. */
export const failedRun = (run: { exitCode: number; stderr: string }, program: string): string =>
  run.stderr.split('\n').map(line => line.trim()).find(line => line !== '') ?? `${program} exited with ${run.exitCode}`
