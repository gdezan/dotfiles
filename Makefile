.PHONY: shell-deploy shell-test

shell-deploy:
	./scripts/deploy-shell-config

shell-test:
	bash tests/deploy-shell-test.sh
	python3 tests/zsh-history-import-test.py
	bash tests/wsl-startup-test.sh
	fish -n fish/config.fish
	zsh -n .zshrc
	zsh -n zsh/zshenv

push:
	rm {.psqlrc,.zshrc,.vimrc,.pspgconf,.gitconfig}
	cp ~/{.psqlrc,.zshrc,.vimrc,.pspgconf,.gitconfig} .
	git commit -a -m "update files"
	git push

update:
	rm ~/{.psqlrc,.zshrc,.vimrc,.pspgconf,.gitconfig}
	cp {.psqlrc,.zshrc,.vimrc,.pspgconf,.gitconfig} ~/.
