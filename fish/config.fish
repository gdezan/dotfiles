set -l is_macos 0
if test (uname -s) = Darwin
    set is_macos 1
    fish_add_path --path /opt/homebrew/bin /opt/homebrew/sbin
end

set -gx EDITOR vim
set -gx VISUAL vim
set -gx LESS "-F -X $LESS"

fish_add_path --path ~/.local/bin ~/.cargo/bin ~/.deno/bin ~/.bun/bin ~/.grok/bin ~/.opencode/bin ~/.fzf/bin
set -gx PNPM_HOME "$HOME/.local/share/pnpm"
fish_add_path --path "$PNPM_HOME"
if test "$is_macos" = 1
    fish_add_path --path /opt/homebrew/opt/fzf/bin
end

if not set -q SSH_AUTH_SOCK; and set -q XDG_RUNTIME_DIR; and test -S "$XDG_RUNTIME_DIR/shell-ssh-agent.sock"
    set -gx SSH_AUTH_SOCK "$XDG_RUNTIME_DIR/shell-ssh-agent.sock"
end

set -l is_wsl 0
if set -q WSL_DISTRO_NAME; or string match -qi '*microsoft*' (uname -r)
    set is_wsl 1
end

if test "$is_wsl" = 1
    set -gx ANDROID_ADB_SERVER_ADDRESS 172.19.128.1
    set -gx ANDROID_ADB_SERVER_PORT 5037
    set -gx ADB_SERVER_SOCKET "tcp:$ANDROID_ADB_SERVER_ADDRESS:$ANDROID_ADB_SERVER_PORT"
else if test (hostname) = artemis
    set -gx ANDROID_HOME "$HOME/Android/sdk"
    fish_add_path --path "$ANDROID_HOME/platform-tools" "$HOME/.local/opt/pnpm/12.4.1/bin"
    if test -d "$HOME/.local/opt/jdk-17.0.2"
        set -gx JAVA_HOME "$HOME/.local/opt/jdk-17.0.2"
        fish_add_path --path "$JAVA_HOME/bin"
    end
    set -gx PLANNOTATOR_URL_HOST auto
    set -gx PLANNOTATOR_REMOTE 1
end

if command -q fnm
    if status is-interactive
        fnm env --use-on-cd --version-file-strategy recursive --resolve-engines=false --shell fish | source
    else if test "$is_wsl" = 1; or test "$is_macos" = 1
        fnm env --shell fish | source
    end
end

if status is-interactive
    if set -q HERDR_ENV; and not set -q SSH_CONNECTION; and test (hostname) = artemis
        set -gx SSH_CONNECTION 'herdr-client 0 artemis 0'
    end

    function fish_greeting
    end

    if command -q eza
        alias ls 'eza -al --color=always --group-directories-first --icons=always'
        alias la 'eza -a --color=always --group-directories-first --icons=always'
        alias ll 'eza -l --color=always --group-directories-first --icons=always'
        alias lt 'eza -aT --color=always --group-directories-first --icons=always'
    end
    alias vi vim
    alias gti git
    alias cdd 'cd ~/Dev'

    if command -q fzf
        fzf --fish | source
    end
    if command -q starship
        function __starship_update_gcloud --on-variable PWD
            switch $PWD
                case "$HOME/Dev/skipify" "$HOME/Dev/skipify/*"
                    set -gx STARSHIP_SHOW_GCLOUD 1
                case '*'
                    set -e STARSHIP_SHOW_GCLOUD
            end
        end
        __starship_update_gcloud
        starship init fish | source
    end
end

if test "$is_macos" = 1; and test -f "$HOME/.config/fish/local-macos.fish"
    source "$HOME/.config/fish/local-macos.fish"
end
