set nocompatible              " be iMproved, required
filetype off                  " required

" set the runtime path to include Vundle and initialize
set rtp+=~/.vim/bundle/Vundle.vim
call vundle#begin()

" Remove trailing whitespace on save
autocmd BufWritePre * %s/\s\+$//e

" let Vundle manage Vundle, required
Plugin 'gmarik/Vundle.vim'

" All of your Plugins must be added before the following line
call vundle#end()            " required
filetype plugin indent on    " required

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
" CTRLP
Plugin 'kien/ctrlp.vim'

" VimTex
Plugin 'lervag/vimtex'
let g:tex_flavor='latex'
let g:vimtex_view_method='zathura'
let g:vimtex_quickfix_mode=0
set conceallevel=1
let g:tex_conceal='abdmg'

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

" UltiSnips
" Track the engine.
Plugin 'SirVer/ultisnips'
" Snippets are separated from the engine. Add this if you want them:
Plugin 'honza/vim-snippets'
" Trigger configuration. Do not use <tab> if you use https://github.com/Valloric/YouCompleteMe.
let g:UltiSnipsExpandTrigger="<tab>"
let g:UltiSnipsJumpForwardTrigger="<c-b>"
let g:UltiSnipsJumpBackwardTrigger="<c-z>"
" If you want :UltiSnipsEdit to split your window.
let g:UltiSnipsEditSplit="vertical"

" Vim colors
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
" Nord
Plugin 'arcticicestudio/nord-vim'

"Previous config
set termguicolors
colorscheme nord
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
"set visualbell
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
      \ 'colorscheme': 'nord',
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
