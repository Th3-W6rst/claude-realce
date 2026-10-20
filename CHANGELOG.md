# What's new in realce

Versions from October 19 to 20, 2026. Those that only changed internals are left out.

## 0.5.3
- The proof seal reads English claims: `[!DONE]`, "tests pass", "passing", "resolved". It knew only "all tests pass",
  so "All 4 tests pass" left the turn with no seal.
- README: pictures of a real session, and what the mod reads, runs and sends.

## 0.5.2
- Perf files (`~/.cache/realce/perf-<session>.json`) a week old are removed when a session starts; they piled up, one
  per session.
- `claude plugin validate` reports everything the mod reaches, no longer cut short (catalogues read that report).

## 0.5.1
- The first system prompt of a session is already in your language (it was built before the language was read).
- `/realce language` alone says the language in force and where it comes from; so does `/realce status`.
- Limit warnings, commit cards and cut-short explanations switch language with the interface; a limit you hid stays
  hidden across a switch. An open session pane takes the new title.
- `pt_BR` reads as Portuguese.

## 0.5.0
- The interface speaks English, or Portuguese for whoever set Claude Code to Portuguese: it follows Claude Code's
  `language` setting, and `/realce language en|pt|auto` picks one.
- Every command and flag has an English name (`/realce help`, `/realce focus`, `/realce column off`); the Portuguese
  names keep working.
- Claude is taught the callout tags and the change phrase of your language (`[!DECISION]`, "from X to Y"); both
  languages' tags and phrases are read.
- The Haiku explains errors and selections in the interface's language; decimals use a dot in English.
- The README, CHANGELOG and CONTRIBUTING are in English; the repository has a license: MIT.

## 0.4.40
- `/realce status` always says the installed version (handy when reporting a problem).
- README: when an arrow gets a difference.

## 0.4.39
- "(last: …)" knows the same test run under `CI=1`, `timeout 120` or with its output redirected (`> out.log`).
- The why in `/realce summary` goes away with the `errors` flag off, as in the pane.

## 0.4.38
- README: the session pane shows each failure's why, and the summary each turn's duration.

## 0.4.37
- An arrow between bare numbers ("tests 4 → 8") no longer gets a false difference: it is an input → output. An arrow
  with a unit ("22 ms → 9 ms") and "from X to Y" still do.

## 0.4.36
- `/realce summary` carries the last failure's explanation, once the Haiku has answered.

## 0.4.35
- The session pane shows the Haiku's explanation under each failure as soon as it arrives.

## 0.4.34
- Two different tools running at once read as one phrase in the spinner: "Reading and searching".
- Long names in the spinner are cut without splitting an emoji.

## 0.4.33
- "Running the tests (last: …)" knows the same test behind another filter (`pytest -q | tail -1` and
  `cd . && pytest -q 2>&1 | tail -3`).

## 0.4.32
- `/realce summary` shows how long each turn took.
- The demo turn's rule shows the time, as the others do.

## 0.4.31
- A `grep` at the end of a chain (`npm run build && grep -q ok`) no longer hides a real build failure: it only counts
  as an answer when nothing else in the command can fail.
- Output with no exit code (a timeout, a refusal) does not count as an answer.
- The spinner skips heredoc bodies and `#` comments, and reads `PYTHONPATH=./src pytest` and `2>&1`.
- Focus mode: after the mod reloads, the row and the result of a `grep` with no match go away together.

## 0.4.30
- Fix for 0.4.29: in a folded group, a `grep` with a real error counts as "failed" again.

## 0.4.29
- A `grep` with no match, a false `test -f` or a `which` that found nothing show as an answer ("no match"), not as
  an error, and stay out of "Failures"; with exit code 2 (a file that does not exist) they stay errors.
- An interrupted command does not count as a failure.
- The spinner names skills ("Loading the skill …"), plan updates and MCP tools.

## 0.4.28
- `/realce demo`: the yellow example reads as an example ("approve the deploy (example)"), and the reply says it goes
  up to the band above the prompt; the README pictures are redrawn.

## 0.4.27
- While the tests run, the spinner says how long the same command took last time: "Running the tests (last: 6.2s)".

## 0.4.26
- The timeline shows a plugin's prompt (such as `/realce demo`'s) by its own words, without Claude Code's frame.

## 0.4.25
- The turn's rule no longer shows "0 files" or "0 tools".
- An error's explanation speaks of the command, not of "you", in one short sentence.
- The spinner knows more test commands (`npm --prefix app test`, `yarn test:unit`, `.venv/bin/python -m pytest`,
  `pnpm vitest run`) and no longer mistakes a commit whose message mentions tests.

## 0.4.24
- "Needs you" keeps the code quoted in what is asked (`@pytest.mark.slow` went missing).
- A long error explanation wraps indented, under itself.

## 0.4.23
- A command that ends by touching files (a pytest writing caches) no longer keeps the "running" icon.
- Claude learns the color marks from real examples and no longer writes `{!attention!}` as a tag.

## 0.4.22
- The spinner says what runs now: "Running the tests", "Editing render.tsx", "Reading 3 files",
  "Delegating: Review the diff".

## 0.4.21
- A stricter proof seal: a document quoting "12 examples, 0 failures" or a "# tests 3" heading no longer counts as a
  test run; Deno is read with filtered tests, steps and times in minutes.
- `/realce print` on an ANSI theme comes out in the light or dark theme's colors.
- `/realce summary`: says when it shows only the last 50 turns or the last 20 failures; multi-line commands do not
  break the markdown; in the conversation it shows without the markdown marks.
- The context in the pane turns yellow from 90%, as its warning does.
- A refused scroll says the real reason.

## 0.4.20
- `/realce doctor` checks what the machine gives realce (Claude Code's version, 24-bit color, macOS, fullscreen,
  editor, mermaid-cli, headless Chrome) and says what to install.

## 0.4.19
- `/realce explain <text>` explains the text written, with no selection needed (useful outside fullscreen).
- `/realce summary` lists the last ten turns, each with its seal.

## 0.4.18
- "1 test" in the singular in the summary and in the "While you were away" band.

## 0.4.17
- Long replies get a "Copy reply" button; `/realce copy` copies the last reply.
- `/realce summary` shows and copies a summary of the session in markdown (turns and seals, tests, files, git,
  failures), ready to paste into a PR or a report.

## 0.4.16
- The README is laid out for someone who just installed it: requirements, the cost of the features that use the
  Haiku, how to pause and remove it, first steps with a concrete example. The development guide moved to
  [CONTRIBUTING](CONTRIBUTING.md).

## 0.4.15
- The flags pane has a button that turns the whole of realce on and off.
- `/realce explain`'s explanation closes from the pane itself.
- `/realce status` counts how many errors the Haiku explained this session (at most 20).

## 0.4.14
- Session pane: each touched file opens in the editor, and each failure scrolls to its command in the conversation.

## 0.4.13
- ANSI themes: the colors follow the terminal's 16 colors (they used to be fixed shades).

## 0.4.12
- The test score and the proof seal also read `node --test`, RSpec and Deno.

## 0.4.11
- Claude knows the rule seals the turn by its tests, and runs the tests before saying it is done.
- The welcome hint names `/realce help`.

## 0.4.10
- The session pane has a usage line: the context and the 5-hour and 7-day windows, colored by how much is used.

## 0.4.9
- Limit warning: the context warns from 90%; a reset more than a day away says its date; while Claude works, the plan
  bar comes first.
- The macOS notice never delays Claude's question.
- Print: the right height even with a diagram that did not become a picture.

## 0.4.8
- `/realce help` lists the commands; the update status points to this CHANGELOG.

## 0.4.7
- `/realce status` says whether fullscreen is on and what depends on it.
- `/realce print` works with spaces in the path.

## 0.4.6
- Light theme: the diff's changed words with the right contrast.

## 0.4.4
- End-of-turn notice through the macOS banner when the terminal has no notification channel (tmux, Terminal.app).
- The flags pane shows one line per flag.
- Limit warning (flag `limits`): a band when the 5-hour or 7-day window, or the context, nears its end.
- Human numbers also with the unit before the number ("tokens: 73201").

## 0.4.1
16 new features, each with its own flag:
- **Theme:** colors for light backgrounds, color blindness and ANSI, following Claude Code's theme.
- **Clarity:** the proof seal on the turn's rule, word diffs, commit cards, explained command errors (Haiku).
- **Attention:** a notice when a long turn ends or Claude asks something, an optional sound, "While you were away",
  the turns' timeline in the pane, a header on questions.
- **Reading:** human numbers, `/realce explain`, `/realce pin`, `/realce focus`.
- **System:** `/realce print`, `/realce demo`, the update notice.

## 0.3.1
- Claude is taught to draw diagrams from the first message on.

## 0.3.0
- Every flag on by default (focus mode and the sound came later, off); install from GitHub.
