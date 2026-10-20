"""Checks that `claude plugin validate` reports the mod's whole footprint: the validator cuts each note at 1,000
characters ("… [+745 chars]"), and a cut list of calls is no footprint at all for the catalogues that read it
(awesome-claude-code-mods holds such a mod back for review). Engine calls go through hooks/io.ts so the list stays short.

  python3 scripts/footprint.py   exit 1 when a note is cut; print how much room the calls note has left
"""
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIMIT = 1000
CUT = re.compile(r'\[\+\d+ chars?\]$')

report = json.loads(subprocess.run(['claude', 'plugin', 'validate', '--json', str(ROOT)], capture_output=True, text=True, check=True).stdout)
notes = [note for content in report['contents'] for note in content['notes']]
cut = [note for note in notes if CUT.search(note)]
calls = next((note for note in notes if ' calls: ' in note), None)
if cut:
    for note in cut:
        print(f'scripts/footprint.py: the validator cut this note: {note[:120]}…', file=sys.stderr)
    raise SystemExit(1)
if calls is None:
    raise SystemExit('scripts/footprint.py: no "calls:" note in the validator report')
print(f'calls note: {len(calls)} of {LIMIT} characters ({LIMIT - len(calls)} left)')
