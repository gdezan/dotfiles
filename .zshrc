export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME=spaceship
HIST_STAMPS=dd.mm.yyyy
SPACESHIP_PACKAGE_SHOW=false
SPACESHIP_BATTERY_SHOW=false
SPACESHIP_DOCKER_SHOW=false
SPACESHIP_DIR_TRUNC_REPO=false
plugins=(git zsh-syntax-highlighting)
[[ -d "$HOME/.grok/completions/zsh" ]] && fpath=("$HOME/.grok/completions/zsh" $fpath)
[[ -f "$ZSH/oh-my-zsh.sh" ]] && source "$ZSH/oh-my-zsh.sh"

export EDITOR=vim VISUAL=vim
export LESS="-F -X $LESS"
typeset -U path
for directory in "$HOME/.local/bin" "$HOME/.cargo/bin" "$HOME/.deno/bin" "$HOME/.bun/bin" "$HOME/.grok/bin" "$HOME/.opencode/bin" "$HOME/.fzf/bin"; do
  [[ -d "$directory" ]] && path=("$directory" $path)
done
export PNPM_HOME="$HOME/.local/share/pnpm"
[[ -d "$PNPM_HOME" ]] && path=("$PNPM_HOME" $path)

export NVM_DIR="$HOME/.nvm"
if ! (( $+functions[nvm] )) && [[ -s "$NVM_DIR/nvm.sh" ]]; then
  source "$NVM_DIR/nvm.sh"
fi

if [[ -n "$WSL_DISTRO_NAME" || "$(uname -r)" == *[Mm]icrosoft* ]]; then
  export BROWSER=wslview
  export ANDROID_ADB_SERVER_ADDRESS=172.19.128.1 ANDROID_ADB_SERVER_PORT=5037
  export ADB_SERVER_SOCKET="tcp:${ANDROID_ADB_SERVER_ADDRESS}:${ANDROID_ADB_SERVER_PORT}"
elif [[ "$HOST" == artemis ]]; then
  export ANDROID_HOME="$HOME/Android/sdk"
  [[ -d "$ANDROID_HOME/platform-tools" ]] && path=("$ANDROID_HOME/platform-tools" $path)
  if [[ -d "$HOME/.local/opt/jdk-17.0.2" ]]; then
    export JAVA_HOME="$HOME/.local/opt/jdk-17.0.2"
    path=("$JAVA_HOME/bin" $path)
  fi
  export PLANNOTATOR_URL_HOST=auto PLANNOTATOR_REMOTE=1
  [[ -n "$HERDR_ENV" && -z "$SSH_CONNECTION" ]] && export SSH_CONNECTION='herdr-client 0 artemis 0'
  (( $+functions[nvm] )) && nvm use --silent default
  [[ -d "$HOME/.local/opt/pnpm/12.4.1/bin" ]] && path=("$HOME/.local/opt/pnpm/12.4.1/bin" $path)
fi

if (( $+commands[eza] )); then
  alias ls='eza -al --color=always --group-directories-first --icons=always'
  alias la='eza -a --color=always --group-directories-first --icons=always'
  alias ll='eza -l --color=always --group-directories-first --icons=always'
  alias lt='eza -aT --color=always --group-directories-first --icons=always'
fi
alias vi=vim
alias gti=git
alias cdd='cd ~/Dev'
alias vimconfig='vim ~/.vimrc'
[[ -f "$HOME/.fzf.zsh" ]] && source "$HOME/.fzf.zsh"
[[ -s "$HOME/.bun/_bun" ]] && source "$HOME/.bun/_bun"
