# Working on realce

## Run and check

Installed from a local marketplace (a folder, as `/plugin marketplace add <folder>` does), Claude Code runs the mod
from that folder itself: every new session loads what the folder holds then, uncommitted edits included. Installed
from GitHub, it runs a copy in `~/.claude/plugins/cache/`. To develop, run a session from the folder, which reloads on
every edit:

```sh
claude --plugin-dir .                    # a session with the folder's mod
scripts/test-only.sh band.test.tsx       # only the tests of what you touched (a few seconds)
claude plugin test .                     # the whole suite (about 20 s; each file runs in a worker of its own)
tsc -p .                                 # types (Claude Code writes .claude-plugin/types when it loads the mod)
claude plugin validate .                 # what Claude Code would refuse at load
python3 scripts/flags-table.py --check   # the README's flags table and "Current version" match the code
python3 scripts/footprint.py             # the validator reports every engine call, uncut
```

On GitHub, `.github/workflows/test.yml` runs the same checks but `tsc` on every push and pull request, against the
latest Claude Code (the types come from a session that loaded the mod, which a runner has none of: type-check before
you push). A push whose `plugin.json` version has no release yet gets one, its notes taken from that version's
CHANGELOG section (`python3 scripts/release-notes.py <version>`); a version without a section fails the release.

Changed a flag or the version? `python3 scripts/flags-table.py` rewrites the README's table and its "Current version".
Changed the demo text? `bun --preload ./scripts/bun-stub.ts scripts/demo-images.ts` redraws the README's two pictures
(it needs mermaid-cli and the headless browser: the README's Diagrams section).

## Layout

`hooks/register.tsx` is the module Claude Code loads. Each folder under `hooks/` is one area, and each area is one of
the README's flag groups:

| Folder | Group | What it draws or does |
|---|---|---|
| `hooks/text/` | Text | A reply's prose: marks, callouts, tables, deltas, human numbers |
| `hooks/code/` | Code | Code blocks, diagrams and the links of paths, inside a reply |
| `hooks/screen/` | Tools | Tool rows, the diff, the turn's rule and seal, commit and agent cards, explained errors, the spinner |
| `hooks/orient/` | Guidance | The band above the prompt, the panes, notices, limits, the away summary, pins, the timeline |
| `hooks/system/` | System | Print, demo, doctor, status, summary, the update notice |

Two flags live outside their group's folder: `spinner` (Guidance) in `hooks/screen/spinner.ts`, beside the tool calls
it names, and `tema` (System) in `hooks/theme.ts`. Beside the areas: `events.ts` (the shared events), `io.ts` (every
engine call), `flags.ts`, `i18n.ts`, `fit.tsx` (cutting text to cells), `format.ts`, `memo.ts`, `safe.ts`,
`layout.ts` (sizes), `palette.ts` and `paletteSets.ts` (colors), `theme.ts`, `perf.ts` and `prompt.ts` (the system
prompt section). `types/index.d.ts` is the contract of the mod's `$.state` values. The tests mirror the modules
(`tests/band.test.tsx` for `hooks/orient/band.tsx`); `tests/world.tsx` holds the engine stand-ins several of them
share.

## Two languages

The interface speaks English or Portuguese (`hooks/i18n.ts`): Claude Code's `language` setting decides, and
`/realce language en|pt|auto` overrides it. Every text a person reads is written in both, side by side where it is
used: `tr('Running the tests', 'Rodando os testes')`, or a `{ en, pt }` record read with `pick`. Flags keep their
first, Portuguese ids (they are the keys in the store), with an English `alias`; commands take either name. Log lines
(`$.ui.log`) and code comments are English only.

The plugin runs in its own worker in tests: what it speaks is seen in its answers and drawings, set through the store
(`mock.store(on, { language: 'en' })`). The suite was written against the Portuguese interface: each test file
imports `tests/lang.ts` and pins Portuguese with `PT`; `tests/i18n.test.tsx` covers English. `erros` and `pendencias`
start off: a test of either turns them on with `PT_ALL` (or `OPT_IN`) from `tests/lang.ts`.

## API rules that bring the whole module down

1. One hook per event without a matcher in the module: the shared events go through `hooks/events.ts`, which calls
   the handler of each area that listens (`hooks/<area>/events.ts`). An event only one module listens to is hooked
   there: `prompt.compose` in `prompt.ts`, `session.measure` in `orient/limits.ts`, `prompt.edit` in `orient/away.ts`.
2. `on(...)` only in functions declared at the top level; `$` only goes into `function` declarations (never an arrow
   const kept in a list, a map or a spread).
3. Each `$.state` value's reference is declared in the file that uses it (`atom({ plugin: 'realce', key } as const,
   initial)`) and in the contract `types/index.d.ts`.
4. In tests, the stand-in for a `$` call answers `{ value }`; the mocks come before the first `$`; stand-ins with a
   matcher come before the catch-alls; `Text` takes no `key` (use `Box`).
5. A local variable named `h` breaks JSX (the factory is `h`).
6. The system prompt of a session the mod joined by hot reload is not composed again.
7. `ToolUse.isRunning` can stay `true` on a call that already resolved (a Bash call that touched files): what runs is
   `isStillRunning` (`hooks/screen/tools.tsx`), with no `output` yet.
8. The rule finds the turn's stats by `durationMs` (`TurnDuration` carries no turn id). On the turn an agent's notice
   opens, `TurnDuration` measures from the person's last prompt and `turn.complete` the turn alone: the two do not
   match, and that rule keeps the duration only.
9. The mod's own `$.prompt.submit` does not go through its own `prompt.submit` hook: the demo's turn opens at
   `turn.step`.
10. A shared site is composed, never taken: the band above the prompt draws its notice over `await next(e)`, which
    holds Claude Code's and other mods' content, and leaves it the rows it takes (`rowsOf` in
    `hooks/orient/band.tsx`). Claude Code refuses its own node (`{ type: 'engine' }`) under a Box with `width`,
    `height`, `minWidth`, `minHeight`, `position`, `top`, `left`, `right`, `bottom`, `display` or `overflow`: the Box
    that wraps it takes none of them.
11. The store is shared by every open session, each with its own copy of the flags: a write starts from what the store
    holds now (`setFlag`), never from the copy, or it undoes what another session changed.

## What the mod reaches

Every engine call that reaches past drawing (processes, files, the network, the model, settings, the store, the
session, the screen's side effects) goes through `hooks/io.ts`, one short function per call. `claude plugin validate`
names the function each call sits in and cuts its report at 1,000 characters; catalogues such as
[awesome-claude-code-mods](https://github.com/karanb192/awesome-claude-code-mods) show that report as the mod's
footprint, and hold a cut one back. `python3 scripts/footprint.py` fails on a cut and says how much room is left. Calls
made right in a hook (`$.state`, `$.ui.resolve`, `$.clock.now`) stay there. `$.env.get` takes its name as a literal, so
`envVar` has one branch per variable.

## Performance

The flags, the language and the session's environment live in memory (read once per load), and no drawing reads or
writes the store, since each read would subscribe the row to redraw on every write. Each reply keeps one parse of its
blocks (a streaming reply too), each line's spans and each table's layout are memoized by their text, and each tool
row, group and score by the call's state: scrolling back returns the drawing ready. Commit and error notes live in a
module cache; word diffs are computed once per edited pair, only for the lines shown. Each drawing hook's times show
in `/realce status` and in `~/.cache/realce/perf-<session>.json` (every 10 s).

The latency audit (tmux + Ghostty): `python3 scripts/latency-audit.py compare <label> <out.jsonl>` measures with the
mod on and with `/realce off`, and turns the mod back on at the end (the `off` is stored in the measuring person's
install).
