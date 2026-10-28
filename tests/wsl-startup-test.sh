#!/usr/bin/env bash
set -euo pipefail
if [[ $(uname -r) != *[Mm]icrosoft* ]]; then
    echo 'wsl-startup-test skipped: not WSL'
    exit 0
fi
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp "$repo/zsh/zshenv" "$tmp/.zshenv"
env -i HOME="$HOME" USER="$USER" PATH=/usr/local/bin:/usr/bin:/bin \
    CONFIG="$repo/fish/config.fish" fish --no-config -c \
    'source "$CONFIG"; and command -q node'
env -i HOME="$HOME" USER="$USER" PATH=/usr/local/bin:/usr/bin:/bin \
    ZDOTDIR="$tmp" zsh -c '(( $+commands[node] ))'
echo 'wsl-startup-test passed'
