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
printf 'old t3 layout\n' > "$HERDR_APP_HOME/layouts/gd-t3.json"
mkdir -p "$HERDR_APP_HOME/mods/gd-t3-tabs" "$HERDR_APP_HOME/mods/atuin-threads"
printf '{"atuin":"/machine-local/atuin"}\n' > "$HERDR_APP_HOME/mods/atuin-threads/local.json"
printf 'old t3 mod\n' > "$HERDR_APP_HOME/mods/gd-t3-tabs/main.js"
printf 'old mod\n' > "$HERDR_APP_HOME/mods/agents-session/main.js"
printf 'local extra\n' > "$HERDR_APP_HOME/mods/agents-session/extra"
printf 'unrelated\n' > "$HERDR_APP_HOME/layouts/main.json"
printf 'state\n' > "$HERDR_APP_HOME/view.json"
printf 'personal keys\n' > "$HERDR_APP_HOME/keys.json"
"$repo/scripts/deploy-herdr-config"
cmp "$repo/herdr-app/layouts/gd.json" "$HERDR_APP_HOME/layouts/gd.json"
cmp "$repo/herdr-app/layouts/gd-t3.json" "$HERDR_APP_HOME/layouts/gd-t3.json"
cmp "$repo/herdr-app/layouts/gd-t3.svg" "$HERDR_APP_HOME/layouts/gd-t3.svg"
for mod in gd-t3-agents gd-t3-chrome gd-t3-focus gd-t3-new-menu gd-t3-pane gd-t3-spaces gd-t3-tabs; do
    cmp "$repo/herdr-app/mods/$mod/main.js" "$HERDR_APP_HOME/mods/$mod/main.js"
    cmp "$repo/herdr-app/mods/$mod/mod.json" "$HERDR_APP_HOME/mods/$mod/mod.json"
done
for mod in agents-session agent-session-menu usage-tabs provider-usage session-history menu-hc source atuin-threads; do
    cmp "$repo/herdr-app/mods/$mod/main.js" "$HERDR_APP_HOME/mods/$mod/main.js"
    cmp "$repo/herdr-app/mods/$mod/mod.json" "$HERDR_APP_HOME/mods/$mod/mod.json"
done
grep -qx '{"atuin":"/machine-local/atuin"}' "$HERDR_APP_HOME/mods/atuin-threads/local.json"
for file in threads.svg LICENSE; do
    cmp "$repo/herdr-app/mods/atuin-threads/$file" "$HERDR_APP_HOME/mods/atuin-threads/$file"
done
cmp "$repo/herdr-app/mods/menu-hc/copy.svg" "$HERDR_APP_HOME/mods/menu-hc/copy.svg"
for file in git.js panel.js dialogs.js ui.js diff.js highlight.js source.svg close.svg; do
    cmp "$repo/herdr-app/mods/source/$file" "$HERDR_APP_HOME/mods/source/$file"
done
cmp "$repo/herdr-app/mods/source/graph/graph.js" "$HERDR_APP_HOME/mods/source/graph/graph.js"
cmp "$repo/herdr-app/mods/source/graph/LICENSE" "$HERDR_APP_HOME/mods/source/graph/LICENSE"
test -f "$HERDR_APP_HOME/mods/session-history/node_modules/installed"
grep -qx unrelated "$HERDR_APP_HOME/layouts/main.json"
grep -qx state "$HERDR_APP_HOME/view.json"
grep -qx 'personal keys' "$HERDR_APP_HOME/keys.json"
backup=$(find "$HOME/.local/state/dotfiles-backups" -mindepth 1 -maxdepth 1 -type d -name 'herdr-*' -print -quit)
grep -qx 'old layout' "$backup/layouts/gd.json"
grep -qx 'old t3 layout' "$backup/layouts/gd-t3.json"
grep -qx 'old t3 mod' "$backup/mods/gd-t3-tabs/main.js"
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
"$incomplete/scripts/deploy-herdr-config" --check-only >/dev/null
if "$incomplete/scripts/deploy-herdr-config" --bogus >/dev/null 2>&1; then
    echo 'unknown argument unexpectedly succeeded' >&2; exit 1
fi
"$incomplete/scripts/deploy-herdr-config"
test ! -e "$HERDR_APP_HOME/mods/usage-tabs/gpui-kit.d.ts"
test ! -e "$HERDR_APP_HOME/mods/usage-tabs/jsconfig.json"
rm "$incomplete/herdr-app/layouts/gd-t3.json"
if "$incomplete/scripts/deploy-herdr-config" --check-only >/dev/null 2>&1; then
    echo 'missing T3 layout check unexpectedly succeeded' >&2; exit 1
fi
cp "$repo/herdr-app/layouts/gd-t3.json" "$incomplete/herdr-app/layouts/gd-t3.json"
rm "$incomplete/herdr-app/mods/gd-t3-pane/zoom.svg"
if "$incomplete/scripts/deploy-herdr-config" --check-only >/dev/null 2>&1; then
    echo 'incomplete T3 asset check unexpectedly succeeded' >&2; exit 1
fi
cp "$repo/herdr-app/mods/gd-t3-pane/zoom.svg" "$incomplete/herdr-app/mods/gd-t3-pane/zoom.svg"
rm "$incomplete/herdr-app/mods/source/graph/graph.js"
if "$incomplete/scripts/deploy-herdr-config" --check-only >/dev/null 2>&1; then
    echo 'missing Source graph unexpectedly succeeded' >&2; exit 1
fi
cp "$repo/herdr-app/mods/source/graph/graph.js" "$incomplete/herdr-app/mods/source/graph/graph.js"
rm "$incomplete/herdr-app/mods/source/git.js"
if "$incomplete/scripts/deploy-herdr-config" --check-only >/dev/null 2>&1; then
    echo 'incomplete check unexpectedly succeeded' >&2; exit 1
fi
printf 'keep layout\n' > "$HERDR_APP_HOME/layouts/gd.json"
if "$incomplete/scripts/deploy-herdr-config" >/dev/null 2>&1; then
    echo 'deployment without Source backend unexpectedly succeeded' >&2; exit 1
fi
grep -qx 'keep layout' "$HERDR_APP_HOME/layouts/gd.json"
cp "$repo/herdr-app/mods/source/git.js" "$incomplete/herdr-app/mods/source/git.js"
rm "$incomplete/herdr-app/mods/provider-usage/main.js"
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
