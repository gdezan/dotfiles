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
export PATH=$HOME/bin:/usr/local/bin:$PATH
export PATH=$HOME/.local/bin:$PATH
export PATH=$HOME/Devel/flutter/bin:$PATH
export VISUAL="vim"

# Tell less not to paginate if less than a page
export LESS="-F -X $LESS"

# Stoq aliases
alias cds="cd ~/Devel/stoq"
alias cdsm="cd ~/Devel/stoq/stoq-mobile-pos"
alias cdss="cd ~/Devel/stoq/stoq-server"
alias cdsl="cd ~/Devel/stoq/stoq-web/stoq-link"
alias cdsp="cd ~/Devel/stoq/stoq-link-premium"
alias cdsa="cd ~/Devel/stoq/stoq-link-admin"
alias cdspp="cd ~/Devel/stoq/stoq-plugin-passbook"
alias cdspl="cd ~/Devel/stoq/stoq-plugin-link"
alias stoq3="source ~/.stoq3/stoq3/bin/activate && source ~/Devel/stoq/stoq/utils/env.sh"
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
alias vi="vim"
alias zshconfig="vi ~/.zshrc"
alias szsh="source ~/.zshrc"
alias vimconfig="vi ~/.vimrc"
alias env=". env/bin/activate"
alias cdd="cd ~/Devel"

# NVM Loading
#export NVM_DIR="$HOME/.nvm"
#[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
#[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
