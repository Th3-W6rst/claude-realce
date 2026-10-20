// Lets bun load the mod's modules outside Claude Code: the engine's runtime names become inert stand-ins.
import { plugin } from 'bun'

plugin({
  setup(build) {
    build.module('claude-code', () => ({ exports: { atom: (ref: unknown, initial: unknown) => ({ ref, initial }), read: () => undefined, update: () => undefined }, loader: 'object' }))
  },
})
;(globalThis as Record<string, unknown>).h = () => null
