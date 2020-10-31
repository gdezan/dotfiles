# Path to your oh-my-zsh installation.
export ZSH=$HOME/.oh-my-zsh

ZSH_THEME="spaceship"
#ZSH_THEME="powerline9k"

# Time stamp in history command output.
# You can set one of the optional three formats:
# "mm/dd/yyyy"|"dd.mm.yyyy"|"yyyy-mm-dd"
# or set a custom format using the strftime function format specifications,
# see 'man strftime' for details.
 HIST_STAMPS="dd.mm.yyyy"

# Auto-start SSH-Agent
if ! pgrep -u "$USER" ssh-agent > /dev/null; then
    ssh-agent > ~/.ssh-agent-thing
fi
if [[ ! "$SSH_AUTH_SOCK" ]]; then
    eval "$(<~/.ssh-agent-thing)"  > /dev/null
fi

# Standard plugins can be found in ~/.oh-my-zsh/plugins/*
# Custom plugins may be added to ~/.oh-my-zsh/custom/plugins/
plugins=(
  git
  zsh-syntax-highlighting
)

export PATH=/usr/local/lib/node_modules:$PATH
export PATH=$HOME/Dev/bin:/usr/local/bin:$PATH
export PATH=$HOME/.local/bin:$PATH
export PATH=$HOME/Dev/flutter/bin:$PATH
export VISUAL="vim"

# Tell less not to paginate if less than a page
export LESS="-F -X $LESS"

# Stoq aliases
alias cds="cd ~/Dev/stoq"
alias cdsm="cd ~/Dev/stoq/stoq-mobile-pos"
alias cdss="cd ~/Dev/stoq/stoq-server"
alias cdsl="cd ~/Dev/stoq/stoq-web/stoq-link"
alias cdsp="cd ~/Dev/stoq/stoq-link-premium"
alias cdsa="cd ~/Dev/stoq/stoq-link-admin"
alias cdspp="cd ~/Dev/stoq/stoq-plugin-passbook"
alias cdspl="cd ~/Dev/stoq/stoq-plugin-link"
alias cdcp="cd ~/Dev/stoq/contactless-payment"
alias stoq3="source ~/.stoq3/stoq3/bin/activate && source ~/Dev/stoq/stoq/utils/env.sh"
alias stoqconf="vim ~/.stoq/stoq.conf"
alias venv2="source ~/.venv2/bin/activate"

# 'Fuck' alias
 eval $(thefuck --alias)
 # You can use whatever you want as an alias, like for Mondays:
 eval $(thefuck --alias FUCK)

#source ~/.fonts/*.sh

# Spaceship config
#SPACESHIP_GIT_STATUS_COLOR=109
#SPACESHIP_DIR_COLOR=208
SPACESHIP_PACKAGE_SHOW=false
SPACESHIP_BATTERY_SHOW=false
SPACESHIP_GIT_PREFIX=
SPACESHIP_NODE_PREFIX=
SPACESHIP_DIR_TRUNC_REPO=false
source $ZSH/oh-my-zsh.sh

# Powerlevel config
#POWERLEVEL9K_LEFT_PROMPT_ELEMENTS=(context dir vcs)
#POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS=()
#POWERLEVEL9K_MODE="awesome-patched"
#POWERLEVEL9K_HOME_SUB_ICON=$'\UE18D '
#POWERLEVEL9K_FOLDER_ICON=$'\uE818 '

# User configuration
# export MANPATH="/usr/local/man:$MANPATH"

# Extra aliases
alias ls="lsd"
alias vi="vim"
alias zshconfig="vi ~/.zshrc"
alias szsh="source ~/.zshrc"
alias vimconfig="vi ~/.vimrc"
alias env=". env/bin/activate"
alias cdd="cd ~/Dev"
alias loadnvm='[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"'

BROWSER=chromium

# NVM Loading
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# JDK setup
export JAVA_HOME="/home/gdezan/Extra/jdk-14.0.2"
export PATH=$JAVA_HOME/bin:$PATH
