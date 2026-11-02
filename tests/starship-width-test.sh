#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
if ! command -v starship >/dev/null; then
    printf 'starship-width-test skipped: Starship is not installed\n'
    exit 0
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/home/.config/fish" "$tmp/important-directory"
cp "$repo/fish/config.fish" "$tmp/home/.config/fish/config.fish"
cd "$tmp/important-directory"
git init -q
git checkout -q -b very-long-branch-name-for-testing
printf '{"name":"test","version":"1.2.3"}\n' > package.json
export HOME="$tmp/home" STARSHIP_CONFIG="$repo/starship.toml" TERM=xterm-256color
fish_bin=$(command -v fish)
render() {
    "$fish_bin" -i -c "set -g COLUMNS $1; fish_prompt"
}
render 100 > "$tmp/wide"
render 25 > "$tmp/narrow"
render 12 > "$tmp/tiny"
"$fish_bin" -i -c 'set -g COLUMNS 25; false; fish_prompt' > "$tmp/error"
python3 - "$tmp" <<'PY'
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
ansi = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')
wide = ansi.sub('', (root / 'wide').read_text())
narrow = ansi.sub('', (root / 'narrow').read_text())
tiny = ansi.sub('', (root / 'tiny').read_text())
assert 'important-directory' in wide and 'very-long-branch-name-for-testing' in wide, wide
assert 'important-directory' in narrow, narrow
assert 'very-long-branch-name-for-testing' not in narrow, narrow
assert any(s in narrow for s in ('…', '...')) and any(s in tiny for s in ('…', '...')), (narrow, tiny)
assert 'important-' in tiny, tiny
assert all(len(line) < 25 for line in narrow.splitlines()), narrow
assert all(len(line) < 12 for line in tiny.splitlines()), tiny
assert narrow.rstrip().endswith('❯') and tiny.rstrip().endswith('❯'), (narrow, tiny)
assert '\x1b[1;31m❯' in (root / 'error').read_text(), 'error status did not produce a red prompt'
PY
printf 'starship-width-test passed\n'
