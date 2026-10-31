#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/stdin"
cat > "$tmp/bin/ssh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$SSH_LOG"
count=$(wc -l < "$SSH_LOG")
cat > "$STDIN_DIR/$count"
if [[ ${FAIL_DEPLOY:-0} == 1 && "$*" == *deploy-herdr-config* ]]; then
    exit 1
fi
EOF
chmod +x "$tmp/bin/ssh"
export PATH="$tmp/bin:$PATH"
export SSH_LOG="$tmp/ssh.log"
export STDIN_DIR="$tmp/stdin"
reset_log() {
    : > "$SSH_LOG"
    rm -rf "$tmp/stdin"
    mkdir -p "$tmp/stdin"
}
reset_log

if "$repo/scripts/deploy-herdr-remote" >/dev/null 2>&1; then
    echo 'deployment without a host unexpectedly succeeded' >&2; exit 1
fi
grep -q 'Usage:' <("$repo/scripts/deploy-herdr-remote" 2>&1) || { echo 'missing usage text' >&2; exit 1; }
test ! -s "$SSH_LOG"

"$repo/scripts/deploy-herdr-remote" iss >"$tmp/out" 2>&1
grep -qx 'Copying Herdr configuration to iss:~/herdr-remote-deploy-.*' "$tmp/out"
test "$(wc -l < "$SSH_LOG")" -eq 4
grep -q '^iss bash -c .mkdir -p ~/herdr-remote-deploy-' "$SSH_LOG"
grep -q '^iss bash -c .tar -xzf - -C ~/herdr-remote-deploy-' "$SSH_LOG"
grep -q '^iss bash -c .cd ~/herdr-remote-deploy-.*&& bash scripts/deploy-herdr-config' "$SSH_LOG"
grep -q '^iss bash -c .rm -rf ~/herdr-remote-deploy-' "$SSH_LOG"

tar tzf "$tmp/stdin/2" > "$tmp/tarball.txt"
grep -qx 'herdr-app/layouts/gd.json' "$tmp/tarball.txt"
grep -qx 'herdr-app/mods/source/main.js' "$tmp/tarball.txt"
grep -qx 'scripts/deploy-herdr-config' "$tmp/tarball.txt"
if grep -q 'node_modules/' "$tmp/tarball.txt"; then
    echo 'payload unexpectedly contains node_modules' >&2; exit 1
fi
test ! -s "$tmp/stdin/1"
test ! -s "$tmp/stdin/3"

reset_log
HERDR_REMOTE_BASH='& "C:/Program Files/Git/bin/bash.exe"' \
    HERDR_REMOTE_APP_HOME='/c/Users/gdezan/herdr home' \
    "$repo/scripts/deploy-herdr-remote" iss >/dev/null
grep -q '^iss & "C:/Program Files/Git/bin/bash.exe" -c .mkdir -p ~/herdr-remote-deploy-' "$SSH_LOG"
grep -q 'HERDR_APP_HOME="/c/Users/gdezan/herdr home" bash scripts/deploy-herdr-config' "$SSH_LOG"

reset_log
if HERDR_REMOTE_APP_HOME="/c/Users/o'brien" "$repo/scripts/deploy-herdr-remote" iss >/dev/null 2>&1; then
    echo 'quoted app home unexpectedly succeeded' >&2; exit 1
fi
test ! -s "$SSH_LOG"

reset_log
if FAIL_DEPLOY=1 "$repo/scripts/deploy-herdr-remote" iss >/dev/null 2>&1; then
    echo 'failed remote deployment unexpectedly succeeded' >&2; exit 1
fi
test "$(wc -l < "$SSH_LOG")" -eq 4
tail -1 "$SSH_LOG" | grep -q '^iss bash -c .rm -rf ~/herdr-remote-deploy-'

incomplete="$tmp/incomplete"
mkdir -p "$incomplete/scripts" "$incomplete/herdr-app/layouts"
cp "$repo/scripts/deploy-herdr-remote" "$repo/scripts/deploy-herdr-config" "$incomplete/scripts/"
cp "$repo/herdr-app/layouts/gd.json" "$incomplete/herdr-app/layouts/"
reset_log
if "$incomplete/scripts/deploy-herdr-remote" iss >/dev/null 2>&1; then
    echo 'deployment from an incomplete repository unexpectedly succeeded' >&2; exit 1
fi
test ! -s "$SSH_LOG"

printf 'deploy-herdr-remote-test passed\n'
