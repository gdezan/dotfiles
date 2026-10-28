#!/usr/bin/env bash
set -euo pipefail
if [[ $(uname -s) != Darwin ]]; then
    printf 'macos-shell-test skipped: not macOS\n'
    exit 0
fi
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home"
mkdir -p "$HOME/.config/fish" "$HOME/.local/bin"
cp "$repo/fish/config.fish" "$HOME/.config/fish/config.fish"
printf 'set -gx MACOS_LOCAL_MARKER loaded\n' > "$HOME/.config/fish/local-macos.fish"
printf '#!/bin/sh\nprintf "set -gx FNM_TEST_MARKER initialized\\n"\n' > "$HOME/.local/bin/fnm"
chmod +x "$HOME/.local/bin/fnm"
env -i HOME="$HOME" USER="${USER:-test}" PATH=/usr/bin:/bin TERM=xterm-256color "$(command -v fish)" <<'FISH'
test "$MACOS_LOCAL_MARKER" = loaded; or exit 1
test "$FNM_TEST_MARKER" = initialized; or exit 1
FISH
printf 'macos-shell-test passed\n'
