.PHONY: shell-deploy shell-test herdr-deploy herdr-test

shell-deploy:
	./scripts/deploy-shell-config

herdr-deploy:
	./scripts/deploy-herdr-config

herdr-test:
	bash tests/deploy-herdr-test.sh
	node herdr-app/mods/agent-session-menu/session-menu.test.mjs
	node --experimental-vm-modules --test herdr-app/mods/session-history/*.test.mjs herdr-app/mods/source/*.test.mjs

shell-test:
	bash tests/deploy-shell-test.sh
	python3 tests/zsh-history-import-test.py
	bash tests/wsl-startup-test.sh
	bash tests/macos-shell-test.sh
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
