update:
	rm {.psqlrc,.zshrc,.vimrc,.pspgconf,.gitconfig}
	cp ~/{.psqlrc,.zshrc,.vimrc,.pspgconf,.gitconfig} .
	git commit -a -m "update files"
	git push
