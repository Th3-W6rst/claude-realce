"""Prints a version's section of CHANGELOG.md, for its GitHub release.

  python3 scripts/release-notes.py 0.5.4
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
version = sys.argv[1]
text = (ROOT / 'CHANGELOG.md').read_text()
section = re.search(rf'^## {re.escape(version)}\n(.*?)(?=^## |\Z)', text, re.S | re.M)
if section is None:
    raise SystemExit(f'scripts/release-notes.py: CHANGELOG.md has no "## {version}" section')
print(section.group(1).strip())
