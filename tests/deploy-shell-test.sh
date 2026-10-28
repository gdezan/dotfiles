#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home"
unset STARSHIP_CONFIG
mkdir -p "$HOME/.config/fish" "$HOME/.config/systemd/user"
printf 'old fish config\n' > "$HOME/.config/fish/config.fish"
printf 'old agent unit\n' > "$HOME/.config/systemd/user/shell-ssh-agent.service"
printf 'old zsh config\n' > "$HOME/.zshrc"
printf 'old zsh environment\n' > "$HOME/.zshenv"
printf 'old Starship config\n' > "$HOME/.config/starship.toml"
"$repo/scripts/deploy-shell-config"
cmp "$repo/fish/config.fish" "$HOME/.config/fish/config.fish"
cmp "$repo/systemd/shell-ssh-agent.service" "$HOME/.config/systemd/user/shell-ssh-agent.service"
cmp "$repo/.zshrc" "$HOME/.zshrc"
cmp "$repo/zsh/zshenv" "$HOME/.zshenv"
cmp "$repo/starship.toml" "$HOME/.config/starship.toml"
backup=$(find "$HOME/.local/state/dotfiles-backups" -mindepth 1 -maxdepth 1 -type d -print -quit)
test -n "$backup"
grep -qx 'old fish config' "$backup/.config/fish/config.fish"
grep -qx 'old agent unit' "$backup/.config/systemd/user/shell-ssh-agent.service"
grep -qx 'old zsh config' "$backup/.zshrc"
grep -qx 'old zsh environment' "$backup/.zshenv"
grep -qx 'old Starship config' "$backup/.config/starship.toml"
"$repo/scripts/deploy-shell-config"
cmp "$repo/fish/config.fish" "$HOME/.config/fish/config.fish"

printf 'keep fish config\n' > "$HOME/.config/fish/config.fish"
if STARSHIP_CONFIG="$HOME/custom.toml" "$repo/scripts/deploy-shell-config" >/dev/null 2>&1; then
    echo 'deployment with a custom STARSHIP_CONFIG unexpectedly succeeded' >&2
    exit 1
fi
grep -qx 'keep fish config' "$HOME/.config/fish/config.fish"
cmp "$repo/starship.toml" "$HOME/.config/starship.toml"

incomplete="$tmp/incomplete"
mkdir -p "$incomplete/scripts" "$incomplete/fish" "$incomplete/systemd"
cp "$repo/scripts/deploy-shell-config" "$incomplete/scripts/"
cp "$repo/fish/config.fish" "$incomplete/fish/"
cp "$repo/systemd/shell-ssh-agent.service" "$incomplete/systemd/"
cp "$repo/.zshrc" "$incomplete/"
printf 'do not replace\n' > "$HOME/.config/fish/config.fish"
if "$incomplete/scripts/deploy-shell-config" >/dev/null 2>&1; then
    echo 'incomplete deployment unexpectedly succeeded' >&2
    exit 1
fi
grep -qx 'do not replace' "$HOME/.config/fish/config.fish"

rm "$HOME/.config/fish/config.fish"
mkdir "$HOME/.config/fish/config.fish"
printf 'do not replace\n' > "$HOME/.zshrc"
if "$repo/scripts/deploy-shell-config" >/dev/null 2>&1; then
    echo 'directory conflict unexpectedly succeeded' >&2
    exit 1
fi
grep -qx 'do not replace' "$HOME/.zshrc"
rmdir "$HOME/.config/fish/config.fish"
printf 'keep external file\n' > "$tmp/external"
ln -s "$tmp/external" "$HOME/.config/fish/config.fish"
"$repo/scripts/deploy-shell-config"
grep -qx 'keep external file' "$tmp/external"
test ! -L "$HOME/.config/fish/config.fish"
cmp "$repo/fish/config.fish" "$HOME/.config/fish/config.fish"
printf 'deploy-shell-test passed\n'
