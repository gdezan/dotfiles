#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export HOME="$tmp/home"
export HERDR_APP_HOME="$tmp/herdr home"
mkdir -p "$HERDR_APP_HOME/layouts" "$HERDR_APP_HOME/mods/agents-session" "$HOME" "$tmp/bin"
cat > "$tmp/bin/npm" <<'EOF'
#!/usr/bin/env bash
set -e
if [[ ${FAIL_NPM:-0} == 1 ]]; then exit 1; fi
mkdir -p node_modules
printf installed > node_modules/installed
EOF
chmod +x "$tmp/bin/npm"
export PATH="$tmp/bin:$PATH"
printf 'old layout\n' > "$HERDR_APP_HOME/layouts/gd.json"
printf 'old mod\n' > "$HERDR_APP_HOME/mods/agents-session/main.js"
printf 'local extra\n' > "$HERDR_APP_HOME/mods/agents-session/extra"
printf 'unrelated\n' > "$HERDR_APP_HOME/layouts/main.json"
printf 'state\n' > "$HERDR_APP_HOME/view.json"
"$repo/scripts/deploy-herdr-config"
cmp "$repo/herdr-app/layouts/gd.json" "$HERDR_APP_HOME/layouts/gd.json"
for mod in agents-session agent-session-menu usage-tabs provider-usage session-history menu-hc; do
    cmp "$repo/herdr-app/mods/$mod/main.js" "$HERDR_APP_HOME/mods/$mod/main.js"
    cmp "$repo/herdr-app/mods/$mod/mod.json" "$HERDR_APP_HOME/mods/$mod/mod.json"
done
cmp "$repo/herdr-app/mods/menu-hc/copy.svg" "$HERDR_APP_HOME/mods/menu-hc/copy.svg"
test -f "$HERDR_APP_HOME/mods/session-history/node_modules/installed"
grep -qx unrelated "$HERDR_APP_HOME/layouts/main.json"
grep -qx state "$HERDR_APP_HOME/view.json"
backup=$(find "$HOME/.local/state/dotfiles-backups" -mindepth 1 -maxdepth 1 -type d -name 'herdr-*' -print -quit)
grep -qx 'old layout' "$backup/layouts/gd.json"
grep -qx 'old mod' "$backup/mods/agents-session/main.js"
grep -qx 'local extra' "$backup/mods/agents-session/extra"
test ! -e "$HERDR_APP_HOME/mods/agents-session/extra"
"$repo/scripts/deploy-herdr-config"

incomplete="$tmp/incomplete"
mkdir -p "$incomplete/scripts" "$incomplete/herdr-app"
cp "$repo/scripts/deploy-herdr-config" "$incomplete/scripts/"
cp -R "$repo/herdr-app/." "$incomplete/herdr-app/"
printf 'generated\n' > "$incomplete/herdr-app/mods/usage-tabs/gpui-kit.d.ts"
printf 'generated\n' > "$incomplete/herdr-app/mods/usage-tabs/jsconfig.json"
"$incomplete/scripts/deploy-herdr-config"
test ! -e "$HERDR_APP_HOME/mods/usage-tabs/gpui-kit.d.ts"
test ! -e "$HERDR_APP_HOME/mods/usage-tabs/jsconfig.json"
rm "$incomplete/herdr-app/mods/provider-usage/main.js"
printf 'keep layout\n' > "$HERDR_APP_HOME/layouts/gd.json"
if "$incomplete/scripts/deploy-herdr-config" >/dev/null 2>&1; then
    echo 'incomplete deployment unexpectedly succeeded' >&2; exit 1
fi
grep -qx 'keep layout' "$HERDR_APP_HOME/layouts/gd.json"

if FAIL_NPM=1 "$repo/scripts/deploy-herdr-config" >/dev/null 2>&1; then
    echo 'deployment with failed dependency installation unexpectedly succeeded' >&2; exit 1
fi
grep -qx 'keep layout' "$HERDR_APP_HOME/layouts/gd.json"

mkdir "$tmp/external"
printf 'external\n' > "$tmp/external/main.js"
rm -rf "$HERDR_APP_HOME/mods/usage-tabs"
if ln -s "$tmp/external" "$HERDR_APP_HOME/mods/usage-tabs" && [[ -L "$HERDR_APP_HOME/mods/usage-tabs" ]]; then
    "$repo/scripts/deploy-herdr-config"
    grep -qx external "$tmp/external/main.js"
    test ! -L "$HERDR_APP_HOME/mods/usage-tabs"
    backup=$(find "$HOME/.local/state/dotfiles-backups" -type l -path '*/mods/usage-tabs' -print -quit)
    test -n "$backup"

    rm -rf "$HERDR_APP_HOME/mods"
    ln -s "$tmp/external" "$HERDR_APP_HOME/mods"
    printf 'keep layout\n' > "$HERDR_APP_HOME/layouts/gd.json"
    if "$repo/scripts/deploy-herdr-config" >/dev/null 2>&1; then
        echo 'symlinked mods parent unexpectedly succeeded' >&2; exit 1
    fi
    grep -qx 'keep layout' "$HERDR_APP_HOME/layouts/gd.json"
else
    printf 'Real symlinks unavailable; symlink checks skipped\n'
fi
printf 'deploy-herdr-test passed\n'
