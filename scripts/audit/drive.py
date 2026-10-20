"""Drives a Claude session running in tmux and measures key-to-screen latency, for auditing the mod's cost.

The session runs in fullscreen (CLAUDE_CODE_NO_FLICKER=1) inside tmux session `rlc`; a Ghostty window can attach to
it to watch (`open -na Ghostty --args -e tmux attach -t rlc`). Latency is from sending a key to the first change of
tmux's screen: the app's own reaction, Ghostty's paint aside.

  drive.py screen                 print the visible screen
  drive.py prompt "<text>"        type a prompt, press Enter, wait for the turn to end
  drive.py keys <key> [<key>...]  send tmux key names (PageUp, C-o, Escape, Enter...)
  drive.py measure <label> <out>  one latency run (typing, scroll, expand), appended to <out> as a JSON line
  drive.py compare <label> <out>  a run with the mod on, then one with `/realce off`, and the mod back on whatever happens
"""
import json
import statistics
import subprocess
import sys
import time

SESSION = 'rlc'


def tmux(*args: str) -> str:
    return subprocess.run(['tmux', *args], capture_output=True, text=True, check=True).stdout


def screen() -> str:
    return tmux('capture-pane', '-p', '-t', SESSION)


def keys(*names: str) -> None:
    tmux('send-keys', '-t', SESSION, *names)


def wait_idle(timeout: float = 900.0, quiet: float = 3.0) -> None:
    """Idle once no line says the turn runs and the screen held still for `quiet` seconds."""
    start = time.time()
    last, since = screen(), time.time()
    while time.time() - start < timeout:
        time.sleep(0.5)
        now = screen()
        if now != last:
            last, since = now, time.time()
        elif 'to interrupt' not in now and time.time() - since >= quiet and time.time() - start > 4:
            return
    raise TimeoutError('the turn did not end')


def prompt(text: str) -> None:
    keys('-l', text)
    keys('Enter')
    wait_idle()


def latency(*key: str, timeout: float = 3.0) -> float | None:
    """Milliseconds from sending `key` to the first change of the screen; None when nothing changed."""
    before = screen()
    t0 = time.perf_counter()
    keys(*key)
    while time.perf_counter() - t0 < timeout:
        if screen() != before:
            return (time.perf_counter() - t0) * 1000
        time.sleep(0.002)
    return None


def series(n: int, *key: str) -> list[float]:
    out = []
    for _ in range(n):
        ms = latency(*key)
        if ms is not None:
            out.append(round(ms, 1))
        time.sleep(0.25)
    return out


def summary(values: list[float]) -> dict:
    if not values:
        return {'n': 0}
    ordered = sorted(values)
    return {'n': len(values), 'median': statistics.median(values), 'p90': ordered[max(0, int(len(ordered) * 0.9) - 1)], 'max': ordered[-1]}


def run(label: str) -> dict:
    result: dict = {'label': label, 'at': time.strftime('%H:%M:%S')}
    result['typing'] = summary(series(15, '-l', 'a'))
    keys('C-u')
    time.sleep(0.5)
    result['scroll_up'] = summary(series(12, 'PageUp'))
    result['scroll_down'] = summary(series(12, 'PageDown'))
    result['expand'] = summary([v for v in [latency('C-o')] if v is not None])
    time.sleep(1.0)
    result['expanded_scroll_up'] = summary(series(12, 'PageUp'))
    result['expanded_scroll_down'] = summary(series(12, 'PageDown'))
    result['collapse'] = summary([v for v in [latency('C-o')] if v is not None])
    time.sleep(1.0)
    return result


if __name__ == '__main__':
    cmd, *rest = sys.argv[1:]
    if cmd == 'screen':
        print(screen())
    elif cmd == 'prompt':
        prompt(rest[0])
        print(screen())
    elif cmd == 'keys':
        keys(*rest)
        time.sleep(1)
        print(screen())
    elif cmd == 'measure':
        label, out = rest
        result = run(label)
        with open(out, 'a') as f:
            f.write(json.dumps(result, ensure_ascii=False) + '\n')
        print(json.dumps(result, ensure_ascii=False))
    elif cmd == 'compare':
        label, out = rest
        results = [run(f'{label}-on')]
        # `/realce off` is stored for the person's install: every session of theirs would start off without the `on`.
        try:
            keys('-l', '/realce off')
            keys('Enter')
            time.sleep(2)
            results.append(run(f'{label}-off'))
        finally:
            keys('-l', '/realce on')
            keys('Enter')
            time.sleep(2)
        with open(out, 'a') as f:
            for r in results:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
        for r in results:
            print(r['label'], {k: v.get('median') for k, v in r.items() if isinstance(v, dict)})
