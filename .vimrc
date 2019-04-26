set nocompatible              " be iMproved, required
filetype off                  " required

" set the runtime path to include Vundle and initialize
set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()
" alternatively, pass a path where Vundle should install plugins
"call vundle#begin('~/some/path/here')

" let Vundle manage Vundle, required
Plugin 'gmarik/Vundle.vim'

" The following are examples of different formats supported.
" Keep Plugin commands between vundle#begin/end.
" plugin on GitHub repo
"Plugin 'tpope/vim-fugitive'
" plugin from http://vim-scripts.org/vim/scripts.html
"Plugin 'L9'
" Git plugin not hosted on GitHub
"Plugin 'git://git.wincent.com/command-t.git'
" git repos on your local machine (i.e. when working on your own plugin)
"Plugin 'file:///home/gmarik/path/to/plugin'
" The sparkup vim script is in a subdirectory of this repo called vim.
" Pass the path to set the runtimepath properly.
"Plugin 'rstacruz/sparkup', {'rtp': 'vim/'}
" Avoid a name conflict with L9
"Plugin 'user/L9', {'name': 'newL9'}

" All of your Plugins must be added before the following line
call vundle#end()            " required
filetype plugin indent on    " required
" To ignore plugin indent changes, instead use:
"filetype plugin on
"
" Brief help
" :PluginList       - lists configured plugins
" :PluginInstall    - installs plugins; append `!` to update or just :PluginUpdate
" :PluginSearch foo - searches for foo; append `!` to refresh local cache
" :PluginClean      - confirms removal of unused plugins; append `!` to auto-approve removal
"
" see :h vundle for more details or wiki for FAQ
" Put your non-Plugin stuff after this line

" Flake8 plugin
Plugin 'andviro/flake8-vim'
" Lightline plugin
Plugin 'itchyny/lightline.vim'
"Tagbar plugin
Plugin 'majutsushi/tagbar'
" gitgutter plugin
Plugin 'airblade/vim-gitgutter'
" Nerdcommmenter
Plugin 'scrooloose/nerdcommenter'
" Super tab
Plugin 'ervandew/supertab'
" CTRLP
Plugin 'kien/ctrlp.vim'
" FZF
"Plugin 'junegunn/fzf', { 'dir': '~/.fzf', 'do': './install --all' }
"Plugin 'junegunn/fzf.vim'
"map <C-p> :Files<CR>
" Python pep8 indent
Plugin 'hynek/vim-python-pep8-indent'
" Easy grep
Plugin 'dkprice/vim-easygrep'
" Grep Plugin
Plugin 'yegappan/grep'
" JS Plugin
Plugin 'pangloss/vim-javascript'
" JSX Plugin
Plugin 'maxmellon/vim-jsx-pretty'
" Surround
Plugin 'tpope/vim-surround'
" Emmet
Plugin 'mattn/emmet-vim'
" AutoClose
Plugin 'Raimondi/delimitMate'
" IndentLine
Plugin 'Yggdroot/indentLine'
" NerdTree
Plugin 'scrooloose/nerdtree'
map <C-o> :NERDTreeToggle<CR>
let NERDTreeMapOpenInTab='<ENTER>'

" Vim colors
Plugin 'altercation/vim-colors-solarized'
Plugin 'crater2150/vim-theme-chroma'
Plugin 'sentientmachine/Pretty-Vim-Python'
Plugin 'ayu-theme/ayu-vim'
" mojave
Plugin 'marcopaganini/mojave-vim-theme'
" mrkn256
Plugin 'mrkn/mrkn256.vim'
" Dracula
Plugin 'dracula/vim'
" Hybrid Material
Plugin 'kristijanhusak/vim-hybrid-material'
" Material
Plugin 'kaicataldo/material.vim'

"Previous config
set termguicolors
colorscheme material
let g:material_theme_style = 'dark'
let g:hybrid_transparent_background = 1
set ts=2
set fo=tcq
set sw=2
set ai
set wrapmargin=2
set ic
set ruler
set tildeop
set expandtab
set softtabstop=2
set visualbell
set shell=/bin/bash
set showcmd
set background=dark
set textwidth=76
set mouse=n
set backup
set smartcase
set hls
set noswapfile
set autoread
syn on
au BufEnter {Makefile,makefile}* set noexpandtab
au BufEnter *.cf set noexpandtab
au BufEnter *.{inc,content,html,php3,htm} source ~/.vim/html.vim
"au BufEnter *.* source ~/.vim/comment.vim
"au BufEnter *.* source ~/.vim/taglist.vim
autocmd BufWritePre *.{py,php,html,php3,content,htm} normal m`:%s/\s\+$//e ``
autocmd BufEnter,BufRead,BufNewFile *.py set tags=~/.pytags
set incsearch
set title
nnoremap <silent> <F8> :Tlist<CR>
let Tlist_Use_Horiz_Window = 0
let Tlist_WinHeight = 20
let g:miniBufExplSplitBelow=1

let spell_update_time = 1000
let spell_language_list = "english,pt_BR"
let spell_executable = "aspell"
let spell_insert_mode = 0


au BufEnter *.html* set softtabstop=2
au BufEnter *.html* set tabstop=2

set guifont=Monospace\ 7
"set guioptions=agirLt

set list listchars=tab:\|_,trail:$
highlight SpecialKey ctermfg=Red ctermbg=Yellow guibg=Yellow
au BufEnter *.diff highlight SpecialKey ctermfg=red ctermbg=red guibg=black


set encoding=utf-8
set termencoding=utf-8

" Bugzilla Bug 213
map <F5> i${terms.<ESC>ea}<ESC>
map <F6> i[% terms.<ESC>ea %]<ESC>
map <F7> i[% terms.<ESC>t a %]<ESC>

map <F8> o[% PROCESS global/variables.none.tmpl %]<ENTER><ESC>


" Save Last editing cursor position
"set viminfo='10,\"100,:20,%,n~/.viminfo
"au BufReadPost * if line("'\"") > 0|if line("'\"") <= line("$")|exe("norm '\"")|else|exe "norm $"|endif|endif

map <F4> o{% load i18n %}<ESC>
map <F5> i{% trans "<ESC>t<a" %}<ESC>
map <F6> i{% trans "<ESC>t{a" %}<ESC>
map <F7> i{% trans "<ESC>t"a" %}<ESC>
map <F8> i{% trans "<ESC>$a" %}<ESC>
"set paste


"Highlight current line
"hi CursorLine cterm=NONE ctermbg=darkgrey
set cursorline

"Show line number
set number

" Light line plugin configuration
set laststatus=2

let g:lightline = {
      \ 'colorscheme': 'powerline',
      \ }

" Tagbar plugin configuration
nmap <F12> :TagbarToggle<CR>

if !has('gui_running')
    set t_Co=256
endif


autocmd BufEnter psql.edit* set filetype=sql
autocmd BufEnter psql.edit* set nolist

"gitgutter config
highlight clear SignColumn
highlight GitGutterAdd ctermbg=black ctermfg=green
highlight GitGutterChange ctermbg=black ctermfg=blue
highlight GitGutterDelete ctermbg=black ctermfg=red
highlight GitGutterChangeDelete ctermbg=black ctermfg=yellow

" Indent Line Config
"let g:indentLine_char='|'
"let g:indentLine_setColors = 0
"let g:indentLine_setConceal = 1
"let g:indentLine_Faster = 1
"let g:indentLine_color_gui = "#212121"

"Right margin
"highlight ColorColumn ctermbg=Black
"set colorcolumn=80

" CtrlP config

" Selelection = top to bottom
let g:ctrlp_match_window = 'bottom,order:ttb,min:1,max:10,results:10'

" Open new file in vertical split
let g:ctrlp_open_new_file = 'v'

let mapleader = "\\"

" Grep Plugin
nnoremap <silent> <Leader>gg :Grep<CR>
nnoremap <silent> <Leader>gr :Rgrep<CR>
nnoremap <silent> <Leader>ge :Egrep<CR>
nnoremap <silent> <Leader>gb :Bgrep<CR>
nnoremap <silent> <Leader>gf :Fgrep<CR>

let g:Grep_Skip_Files='*.bak *~ *.pyc *.o *.obj *.uitest .noseids nosetests.xml'
let g:Grep_Skip_Dirs='.bzr .git .hg .vimprj .repo venv node_modules dist build'

" No smart indent
set nosmartindent

" Command remaps
:command WQ wq
:command Wq wq
:command W w
:command Q q
